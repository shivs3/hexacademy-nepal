"""Site notices: saving them and rendering PDF attachments to page images.

A PDF attachment is rendered once, when the notice is saved, into WebP images
(one per page) stored next to the other public media. The site then shows
those images inline, so visitors read the notice inside the website rather
than in the browser's own PDF viewer, and the popup can preview page one.
"""

from concurrent.futures import ThreadPoolExecutor

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction

from apps.audit import services as audit
from common.pdf_pages import WORKERS, PdfError, render_pages

from .models import MediaAsset, Notice, NoticePage

# Rendering happens inside the save request (60 s limit in Gunicorn and Nginx);
# a dense 30-page PDF takes about 16 s on the VPS.
MAX_PDF_PAGES = 30


def render_pdf(data: bytes) -> list[tuple[bytes, int, int]]:
    """Render each page to WebP; returns (bytes, width, height) per page."""
    try:
        return list(render_pages(data, max_pages=MAX_PDF_PAGES))
    except PdfError as exc:
        raise ValidationError({"attachment": [str(exc)]}) from None


def _upload_pages(notice: Notice, rendered: list[tuple[bytes, int, int]]) -> list[NoticePage]:
    """Store the page images in parallel; on any failure remove what was stored."""
    field = NoticePage._meta.get_field("image")
    storage = field.storage

    def put(item):
        number, (data, width, height) = item
        page = NoticePage(notice=notice, number=number, width=width, height=height)
        name = field.generate_filename(page, "page.webp")
        page.image.name = storage.save(name, ContentFile(data))
        return page

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(put, item) for item in enumerate(rendered, start=1)]
    pages, errors = [], []
    for f in futures:
        try:
            pages.append(f.result())
        except Exception as exc:  # noqa: BLE001 - re-raised below after cleanup
            errors.append(exc)
    if errors:
        for page in pages:
            storage.delete(page.image.name)
        raise errors[0]
    return pages


def _delete_files_on_commit(files: list[tuple]):
    def run():
        for storage, name in files:
            storage.delete(name)

    if files:
        transaction.on_commit(run)


def _sync_pages(notice: Notice):
    """Re-render the page images when the attachment changed."""
    attachment = notice.attachment
    is_pdf = attachment is not None and attachment.kind == MediaAsset.Kind.DOCUMENT
    has_pages = notice.pages.exists()
    if is_pdf and notice.rendered_attachment_id == attachment.pk and has_pages:
        return
    if not is_pdf and not has_pages and notice.rendered_attachment_id is None:
        return

    rendered = []
    if is_pdf:
        with attachment.file.open("rb") as fh:
            rendered = render_pdf(fh.read())

    old = [(p.image.storage, p.image.name) for p in notice.pages.all()]
    notice.pages.all().delete()
    NoticePage.objects.bulk_create(_upload_pages(notice, rendered))
    notice.rendered_attachment = attachment if is_pdf else None
    notice.save(update_fields=["rendered_attachment", "updated_at"])
    _delete_files_on_commit(old)


@transaction.atomic
def save_notice(notice: Notice, *, data: dict, actor, request=None) -> Notice:
    creating = notice.pk is None
    for field, value in data.items():
        setattr(notice, field, value)
    notice.updated_by = actor
    if creating:
        notice.created_by = actor
    notice.save()
    _sync_pages(notice)
    audit.record(
        "cms.notice_created" if creating else "cms.notice_updated",
        actor=actor,
        target=notice,
        request=request,
        is_active=notice.is_active,
    )
    return notice


@transaction.atomic
def delete_notice(notice: Notice, *, actor, request=None):
    files = [(p.image.storage, p.image.name) for p in notice.pages.all()]
    audit.record("cms.notice_deleted", actor=actor, target=notice, request=request, title=notice.title)
    notice.delete()
    _delete_files_on_commit(files)


def live_notices(now=None):
    return (
        Notice.objects.filter(Notice.live_q(now))
        .select_related("attachment")
        .prefetch_related("pages")
        .order_by("position", "-created_at")
    )
