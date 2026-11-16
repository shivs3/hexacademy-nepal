import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.catalog import resources
from apps.catalog.models import LessonResource, LessonResourcePage

pytestmark = pytest.mark.django_db


@pytest.fixture
def pdf(make_pdf):
    return make_pdf(3)


def _upload(client, lesson, content, name="notes.pdf", content_type="application/pdf", **extra):
    return client.post(
        f"/api/v1/admin/catalog/lessons/{lesson.pk}/resources/",
        {"file": SimpleUploadedFile(name, content, content_type=content_type), **extra},
        format="multipart",
    )


def test_instructor_uploads_pdf_and_pages_are_prepared(
    client_for, make_course, pdf, django_capture_on_commit_callbacks
):
    teacher = client_for(roles.INSTRUCTOR)
    lesson = make_course(instructor=teacher.user).lessons.first()
    with django_capture_on_commit_callbacks(execute=True):
        res = _upload(teacher, lesson, pdf, title="Week 1 notes")
    assert res.status_code == 201, res.json()
    assert res.json()["render_status"] == "pending" and res.json()["page_count"] == 3
    resource = LessonResource.objects.get()
    assert resource.mime_type == "application/pdf" and resource.original_name == "notes.pdf"
    assert resource.file.name.startswith(f"lessons/{lesson.course_id}/")
    # The worker (eager in tests) rendered every page.
    assert resource.render_status == "ready" and resource.page_count == 3
    pages = list(resource.pages.all())
    assert [p.number for p in pages] == [1, 2, 3]
    assert all(p.width == 1600 and p.height > 0 and p.image.name.endswith(".webp") for p in pages)


def test_broken_pdf_and_disguised_files_are_rejected(client_for, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()
    res = _upload(editor, lesson, b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")
    assert res.status_code == 400 and "could not be opened" in res.json()["error"]["details"]["file"][0]
    assert _upload(editor, lesson, b"MZ\x90\x00 not really a pdf").status_code == 400
    assert (
        _upload(editor, lesson, b"<script>alert(1)</script>", name="x.html", content_type="text/html").status_code
        == 400
    )
    assert not LessonResource.objects.exists()


def test_files_that_cannot_be_shown_in_the_page_are_refused(client_for, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()
    zipped = b"PK\x03\x04" + b"\x00" * 60
    res = _upload(editor, lesson, zipped, name="code.zip", content_type="application/zip")
    assert res.status_code == 400
    assert "PDF" in str(res.json()["error"])


def test_text_and_images_need_no_rendering(client_for, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()
    res = _upload(editor, lesson, b"print('hello')\n", name="hello.py", content_type="text/plain")
    assert res.status_code == 201, res.json()
    assert res.json()["render_status"] == "none"
    assert LessonResource.objects.get().viewer == "text"


def test_failed_render_is_reported_and_can_be_retried(
    client_for, make_course, pdf, django_capture_on_commit_callbacks, monkeypatch
):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()

    def broken(*args, **kwargs):
        raise resources.PdfError("Page 2 of the PDF could not be rendered.")

    monkeypatch.setattr(resources, "render_pages", broken)
    with django_capture_on_commit_callbacks(execute=True):
        resource_id = _upload(editor, lesson, pdf).json()["id"]
    resource = LessonResource.objects.get(pk=resource_id)
    assert resource.render_status == "failed" and "Page 2" in resource.render_error
    assert not LessonResourcePage.objects.exists()

    monkeypatch.undo()
    with django_capture_on_commit_callbacks(execute=True):
        res = editor.post(f"/api/v1/admin/catalog/resources/{resource_id}/render/")
    assert res.status_code == 200 and res.json()["render_status"] == "pending"
    resource.refresh_from_db()
    assert resource.render_status == "ready" and resource.pages.count() == 3
    assert AuditLog.objects.filter(action="catalog.resource_render_requested").exists()


def test_deleting_a_pdf_removes_its_pages(client_for, make_course, pdf, django_capture_on_commit_callbacks):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()
    with django_capture_on_commit_callbacks(execute=True):
        resource_id = _upload(editor, lesson, pdf).json()["id"]
    page = LessonResourcePage.objects.first()
    storage, name = page.image.storage, page.image.name
    assert storage.exists(name)
    with django_capture_on_commit_callbacks(execute=True):
        assert editor.delete(f"/api/v1/admin/catalog/resources/{resource_id}/").status_code == 204
    assert not LessonResourcePage.objects.exists()
    assert not storage.exists(name)


def test_link_resource_requires_safe_url(client_for, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    lesson = make_course().lessons.first()
    url = f"/api/v1/admin/catalog/lessons/{lesson.pk}/resources/"
    bad = editor.post(url, {"title": "x", "url": "javascript:alert(1)"}, format="json")
    assert bad.status_code == 400
    ok = editor.post(url, {"title": "Docs", "url": "https://docs.python.org/3/"}, format="json")
    assert ok.status_code == 201, ok.json()


def test_other_instructor_cannot_upload_download_or_rerender(client_for, make_course, pdf):
    owner = client_for(roles.INSTRUCTOR)
    lesson = make_course(instructor=owner.user).lessons.first()
    resource_id = _upload(owner, lesson, pdf).json()["id"]
    stranger = client_for(roles.INSTRUCTOR)
    assert _upload(stranger, lesson, pdf).status_code == 404
    assert stranger.get(f"/api/v1/admin/catalog/resources/{resource_id}/download/").status_code == 404
    assert stranger.post(f"/api/v1/admin/catalog/resources/{resource_id}/render/").status_code == 404
    # Staff keep the original for editing.
    assert owner.get(f"/api/v1/admin/catalog/resources/{resource_id}/download/").status_code == 200


def test_management_command_renders_pending_pdfs(make_course, make_user, pdf):
    from django.core.management import call_command

    lesson = make_course().lessons.first()
    upload = SimpleUploadedFile("notes.pdf", pdf, content_type="application/pdf")
    resource = resources.add_file(lesson, upload, title="Notes", actor=make_user(roles.CONTENT_EDITOR))
    assert resource.render_status == "pending"  # on_commit never ran: the queue was "down"
    call_command("render_lesson_pdfs")
    resource.refresh_from_db()
    assert resource.render_status == "ready" and resource.pages.count() == 3
