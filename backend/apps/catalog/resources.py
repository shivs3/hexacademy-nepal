"""Lesson resource files: validation on upload, view-only delivery to learners.

Files live in the private bucket. The type is detected from the content (never
the client's MIME type); text formats must be valid UTF-8.

Learners never download a lesson file. PDFs are rendered by the worker into
page images that the lesson page shows one at a time; images and text files
are served inline for the page to display. Only staff can download originals
(always as attachments, so a browser never renders an upload in the site's
origin). Anything shown on screen can still be photographed or captured; this
removes the download, it is not DRM.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import PurePosixPath

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import FileResponse, HttpResponse, HttpResponseRedirect

from apps.audit import services as audit
from common.pdf_pages import WORKERS, PdfError, page_count, render_pages

from .models import Lesson, LessonResource, LessonResourcePage

logger = logging.getLogger(__name__)

MAX_PDF_PAGES = 300
MAX_TEXT_VIEW_BYTES = 1024 * 1024
# Learners can only view lesson files in the page, so lessons accept the types a page can show.
LESSON_MIME_TYPES = frozenset({"application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"})

MAX_RESOURCES_PER_LESSON = 30

_MAGIC = (
    (b"%PDF-", ".pdf", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", ".png", "image/png"),
    (b"\xff\xd8\xff", ".jpg", "image/jpeg"),
    (b"GIF87a", ".gif", "image/gif"),
    (b"GIF89a", ".gif", "image/gif"),
)
_ZIP_TYPES = {
    ".zip": "application/zip",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
}
# Source code and data files. Served as text/plain attachments whatever the extension.
TEXT_EXTENSIONS = frozenset(
    ".txt .md .csv .tsv .json .ipynb .py .r .m .c .h .cpp .hpp .cs .java .kt .js .ts .tsx .jsx .go .rs .rb "
    ".php .sql .sh .yaml .yml .toml .tex .bib .xml .css .scss .dart .swift .scala .lua .pl".split()
)
_SAFE_NAME = re.compile(r"[^\w.\- ()]+", re.UNICODE)


def max_bytes() -> int:
    return settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def safe_filename(name: str) -> str:
    base = PurePosixPath((name or "").replace("\\", "/")).name
    cleaned = _SAFE_NAME.sub("_", base).strip(" .") or "download"
    return cleaned[-150:]


def detect(data: bytes, filename: str) -> tuple[str, str]:
    """Return (extension, mime type) or raise ValidationError."""
    ext = PurePosixPath(filename.lower()).suffix
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp", "image/webp"
    for magic, magic_ext, mime in _MAGIC:
        if data.startswith(magic):
            return magic_ext, mime
    if data.startswith(b"PK\x03\x04"):
        if ext in _ZIP_TYPES:
            return ext, _ZIP_TYPES[ext]
        return ".zip", _ZIP_TYPES[".zip"]
    if ext in TEXT_EXTENSIONS:
        if b"\x00" in data:
            raise ValidationError({"file": ["This does not look like a text file."]})
        try:
            data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValidationError({"file": ["Text files must be UTF-8 encoded."]}) from exc
        return ext, "text/plain"
    raise ValidationError(
        {
            "file": [
                "Unsupported file type. Upload a PDF, image, slides/documents (PPTX, DOCX, XLSX), ZIP, or a "
                "source-code or text file."
            ]
        }  # fmt: skip
    )


def _next_position(lesson: Lesson) -> int:
    last = lesson.resources.order_by("-position").values_list("position", flat=True).first()
    return 0 if last is None else last + 1


def _check_capacity(lesson: Lesson):
    if lesson.resources.count() >= MAX_RESOURCES_PER_LESSON:
        raise ValidationError({"file": [f"A lesson can have at most {MAX_RESOURCES_PER_LESSON} resources."]})


@transaction.atomic
def add_file(lesson: Lesson, uploaded, *, title: str, actor, request=None) -> LessonResource:
    _check_capacity(lesson)
    size = uploaded.size or 0
    if size == 0:
        raise ValidationError({"file": ["The file is empty."]})
    if size > max_bytes():
        raise ValidationError({"file": [f"Files must be at most {settings.MAX_UPLOAD_SIZE_MB} MB."]})
    data = uploaded.read()
    original = safe_filename(getattr(uploaded, "name", ""))
    ext, mime = detect(data, original)
    if mime not in LESSON_MIME_TYPES:
        raise ValidationError(
            {"file": ["Learners read lesson files in the page and can't download them, so upload a PDF, an image "
                      "or a text/code file. Save slides and documents as PDF first."]}
        )  # fmt: skip
    pages = 0
    if mime == "application/pdf":
        try:
            pages = page_count(data, max_pages=MAX_PDF_PAGES)  # quick check; rendering happens in the worker
        except PdfError as exc:
            raise ValidationError({"file": [str(exc)]}) from None
    resource = LessonResource(
        lesson=lesson,
        kind=LessonResource.Kind.FILE,
        title=(title or original).strip()[:160],
        original_name=original,
        mime_type=mime,
        size_bytes=len(data),
        position=_next_position(lesson),
        render_status=LessonResource.RenderStatus.PENDING if pages else LessonResource.RenderStatus.NONE,
        page_count=pages,
    )
    resource.file.save(f"upload{ext}", ContentFile(data), save=False)
    resource.save()
    audit.record("catalog.resource_uploaded", actor=actor, target=resource, request=request, lesson=lesson.pk)
    if pages:
        transaction.on_commit(lambda: queue_render(resource.pk))
    return resource


def queue_render(resource_id: int) -> bool:
    """Ask the worker to render a PDF's pages. False if the queue is unreachable."""
    from .tasks import render_resource_pages

    try:
        render_resource_pages.delay(resource_id)
    except Exception:  # noqa: BLE001 - the admin can retry; the upload itself succeeded
        logger.exception("Could not queue page rendering for lesson resource %s", resource_id)
        return False
    return True


@transaction.atomic
def request_render(resource: LessonResource, *, actor, request=None) -> LessonResource:
    """Render a PDF's pages again (after a failure or a stuck queue)."""
    resource = LessonResource.objects.select_for_update().get(pk=resource.pk)
    if not resource.is_pdf:
        raise ValidationError("Only PDFs are prepared as pages.")
    resource.render_status = LessonResource.RenderStatus.PENDING
    resource.render_error = ""
    resource.save(update_fields=["render_status", "render_error", "updated_at"])
    audit.record("catalog.resource_render_requested", actor=actor, target=resource, request=request)
    transaction.on_commit(lambda: queue_render(resource.pk))
    return resource


def _set_failed(resource_id: int, message: str):
    LessonResource.objects.filter(pk=resource_id).update(
        render_status=LessonResource.RenderStatus.FAILED, render_error=message[:300]
    )


def _delete_names(storage, names):
    for name in names:
        try:
            storage.delete(name)
        except Exception:  # noqa: BLE001 - best effort cleanup
            logger.warning("Could not delete %s", name)


def render_resource(resource_id: int) -> None:
    """Render every page of a lesson PDF and swap them in. Called by the worker.

    Storage errors propagate so the task can retry; a PDF that can't be shown
    is marked failed with a message for the uploader.
    """
    resource = LessonResource.objects.filter(pk=resource_id, kind=LessonResource.Kind.FILE).first()
    if resource is None or not resource.is_pdf:
        return
    field = LessonResourcePage._meta.get_field("image")
    storage = field.storage
    source = resource.file.name

    def put(number: int, image: tuple[bytes, int, int]) -> LessonResourcePage:
        data, width, height = image
        page = LessonResourcePage(resource_id=resource_id, number=number, width=width, height=height)
        page.image.name = storage.save(field.generate_filename(page, "page.webp"), ContentFile(data))
        return page

    futures = []
    try:
        with resource.file.open("rb") as fh:
            data = fh.read()
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            for number, image in enumerate(render_pages(data, max_pages=MAX_PDF_PAGES), start=1):
                futures.append(pool.submit(put, number, image))
        pages = [f.result() for f in futures]
    except BaseException as exc:
        _delete_names(storage, [f.result().image.name for f in futures if f.done() and not f.exception()])
        if isinstance(exc, PdfError):
            _set_failed(resource_id, str(exc))
            return
        raise

    new_names = [p.image.name for p in pages]
    with transaction.atomic():
        current = LessonResource.objects.select_for_update().filter(pk=resource_id).first()
        if current is None or current.file.name != source:  # deleted or replaced meanwhile
            transaction.on_commit(lambda: _delete_names(storage, new_names))
            return
        old_names = list(current.pages.values_list("image", flat=True))
        current.pages.all().delete()
        LessonResourcePage.objects.bulk_create(pages)
        current.render_status = LessonResource.RenderStatus.READY
        current.render_error = ""
        current.page_count = len(pages)
        current.save(update_fields=["render_status", "render_error", "page_count", "updated_at"])
        transaction.on_commit(lambda: _delete_names(storage, old_names))


def mark_render_failed(resource_id: int) -> None:
    _set_failed(resource_id, "The pages could not be prepared. Try again in a few minutes.")


@transaction.atomic
def add_link(lesson: Lesson, *, title: str, url: str, actor, request=None) -> LessonResource:
    _check_capacity(lesson)
    return LessonResource.objects.create(
        lesson=lesson,
        kind=LessonResource.Kind.LINK,
        title=title.strip()[:160],
        url=url,
        position=_next_position(lesson),
    )


@transaction.atomic
def delete_resource(resource: LessonResource, *, actor, request=None):
    audit.record("catalog.resource_deleted", actor=actor, target=resource, request=request, lesson=resource.lesson_id)
    storage = resource.file.storage
    names = [resource.file.name] if resource.file else []
    names += list(resource.pages.values_list("image", flat=True))
    resource.delete()
    if names:
        transaction.on_commit(lambda: _delete_names(storage, names))


def file_response(resource):
    """Deliver a file the caller has already been authorised to read.

    `resource` is any row with `file`, `original_name` and `mime_type` (lesson
    resources, assignment submissions).
    """
    disposition_name = resource.original_name or f"download-{resource.pk}"
    if settings.USE_S3_STORAGE:
        # Short-lived signed URL; the bucket itself is private.
        url = resource.file.storage.url(
            resource.file.name,
            parameters={
                "ResponseContentDisposition": f'attachment; filename="{disposition_name}"',
                "ResponseContentType": resource.mime_type or "application/octet-stream",
            },
        )
        return HttpResponseRedirect(url)
    response = FileResponse(
        resource.file.open("rb"),
        as_attachment=True,
        filename=disposition_name,
        content_type=resource.mime_type or "application/octet-stream",
    )
    response["Cache-Control"] = "private, no-store"
    return response


def _inline(file, content_type: str):
    """Serve a file for the page to display (never as a download prompt)."""
    if settings.USE_S3_STORAGE:
        # Short-lived signed URL (PRIVATE_URL_TTL_SECONDS); the bucket itself is private.
        url = file.storage.url(
            file.name,
            parameters={
                "ResponseContentDisposition": "inline",
                "ResponseContentType": content_type,
                "ResponseCacheControl": "private, no-store",
            },
        )
        response = HttpResponseRedirect(url)
    else:
        response = FileResponse(file.open("rb"), content_type=content_type)
        response["Content-Disposition"] = "inline"
    response["Cache-Control"] = "private, no-store"
    return response


def page_response(page: LessonResourcePage):
    return _inline(page.image, "image/webp")


def view_response(resource: LessonResource):
    """An image or text lesson file, for display in the lesson page. PDFs are served as pages."""
    if resource.viewer == "image":
        return _inline(resource.file, resource.mime_type)
    if resource.viewer == "text":
        with resource.file.open("rb") as fh:
            data = fh.read(MAX_TEXT_VIEW_BYTES + 1)
        text = data[:MAX_TEXT_VIEW_BYTES].decode("utf-8", errors="replace")
        response = HttpResponse(text, content_type="text/plain; charset=utf-8")
        response["Content-Disposition"] = "inline"
        response["Content-Security-Policy"] = "sandbox; default-src 'none'"
        response["Cache-Control"] = "private, no-store"
        response["X-Truncated"] = "1" if len(data) > MAX_TEXT_VIEW_BYTES else "0"
        return response
    raise ValidationError("This file is shown as pages, not as a single file.")
