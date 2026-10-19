"""Media library uploads.

The file type is decided from the file's content, never from the client's
filename or Content-Type. SVG and HTML are refused (both can carry script).
JPEG and WebP images are re-encoded without metadata so camera EXIF data
(including GPS position) is not published.
"""

import hashlib
from io import BytesIO

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.audit import services as audit

from .models import MediaAsset

IMAGE_FORMATS = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png"), "WEBP": ("image/webp", ".webp"),
                 "GIF": ("image/gif", ".gif")}  # fmt: skip
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000


def max_document_bytes() -> int:
    return settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


def _inspect_image(data: bytes):
    try:
        with Image.open(BytesIO(data)) as probe:
            probe.verify()
        img = Image.open(BytesIO(data))
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        return None
    if img.format not in IMAGE_FORMATS:
        return None
    return img


def _strip_metadata(img: Image.Image) -> bytes:
    fmt = img.format
    img = ImageOps.exif_transpose(img)
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format=fmt, quality=90, optimize=True)
    return buf.getvalue()


def analyse_upload(uploaded) -> dict:
    """Validate an uploaded file; return the normalised bytes and metadata."""
    size = uploaded.size or 0
    if size == 0:
        raise ValidationError({"file": ["The file is empty."]})
    if size > max(MAX_IMAGE_BYTES, max_document_bytes()):
        raise ValidationError({"file": ["The file is too large."]})
    data = uploaded.read()

    img = _inspect_image(data)
    if img is not None:
        if size > MAX_IMAGE_BYTES:
            raise ValidationError({"file": [f"Images must be at most {MAX_IMAGE_BYTES // (1024 * 1024)} MB."]})
        if img.width * img.height > MAX_IMAGE_PIXELS:
            raise ValidationError({"file": ["The image dimensions are too large."]})
        mime, ext = IMAGE_FORMATS[img.format]
        if img.format in ("JPEG", "WEBP"):
            data = _strip_metadata(img)
        return {
            "kind": MediaAsset.Kind.IMAGE,
            "mime_type": mime,
            "ext": ext,
            "data": data,
            "width": img.width,
            "height": img.height,
        }

    if data[:5] == b"%PDF-":
        if size > max_document_bytes():
            raise ValidationError({"file": [f"Documents must be at most {settings.MAX_UPLOAD_SIZE_MB} MB."]})
        return {"kind": MediaAsset.Kind.DOCUMENT, "mime_type": "application/pdf", "ext": ".pdf", "data": data}

    raise ValidationError({"file": ["Unsupported file type. Upload a JPEG, PNG, WebP or GIF image, or a PDF."]})


@transaction.atomic
def create_media_asset(uploaded, *, title="", alt_text="", actor=None, request=None) -> MediaAsset:
    info = analyse_upload(uploaded)
    original = (getattr(uploaded, "name", "") or "upload")[-255:]
    asset = MediaAsset(
        kind=info["kind"],
        original_name=original,
        mime_type=info["mime_type"],
        size_bytes=len(info["data"]),
        width=info.get("width"),
        height=info.get("height"),
        checksum_sha256=hashlib.sha256(info["data"]).hexdigest(),
        title=title.strip()[:200],
        alt_text=alt_text.strip()[:300],
        uploaded_by=actor,
    )
    # The extension comes from the detected type; the storage key itself is random.
    asset.file.save(f"upload{info['ext']}", ContentFile(info["data"]), save=False)
    asset.save()
    audit.record("cms.media_uploaded", actor=actor, target=asset, request=request, kind=asset.kind)
    return asset


@transaction.atomic
def delete_media_asset(asset: MediaAsset, *, actor=None, request=None):
    audit.record("cms.media_deleted", actor=actor, target=asset, request=request, name=asset.original_name)
    storage, name = asset.file.storage, asset.file.name
    asset.delete()
    # Remove the stored object only once the row deletion has committed.
    transaction.on_commit(lambda: storage.delete(name))


def media_payload(asset: MediaAsset) -> dict:
    return {
        "id": asset.pk,
        "url": asset.url,
        "alt": asset.alt_text,
        "width": asset.width,
        "height": asset.height,
        "mime_type": asset.mime_type,
    }


def media_map(ids) -> dict[int, dict]:
    ids = {i for i in ids if isinstance(i, int)}
    if not ids:
        return {}
    return {a.pk: media_payload(a) for a in MediaAsset.objects.filter(pk__in=ids)}
