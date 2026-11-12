"""Site notices: saving them and rendering PDF attachments to page images.

A PDF attachment is rendered once, when the notice is saved, into WebP images
(one per page) stored next to the other public media. The site then shows
those images inline, so visitors read the notice inside the website rather
than in the browser's own PDF viewer, and the popup can preview page one.
"""

from io import BytesIO

import pypdfium2 as pdfium
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction

from apps.audit import services as audit

from .models import MediaAsset, Notice, NoticePage

MAX_PDF_PAGES = 10
RENDER_WIDTH = 1600  # pixels; sharp on retina phones, readable full-width on desktop
MAX_RENDER_HEIGHT = 8000
MAX_SCALE = 4.0


def render_pdf(data: bytes) -> list[tuple[bytes, int, int]]:
    """Render each page to WebP; returns (bytes, width, height) per page."""
    try:
        pdf = pdfium.PdfDocument(data)
    except pdfium.PdfiumError:
        raise ValidationError(
            {"attachment": ["The PDF could not be opened. It may be damaged or password-protected."]}
        ) from None
    try:
        count = len(pdf)
        if count == 0:
            raise ValidationError({"attachment": ["The PDF has no pages."]})
        if count > MAX_PDF_PAGES:
            raise ValidationError(
                {"attachment": [f"Notices can show at most {MAX_PDF_PAGES} PDF pages; this one has {count}."]}
            )
        pages = []
        for index in range(count):
            page = pdf[index]
            try:
                width, height = page.get_size()
                if width <= 0 or height <= 0:
                    raise ValidationError({"attachment": [f"Page {index + 1} of the PDF has no size."]})
                scale = min(RENDER_WIDTH / width, MAX_RENDER_HEIGHT / height, MAX_SCALE)
                image = page.render(scale=scale).to_pil().convert("RGB")
            except pdfium.PdfiumError:
                raise ValidationError({"attachment": [f"Page {index + 1} of the PDF could not be rendered."]}) from None
            finally:
                page.close()
            buf = BytesIO()
            image.save(buf, format="WEBP", quality=88, method=6)
            pages.append((buf.getvalue(), image.width, image.height))
        return pages
    finally:
        pdf.close()


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
    for number, (data, width, height) in enumerate(rendered, start=1):
        page = NoticePage(notice=notice, number=number, width=width, height=height)
        page.image.save("page.webp", ContentFile(data), save=False)
        page.save()
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
