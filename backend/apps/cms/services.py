"""CMS business rules: page versioning and publication, menus, blog, newsletter.

Views stay thin: they validate input with serializers and call these functions,
which run inside transactions and lock the rows they change.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone

from apps.audit import services as audit
from common.exceptions import ConflictError, DomainError

from .models import BlogPost, Menu, MenuItem, NewsletterSubscriber, Page, PageVersion, SiteSettings

PAGE_CONTENT_FIELDS = ("title", "sections", "meta_title", "meta_description", "canonical_url", "og_image", "noindex")


# --- Pages -------------------------------------------------------------------


def _locked(page: Page) -> Page:
    return Page.objects.select_for_update().get(pk=page.pk)


def latest_version(page: Page) -> PageVersion | None:
    return page.versions.order_by("-number").first()


def _snapshot_matches(version: PageVersion | None, page: Page) -> bool:
    return (
        version is not None
        and version.title == page.title
        and version.sections == page.sections
        and version.seo == page.seo_snapshot()
    )


def _create_version(page: Page, *, actor, note: str = "") -> PageVersion:
    number = (page.versions.aggregate(n=Max("number"))["n"] or 0) + 1
    return PageVersion.objects.create(
        page=page,
        number=number,
        title=page.title,
        sections=page.sections,
        seo=page.seo_snapshot(),
        note=note[:200],
        created_by=actor,
    )


@transaction.atomic
def create_page(*, data: dict, actor) -> Page:
    page = Page(created_by=actor, updated_by=actor)
    for key, value in data.items():
        setattr(page, key, value)
    try:
        with transaction.atomic():
            page.save()
    except IntegrityError as exc:
        raise ConflictError("A page with this slug already exists.", code="slug_taken") from exc
    _create_version(page, actor=actor, note="Created")
    return page


@transaction.atomic
def update_page(page: Page, *, data: dict, actor, note: str = "") -> Page:
    """Save the draft. A new version is recorded only when the content changed;
    the published version is untouched until the page is published again."""
    page = _locked(page)
    for key, value in data.items():
        setattr(page, key, value)
    page.updated_by = actor
    try:
        with transaction.atomic():
            page.save()
    except IntegrityError as exc:
        raise ConflictError("A page with this slug already exists.", code="slug_taken") from exc
    if not _snapshot_matches(latest_version(page), page):
        _create_version(page, actor=actor, note=note)
    return page


def _version_for(page: Page, number: int | None) -> PageVersion:
    if number is None:
        version = latest_version(page)
    else:
        version = page.versions.filter(number=number).first()
    if version is None:
        raise DomainError("That version does not exist.", code="version_not_found", status_code=404)
    return version


def _validate_publishable(version: PageVersion):
    if not version.sections:
        raise DomainError("Add at least one section before publishing.", code="page_empty")


@transaction.atomic
def publish_page(page: Page, *, actor, request=None, version_number: int | None = None) -> Page:
    page = _locked(page)
    version = _version_for(page, version_number)
    _validate_publishable(version)
    page.published_version = version
    page.status = Page.Status.PUBLISHED
    page.published_at = page.published_at or timezone.now()
    page.scheduled_for = None
    page.scheduled_version = None
    page.updated_by = actor
    page.save()
    audit.record("cms.page_published", actor=actor, target=page, request=request, version=version.number)
    return page


@transaction.atomic
def schedule_page(page: Page, *, publish_at, actor, request=None, version_number: int | None = None) -> Page:
    if publish_at <= timezone.now():
        raise DomainError("Choose a time in the future.", code="schedule_in_past")
    page = _locked(page)
    if page.status == Page.Status.ARCHIVED:
        raise DomainError("Restore the page from the archive before scheduling it.", code="page_archived")
    version = _version_for(page, version_number)
    _validate_publishable(version)
    page.scheduled_version = version
    page.scheduled_for = publish_at
    page.updated_by = actor
    page.save()
    audit.record(
        "cms.page_scheduled",
        actor=actor,
        target=page,
        request=request,
        version=version.number,
        publish_at=publish_at.isoformat(),
    )
    return page


@transaction.atomic
def cancel_schedule(page: Page, *, actor, request=None) -> Page:
    page = _locked(page)
    if page.scheduled_for is None:
        return page
    page.scheduled_for = None
    page.scheduled_version = None
    page.updated_by = actor
    page.save()
    audit.record("cms.page_schedule_cancelled", actor=actor, target=page, request=request)
    return page


def publish_due_pages(now=None) -> int:
    """Publish every page whose scheduled time has passed. Safe to run
    concurrently: rows are locked and skipped if another worker holds them."""
    now = now or timezone.now()
    published = 0
    while True:
        with transaction.atomic():
            page = (
                Page.objects.select_for_update(skip_locked=True)
                .filter(scheduled_for__lte=now, scheduled_version__isnull=False)
                .order_by("scheduled_for")
                .first()
            )
            if page is None:
                return published
            version = page.scheduled_version
            page.published_version = version
            page.status = Page.Status.PUBLISHED
            page.published_at = page.published_at or now
            page.scheduled_for = None
            page.scheduled_version = None
            page.save()
            audit.record("cms.page_published", target=page, version=version.number, scheduled=True)
            published += 1


@transaction.atomic
def set_home_page(page: Page, *, actor, request=None) -> Page:
    """Only a published page can become the home page, so the site never loses its home."""
    page = _locked(page)
    if page.status != Page.Status.PUBLISHED:
        raise DomainError("Publish the page before making it the home page.", code="page_not_published")
    Page.objects.filter(is_home=True).exclude(pk=page.pk).update(is_home=False)
    page.is_home = True
    page.updated_by = actor
    page.save()
    audit.record("cms.home_page_changed", actor=actor, target=page, request=request)
    return page


@transaction.atomic
def unpublish_page(page: Page, *, actor, request=None, archive: bool = False) -> Page:
    page = _locked(page)
    if page.is_home:
        raise DomainError(
            "The home page must stay published. Make another page the home page first.", code="page_is_home"
        )
    page.status = Page.Status.ARCHIVED if archive else Page.Status.DRAFT
    page.published_version = None
    page.scheduled_for = None
    page.scheduled_version = None
    page.updated_by = actor
    page.save()
    audit.record("cms.page_archived" if archive else "cms.page_unpublished", actor=actor, target=page, request=request)
    return page


@transaction.atomic
def restore_from_archive(page: Page, *, actor, request=None) -> Page:
    page = _locked(page)
    if page.status != Page.Status.ARCHIVED:
        return page
    page.status = Page.Status.DRAFT
    page.updated_by = actor
    page.save()
    audit.record("cms.page_unarchived", actor=actor, target=page, request=request)
    return page


@transaction.atomic
def restore_version(page: Page, *, number: int, actor, request=None) -> Page:
    """Copy an old version into the draft (recorded as a new version)."""
    page = _locked(page)
    version = _version_for(page, number)
    page.title = version.title
    page.sections = version.sections
    seo = version.seo or {}
    page.meta_title = seo.get("meta_title", "")
    page.meta_description = seo.get("meta_description", "")
    page.canonical_url = seo.get("canonical_url", "")
    from .models import MediaAsset

    og = seo.get("og_image")
    page.og_image_id = og if og and MediaAsset.objects.filter(pk=og).exists() else None
    page.noindex = bool(seo.get("noindex", False))
    page.updated_by = actor
    page.save()
    _create_version(page, actor=actor, note=f"Restored from version {version.number}")
    audit.record("cms.page_version_restored", actor=actor, target=page, request=request, version=version.number)
    return page


@transaction.atomic
def duplicate_page(page: Page, *, actor) -> Page:
    base = f"{page.slug}-copy"[:110]
    slug, n = base, 2
    while Page.objects.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    data = {f: getattr(page, f) for f in PAGE_CONTENT_FIELDS}
    data.update(title=f"{page.title} (copy)"[:200], slug=slug)
    return create_page(data=data, actor=actor)


@transaction.atomic
def delete_page(page: Page, *, actor, request=None):
    page = _locked(page)
    if page.is_home:
        raise DomainError("The home page cannot be deleted. Choose another home page first.", code="page_is_home")
    if page.status == Page.Status.PUBLISHED:
        raise DomainError("Unpublish the page before deleting it.", code="page_published")
    audit.record("cms.page_deleted", actor=actor, target=page, request=request, slug=page.slug)
    page.delete()


# --- Site settings ------------------------------------------------------------


@transaction.atomic
def update_site_settings(*, data: dict, actor, request=None) -> SiteSettings:
    obj = SiteSettings.load()
    obj = SiteSettings.objects.select_for_update().get(pk=obj.pk)
    for key, value in data.items():
        setattr(obj, key, value)
    obj.updated_by = actor
    obj.save()
    audit.record("cms.site_settings_updated", actor=actor, target=obj, request=request, fields=sorted(data))
    return obj


# --- Menus ---------------------------------------------------------------------

MAX_MENU_ITEMS = 60


@transaction.atomic
def replace_menu(location: str, *, title: str, items: list[dict], actor, request=None) -> Menu:
    """Replace a menu's whole item tree (two levels) in one transaction."""
    menu, _ = Menu.objects.select_for_update().get_or_create(location=location)
    menu.title = title
    menu.save()
    menu.items.all().delete()

    def create(entries, parent=None):
        for position, entry in enumerate(entries):
            children = entry.pop("children", [])
            item = MenuItem.objects.create(menu=menu, parent=parent, position=position, **entry)
            if children:
                create(children, parent=item)

    create(items)
    audit.record("cms.menu_updated", actor=actor, target=menu, request=request, items=menu.items.count())
    return menu


# --- Blog ------------------------------------------------------------------------


@transaction.atomic
def publish_post(post: BlogPost, *, actor, request=None, publish_at=None) -> BlogPost:
    post = BlogPost.objects.select_for_update().get(pk=post.pk)
    if not post.body.strip():
        raise DomainError("Write the post before publishing it.", code="post_empty")
    post.status = BlogPost.Status.PUBLISHED
    now = timezone.now()
    if publish_at:
        post.published_at = publish_at
    elif not post.published_at or post.published_at > now:
        # Keep the original date when republishing, but never revive an old
        # schedule: publishing without a date means "now".
        post.published_at = now
    post.updated_by = actor
    post.save()
    audit.record(
        "cms.post_published", actor=actor, target=post, request=request, publish_at=post.published_at.isoformat()
    )
    return post


@transaction.atomic
def unpublish_post(post: BlogPost, *, actor, request=None, archive: bool = False) -> BlogPost:
    post = BlogPost.objects.select_for_update().get(pk=post.pk)
    post.status = BlogPost.Status.ARCHIVED if archive else BlogPost.Status.DRAFT
    post.updated_by = actor
    post.save()
    audit.record("cms.post_archived" if archive else "cms.post_unpublished", actor=actor, target=post, request=request)
    return post


# --- Newsletter ------------------------------------------------------------------


def subscribe(email: str, *, source: str = "") -> None:
    """Idempotent; the caller always gets the same response so subscription
    status is not revealed."""
    email = email.strip().lower()
    with transaction.atomic():
        sub = NewsletterSubscriber.objects.select_for_update().filter(email__iexact=email).first()
        if sub is None:
            try:
                with transaction.atomic():
                    NewsletterSubscriber.objects.create(email=email, source=source[:200])
            except IntegrityError:
                pass  # concurrent signup for the same address
        elif sub.unsubscribed_at is not None:
            sub.unsubscribed_at = None
            sub.consented_at = timezone.now()
            sub.source = source[:200]
            sub.save()
