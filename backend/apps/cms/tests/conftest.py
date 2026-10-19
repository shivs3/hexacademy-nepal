from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.accounts import roles


def make_png(name="pixel.png", size=(4, 3), color=(10, 139, 167)) -> SimpleUploadedFile:
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


@pytest.fixture
def editor(client_for):
    return client_for(roles.CONTENT_EDITOR)


@pytest.fixture
def image(db):
    from apps.cms.media import create_media_asset

    return create_media_asset(make_png(), alt_text="A teal square")


HERO = {
    "type": "hero",
    "data": {"heading": "Learn with Hexacademy", "primary_cta_label": "Browse", "primary_cta_url": "/courses"},
}


@pytest.fixture
def make_page(editor):
    def _make(slug="about", sections=None, publish=False, **extra):
        payload = {
            "title": slug.title(),
            "slug": slug,
            "sections": sections if sections is not None else [HERO],
            **extra,
        }
        res = editor.post("/api/v1/admin/cms/pages/", payload, format="json")
        assert res.status_code == 201, res.json()
        page = res.json()
        if publish:
            res = editor.post(f"/api/v1/admin/cms/pages/{page['id']}/publish/", {}, format="json")
            assert res.status_code == 200, res.json()
            page = res.json()
        return page

    return _make
