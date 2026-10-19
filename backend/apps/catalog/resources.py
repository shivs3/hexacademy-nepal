"""Lesson resource files: validation on upload, authorised delivery on download.

Files live in the private bucket. The type is detected from the content (never
the client's MIME type); text formats must be valid UTF-8. Downloads are always
served as attachments, so a browser never renders an uploaded file in the
site's origin.
"""

import re
from pathlib import PurePosixPath

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import FileResponse, HttpResponseRedirect

from apps.audit import services as audit

from .models import Lesson, LessonResource

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
    resource = LessonResource(
        lesson=lesson,
        kind=LessonResource.Kind.FILE,
        title=(title or original).strip()[:160],
        original_name=original,
        mime_type=mime,
        size_bytes=len(data),
        position=_next_position(lesson),
    )
    resource.file.save(f"upload{ext}", ContentFile(data), save=False)
    resource.save()
    audit.record("catalog.resource_uploaded", actor=actor, target=resource, request=request, lesson=lesson.pk)
    return resource


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
    storage, name = (resource.file.storage, resource.file.name) if resource.file else (None, "")
    resource.delete()
    if name:
        transaction.on_commit(lambda: storage.delete(name))


def file_response(resource: LessonResource):
    """Deliver a file the caller has already been authorised to read."""
    disposition_name = resource.original_name or f"resource-{resource.pk}"
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
