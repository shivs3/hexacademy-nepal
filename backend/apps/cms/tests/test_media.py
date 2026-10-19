from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.cms.models import MediaAsset

from .conftest import make_png

pytestmark = pytest.mark.django_db
URL = "/api/v1/admin/cms/media/"


def test_upload_image_records_metadata_with_random_key(editor):
    res = editor.post(URL, {"file": make_png("My Photo.png"), "alt_text": "Logo"}, format="multipart")
    assert res.status_code == 201, res.json()
    data = res.json()
    assert data["kind"] == "image" and data["mime_type"] == "image/png"
    assert (data["width"], data["height"]) == (4, 3)
    asset = MediaAsset.objects.get(pk=data["id"])
    assert asset.original_name == "My Photo.png"
    assert "My Photo" not in asset.file.name and asset.file.name.startswith("cms/")
    assert len(asset.checksum_sha256) == 64


def test_content_type_is_sniffed_not_trusted(editor):
    fake = SimpleUploadedFile("evil.png", b"<script>alert(1)</script>", content_type="image/png")
    res = editor.post(URL, {"file": fake}, format="multipart")
    assert res.status_code == 400
    assert "file" in res.json()["error"]["details"]


def test_svg_is_refused(editor):
    svg = SimpleUploadedFile("x.svg", b'<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "image/svg+xml")
    assert editor.post(URL, {"file": svg}, format="multipart").status_code == 400


def test_pdf_upload(editor):
    pdf = SimpleUploadedFile("brochure.pdf", b"%PDF-1.4\n%fake but magic ok\n", content_type="application/pdf")
    res = editor.post(URL, {"file": pdf}, format="multipart")
    assert res.status_code == 201
    assert res.json()["kind"] == "document"


def test_jpeg_metadata_is_stripped(editor):
    img = Image.new("RGB", (8, 8), (200, 10, 10))
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMaker"
    buf = BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    upload = SimpleUploadedFile("photo.jpg", buf.getvalue(), content_type="image/jpeg")
    res = editor.post(URL, {"file": upload}, format="multipart")
    assert res.status_code == 201
    stored = MediaAsset.objects.get(pk=res.json()["id"]).file.read()
    assert b"SecretCameraMaker" not in stored


def test_edit_alt_text_search_and_delete(editor, image):
    res = editor.patch(f"{URL}{image.pk}/", {"alt_text": "Updated description"}, format="json")
    assert res.json()["alt_text"] == "Updated description"
    assert editor.get(URL, {"search": "updated"}).json()["count"] == 1
    assert editor.get(URL, {"kind": "document"}).json()["count"] == 0
    assert editor.delete(f"{URL}{image.pk}/").status_code == 204
    assert not MediaAsset.objects.filter(pk=image.pk).exists()


def test_students_and_finance_cannot_use_media_library(client_for):
    for role in ("student", "finance_manager"):
        client = client_for(role)
        assert client.get(URL).status_code == 403
        assert client.post(URL, {"file": make_png()}, format="multipart").status_code == 403
