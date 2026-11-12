from datetime import timedelta
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.cms.media import create_media_asset
from apps.cms.models import Notice, NoticePage

pytestmark = pytest.mark.django_db
ADMIN = "/api/v1/admin/cms/notices/"
PUBLIC = "/api/v1/notices/"


def make_pdf(pages=1, name="notice.pdf") -> SimpleUploadedFile:
    buf = BytesIO()
    c = canvas.Canvas(buf)
    for n in range(pages):
        c.drawString(100, 750, f"Exam notice page {n + 1}")
        c.showPage()
    c.save()
    return SimpleUploadedFile(name, buf.getvalue(), content_type="application/pdf")


@pytest.fixture
def pdf(db):
    return create_media_asset(make_pdf(2))


def create(editor, **data):
    res = editor.post(ADMIN, {"title": "Admissions open", **data}, format="json")
    assert res.status_code == 201, res.json()
    return res.json()


def test_pdf_attachment_is_rendered_to_page_images(editor, pdf):
    notice = create(editor, attachment=pdf.pk, summary="Read the full notice")
    assert [p["number"] for p in notice["pages"]] == [1, 2]
    page = NoticePage.objects.get(notice_id=notice["id"], number=1)
    assert page.image.name.startswith("notices/") and page.image.name.endswith(".webp")
    assert page.width == 1600 and page.height > page.width  # A4 portrait
    assert notice["attachment_detail"]["kind"] == "document"
    assert AuditLog.objects.filter(action="cms.notice_created").exists()


def test_changing_the_attachment_replaces_pages(editor, pdf, image):
    notice = create(editor, attachment=pdf.pk)
    old = set(NoticePage.objects.values_list("image", flat=True))

    res = editor.patch(f"{ADMIN}{notice['id']}/", {"attachment": image.pk}, format="json")
    assert res.status_code == 200, res.json()
    assert res.json()["pages"] == [] and not NoticePage.objects.exists()

    other = create_media_asset(make_pdf(1, "other.pdf"))
    res = editor.patch(f"{ADMIN}{notice['id']}/", {"attachment": other.pk}, format="json").json()
    assert len(res["pages"]) == 1
    assert not old & set(NoticePage.objects.values_list("image", flat=True))

    # Saving other fields does not re-render.
    before = list(NoticePage.objects.values_list("image", flat=True))
    editor.patch(f"{ADMIN}{notice['id']}/", {"title": "Renamed"}, format="json")
    assert list(NoticePage.objects.values_list("image", flat=True)) == before


def test_bad_and_long_pdfs_are_refused(editor):
    broken = create_media_asset(SimpleUploadedFile("x.pdf", b"%PDF-1.4\nnot really", content_type="application/pdf"))
    res = editor.post(ADMIN, {"title": "T", "attachment": broken.pk}, format="json")
    assert res.status_code == 400
    assert "attachment" in res.json()["error"]["details"]

    long = create_media_asset(make_pdf(11))
    res = editor.post(ADMIN, {"title": "T", "attachment": long.pk}, format="json")
    assert res.status_code == 400
    assert not Notice.objects.exists()


def test_validation_cleans_text_and_checks_dates(editor):
    now = timezone.now()
    res = editor.post(
        ADMIN,
        {"title": "T", "starts_at": now.isoformat(), "ends_at": (now - timedelta(hours=1)).isoformat()},
        format="json",
    )
    assert res.status_code == 400 and "ends_at" in res.json()["error"]["details"]
    assert editor.post(ADMIN, {"title": "   "}, format="json").status_code == 400

    notice = create(editor, body="<p>Hi<script>alert(1)</script></p>", summary="  Plain\x07 text  ")
    assert notice["body"] == "<p>Hi</p>"
    assert notice["summary"] == "Plain text"  # plain text: rendered escaped, never as HTML
    assert create(editor, body="<p>&nbsp;</p>")["body"] == ""


def test_public_list_only_has_live_notices(editor, image):
    now = timezone.now()
    live = create(editor, title="Live", attachment=image.pk, body="<p>Details</p>", position=2)
    first = create(editor, title="First", position=1, show_in_popup=False)
    create(editor, title="Off", is_active=False)
    create(editor, title="Future", starts_at=(now + timedelta(days=1)).isoformat())
    create(
        editor,
        title="Past",
        ends_at=(now - timedelta(minutes=1)).isoformat(),
        starts_at=(now - timedelta(days=1)).isoformat(),
    )

    anon = APIClient()
    rows = anon.get(PUBLIC).json()
    assert [r["title"] for r in rows] == ["First", "Live"]
    item = rows[1]
    assert item["has_details"] is True and "body" not in item
    assert item["attachment"]["kind"] == "image" and "id" not in item["attachment"]
    assert rows[0]["show_in_popup"] is False

    assert anon.get(f"{PUBLIC}{live['id']}/").json()["body"] == "<p>Details</p>"
    assert anon.get(f"{PUBLIC}{first['id']}/").status_code == 200
    off = Notice.objects.get(title="Off")
    assert anon.get(f"{PUBLIC}{off.pk}/").status_code == 404
    future = Notice.objects.get(title="Future")
    assert anon.get(f"{PUBLIC}{future.pk}/").status_code == 404


def test_public_payload_hides_staff_fields(editor, pdf):
    create(editor, attachment=pdf.pk)
    row = APIClient().get(PUBLIC).json()[0]
    assert set(row) == {
        "id", "title", "summary", "has_details", "attachment", "pages", "show_in_popup", "published_at", "updated_at",
    }  # fmt: skip
    assert len(row["pages"]) == 2


def test_notice_admin_requires_permission(client_for, editor):
    assert APIClient().get(ADMIN).status_code in (401, 403)
    for role in (roles.STUDENT, roles.INSTRUCTOR, roles.FINANCE_MANAGER, roles.SUPPORT_STAFF):
        assert client_for(role).post(ADMIN, {"title": "x"}, format="json").status_code == 403
    assert editor.get(ADMIN).status_code == 200


def test_delete_removes_notice_and_pages(editor, pdf, django_capture_on_commit_callbacks):
    notice = create(editor, attachment=pdf.pk)
    page = NoticePage.objects.first()
    storage, name = page.image.storage, page.image.name
    with django_capture_on_commit_callbacks(execute=True):
        assert editor.delete(f"{ADMIN}{notice['id']}/").status_code == 204
    assert not Notice.objects.exists() and not NoticePage.objects.exists()
    assert not storage.exists(name)
    assert AuditLog.objects.filter(action="cms.notice_deleted").exists()
