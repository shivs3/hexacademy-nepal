import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts import roles
from apps.catalog.models import LessonResource

pytestmark = pytest.mark.django_db
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def _upload(client, lesson, name="notes.pdf", content=PDF, **extra):
    return client.post(
        f"/api/v1/admin/catalog/lessons/{lesson.pk}/resources/",
        {"file": SimpleUploadedFile(name, content, content_type="application/pdf"), **extra},
        format="multipart",
    )


def test_instructor_uploads_pdf_to_own_lesson(client_for, make_course):
    teacher = client_for(roles.INSTRUCTOR)
    lesson = make_course(instructor=teacher.user).lessons.first()
    res = _upload(teacher, lesson, title="Week 1 notes")
    assert res.status_code == 201, res.json()
    resource = LessonResource.objects.get()
    assert resource.mime_type == "application/pdf" and resource.original_name == "notes.pdf"
    assert resource.file.name.startswith(f"lessons/{lesson.course_id}/")


def test_disguised_executable_is_rejected(client_for, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()
    res = _upload(editor, lesson, name="notes.pdf", content=b"MZ\x90\x00 not really a pdf")
    assert res.status_code == 400
    res = _upload(editor, lesson, name="script.html", content=b"<script>alert(1)</script>")
    assert res.status_code == 400
    assert not LessonResource.objects.exists()


def test_link_resource_requires_safe_url(client_for, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()
    url = f"/api/v1/admin/catalog/lessons/{lesson.pk}/resources/"
    bad = editor.post(url, {"title": "x", "url": "javascript:alert(1)"}, format="json")
    assert bad.status_code == 400
    ok = editor.post(url, {"title": "Docs", "url": "https://docs.python.org/3/"}, format="json")
    assert ok.status_code == 201, ok.json()


def test_other_instructor_cannot_upload_or_download(client_for, make_course):
    owner = client_for(roles.INSTRUCTOR)
    lesson = make_course(instructor=owner.user).lessons.first()
    resource_id = _upload(owner, lesson).json()["id"]
    stranger = client_for(roles.INSTRUCTOR)
    assert _upload(stranger, lesson).status_code == 404
    assert stranger.get(f"/api/v1/admin/catalog/resources/{resource_id}/download/").status_code == 404
    assert owner.get(f"/api/v1/admin/catalog/resources/{resource_id}/download/").status_code == 200
