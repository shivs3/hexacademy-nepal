"""CMS domain: pages with version history, site settings, menus, media, blog.

Publishing model: a Page holds the editable *draft* (title, sections, SEO).
Every save writes an immutable PageVersion; publishing points
``Page.published_version`` at one of them. Public APIs only ever read the
published version, so editing a live page never leaks unpublished content.
"""

import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from common.models import TimeStampedModel


def media_upload_to(instance: "MediaAsset", filename: str) -> str:
    # Storage keys are random; the client-supplied name is kept only as metadata.
    ext = PurePosixPath(filename).suffix.lower()[:10]
    now = timezone.now()
    return f"cms/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{ext}"


class MediaAsset(TimeStampedModel):
    class Kind(models.TextChoices):
        IMAGE = "image", "Image"
        DOCUMENT = "document", "Document"

    file = models.FileField(upload_to=media_upload_to, max_length=255)
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    original_name = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    size_bytes = models.PositiveBigIntegerField()
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    checksum_sha256 = models.CharField(max_length=64, db_index=True)
    title = models.CharField(max_length=200, blank=True)
    alt_text = models.CharField(max_length=300, blank=True, help_text="Describe the image for screen readers.")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        permissions = [("manage_media", "Can upload, edit and delete media library files")]

    def __str__(self):
        return self.title or self.original_name

    @property
    def url(self) -> str:
        return self.file.url if self.file else ""


class SeoFields(models.Model):
    meta_title = models.CharField(max_length=70, blank=True)
    meta_description = models.CharField(max_length=170, blank=True)
    canonical_url = models.URLField(max_length=500, blank=True)
    og_image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    noindex = models.BooleanField(default=False, help_text="Ask search engines not to index this content.")

    class Meta:
        abstract = True


class SiteSettings(models.Model):
    """Singleton (id=1) with branding, contact details, SEO defaults and banners."""

    site_name = models.CharField(max_length=100, default="Hexacademy Nepal")
    tagline = models.CharField(max_length=200, blank=True)
    logo = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    logo_inverted = models.ForeignKey(
        MediaAsset,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="Variant for dark backgrounds (footer, sidebar).",
    )
    favicon = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    color_primary = models.CharField(max_length=7, default="#102A43")
    color_accent = models.CharField(max_length=7, default="#0A8BA7")
    color_secondary = models.CharField(max_length=7, default="#14B8A6")

    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=300, blank=True)
    social_links = models.JSONField(default=list, blank=True)  # [{"platform": "facebook", "url": "https://..."}]
    footer_text = models.CharField(max_length=500, blank=True)

    default_meta_title = models.CharField(max_length=70, blank=True)
    default_meta_description = models.CharField(max_length=170, blank=True)
    default_og_image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    allow_indexing = models.BooleanField(default=True, help_text="Turn off on staging sites.")
    default_language = models.CharField(max_length=10, choices=settings.LANGUAGES, default="en")

    announcement_enabled = models.BooleanField(default=False)
    announcement_text = models.CharField(max_length=300, blank=True)
    announcement_link_label = models.CharField(max_length=60, blank=True)
    announcement_link_url = models.CharField(max_length=500, blank=True)
    announcement_starts_at = models.DateTimeField(null=True, blank=True)
    announcement_ends_at = models.DateTimeField(null=True, blank=True)

    auth_panel_heading = models.CharField(max_length=150, blank=True)
    auth_panel_text = models.CharField(max_length=400, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name_plural = "site settings"
        constraints = [models.CheckConstraint(condition=Q(id=1), name="cms_sitesettings_singleton")]
        permissions = [("manage_site_settings", "Can edit branding, contact and SEO site settings")]

    def __str__(self):
        return "Site settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def announcement_is_live(self, now=None) -> bool:
        now = now or timezone.now()
        if not (self.announcement_enabled and self.announcement_text):
            return False
        if self.announcement_starts_at and now < self.announcement_starts_at:
            return False
        return not (self.announcement_ends_at and now >= self.announcement_ends_at)


class Page(TimeStampedModel, SeoFields):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=120, unique=True)
    is_home = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    # Draft content; validated against apps.cms.sections on every write.
    sections = models.JSONField(default=list, blank=True)

    # RESTRICT (not PROTECT) so deleting a page can cascade to its own versions.
    published_version = models.ForeignKey(
        "PageVersion", null=True, blank=True, on_delete=models.RESTRICT, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_version = models.ForeignKey(
        "PageVersion", null=True, blank=True, on_delete=models.RESTRICT, related_name="+"
    )
    scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["title"]
        constraints = [
            models.UniqueConstraint(fields=["is_home"], condition=Q(is_home=True), name="cms_page_single_home"),
            models.CheckConstraint(
                condition=~Q(status="published") | Q(published_version__isnull=False),
                name="cms_page_published_has_version",
            ),
            models.CheckConstraint(
                condition=Q(scheduled_for__isnull=True, scheduled_version__isnull=True)
                | Q(scheduled_for__isnull=False, scheduled_version__isnull=False),
                name="cms_page_schedule_complete",
            ),
        ]
        permissions = [
            ("manage_pages", "Can create, edit and delete website pages"),
            ("publish_pages", "Can publish, schedule and unpublish website pages"),
        ]

    def __str__(self):
        return self.title

    @property
    def path(self) -> str:
        return "/" if self.is_home else f"/{self.slug}"

    def seo_snapshot(self) -> dict:
        return {
            "meta_title": self.meta_title,
            "meta_description": self.meta_description,
            "canonical_url": self.canonical_url,
            "og_image": self.og_image_id,
            "noindex": self.noindex,
        }


class PageVersion(models.Model):
    """Immutable snapshot of a page's draft at the time it was saved."""

    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    sections = models.JSONField(default=list)
    seo = models.JSONField(default=dict)
    note = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-number"]
        constraints = [models.UniqueConstraint(fields=["page", "number"], name="cms_pageversion_unique_number")]

    def __str__(self):
        return f"{self.page_id} v{self.number}"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise RuntimeError("Page versions are immutable.")
        super().save(*args, **kwargs)


class Menu(models.Model):
    class Location(models.TextChoices):
        HEADER = "header", "Header navigation"
        FOOTER = "footer", "Footer columns"
        LEGAL = "legal", "Legal links (footer bottom)"

    location = models.CharField(max_length=20, choices=Location.choices, unique=True)
    title = models.CharField(max_length=100, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["location"]
        permissions = [("manage_menus", "Can edit navigation menus")]

    def __str__(self):
        return self.get_location_display()


class MenuItem(models.Model):
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name="items")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    label = models.CharField(max_length=80)
    # Either a CMS page (resolved to its current path) or an explicit URL.
    page = models.ForeignKey(Page, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    url = models.CharField(max_length=500, blank=True)
    position = models.PositiveIntegerField(default=0)
    open_in_new_tab = models.BooleanField(default=False)
    is_visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "id"]
        indexes = [models.Index(fields=["menu", "parent", "position"])]

    def __str__(self):
        return self.label


class BlogCategory(TimeStampedModel):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=90, unique=True)
    description = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "blog categories"

    def __str__(self):
        return self.name


class BlogPost(TimeStampedModel, SeoFields):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=140, unique=True)
    excerpt = models.CharField(max_length=400, blank=True)
    body = models.TextField(blank=True, help_text="Sanitised HTML.")
    cover = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="blog_posts"
    )
    categories = models.ManyToManyField(BlogCategory, blank=True, related_name="posts")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    # A published post with a future published_at is scheduled: it stays hidden until then.
    published_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-published_at", "-created_at"]
        indexes = [models.Index(fields=["status", "published_at"])]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="published") | Q(published_at__isnull=False),
                name="cms_blogpost_published_has_date",
            )
        ]
        permissions = [
            ("manage_blog", "Can write and edit blog posts and categories"),
            ("publish_blog", "Can publish and unpublish blog posts"),
        ]

    def __str__(self):
        return self.title


class NewsletterSubscriber(models.Model):
    email = models.EmailField(max_length=254)
    source = models.CharField(max_length=200, blank=True, help_text="Page path where the visitor signed up.")
    consented_at = models.DateTimeField(default=timezone.now)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-consented_at"]
        constraints = [models.UniqueConstraint(Lower("email"), name="cms_newsletter_email_ci_unique")]
        permissions = [("view_newsletter_subscribers", "Can view and export newsletter subscribers")]

    def __str__(self):
        return self.email
