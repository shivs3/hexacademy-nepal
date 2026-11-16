from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.catalog import resources
from apps.catalog.models import Lesson
from apps.learning.models import Enrollment
from apps.learning.services import enroll_free

pytestmark = pytest.mark.django_db


def _lessons(course):
    return list(Lesson.objects.filter(course=course).order_by("position"))


# --- Enrollment ----------------------------------------------------------------------


def test_student_enrolls_in_free_course_idempotently(client_for, make_course):
    student = client_for(roles.STUDENT)
    course = make_course()
    res = student.post(f"/api/v1/courses/{course.slug}/enroll/")
    assert res.status_code == 201, res.json()
    assert res.json()["progress"] == {"total_lessons": 2, "completed_lessons": 0, "percent": 0,
                                      "next_lesson_id": _lessons(course)[0].pk}  # fmt: skip
    assert student.post(f"/api/v1/courses/{course.slug}/enroll/").status_code == 200
    assert Enrollment.objects.count() == 1
    mine = student.get("/api/v1/me/enrollments/").json()["results"]
    assert [e["course"]["slug"] for e in mine] == [course.slug]


def test_my_enrollments_list_recently_studied_first(client_for, make_course):
    student = client_for(roles.STUDENT)
    studied, untouched = make_course(slug="studied"), make_course(slug="untouched")
    student.post(f"/api/v1/courses/{studied.slug}/enroll/")
    student.post(f"/api/v1/courses/{untouched.slug}/enroll/")  # newer enrollment, never opened
    student.post(f"/api/v1/lessons/{_lessons(studied)[0].pk}/progress/", {}, format="json")
    mine = student.get("/api/v1/me/enrollments/").json()["results"]
    assert [e["course"]["slug"] for e in mine] == ["studied", "untouched"]


def test_paid_course_cannot_be_self_enrolled(client_for, make_course):
    student = client_for(roles.STUDENT)
    course = make_course(price=Decimal("2000"))
    res = student.post(f"/api/v1/courses/{course.slug}/enroll/")
    assert res.status_code == 402
    assert res.json()["error"]["code"] == "payment_required"
    assert not Enrollment.objects.exists()


def test_draft_and_archived_courses_reject_enrollment(client_for, make_course):
    student = client_for(roles.STUDENT)
    assert student.post(f"/api/v1/courses/{make_course(status='draft').slug}/enroll/").status_code == 404
    assert student.post(f"/api/v1/courses/{make_course(status='archived').slug}/enroll/").status_code == 404


def test_anonymous_cannot_enroll(api_client, make_course):
    assert api_client.post(f"/api/v1/courses/{make_course().slug}/enroll/").status_code in (401, 403)


def test_revoked_learner_cannot_re_enroll_or_open_lessons(client_for, make_course, make_user):
    student = client_for(roles.STUDENT)
    course = make_course()
    enrollment, _ = enroll_free(student.user, course)
    from apps.learning.services import revoke

    revoke(enrollment, actor=make_user(roles.SUPPORT_STAFF))
    assert student.post(f"/api/v1/courses/{course.slug}/enroll/").status_code == 403
    assert student.get(f"/api/v1/lessons/{_lessons(course)[0].pk}/").status_code == 403
    assert student.get("/api/v1/me/enrollments/").json()["count"] == 0


# --- Lesson access -------------------------------------------------------------------


def test_lesson_requires_enrollment_unless_preview(api_client, client_for, make_course):
    course = make_course()
    first, second = _lessons(course)
    first.is_preview = True
    first.save()
    assert api_client.get(f"/api/v1/lessons/{first.pk}/").status_code == 200
    res = api_client.get(f"/api/v1/lessons/{second.pk}/")
    assert res.status_code == 403 and res.json()["error"]["code"] == "not_enrolled"
    assert "<p>Body</p>" not in res.content.decode()

    student = client_for(roles.STUDENT)
    enroll_free(student.user, course)
    res = student.get(f"/api/v1/lessons/{second.pk}/")
    assert res.status_code == 200
    body = res.json()
    assert body["lesson"]["body"] == "<p>Body</p>" and body["previous_lesson_id"] == first.pk
    assert body["next_lesson_id"] is None and body["enrolled"] is True


def test_unpublished_lesson_and_draft_course_are_unavailable_to_learners(client_for, make_course):
    student = client_for(roles.STUDENT)
    course = make_course()
    enroll_free(student.user, course)
    lesson = _lessons(course)[0]
    lesson.is_published = False
    lesson.save()
    assert student.get(f"/api/v1/lessons/{lesson.pk}/").status_code == 404
    draft = make_course(status="draft")
    draft_lesson = _lessons(draft)[0]
    draft_lesson.is_preview = True
    draft_lesson.save()
    assert student.get(f"/api/v1/lessons/{draft_lesson.pk}/").status_code == 404


def test_sequential_course_locks_later_lessons(client_for, make_course):
    student = client_for(roles.STUDENT)
    course = make_course(lessons=3, sequential=True)
    enroll_free(student.user, course)
    first, second, third = _lessons(course)
    res = student.get(f"/api/v1/lessons/{second.pk}/")
    assert res.status_code == 403 and res.json()["error"]["code"] == "locked"

    outline = student.get(f"/api/v1/me/courses/{course.slug}/").json()
    locks = {lesson["id"]: lesson["locked"] for lesson in outline["modules"][0]["lessons"]}
    assert locks == {first.pk: False, second.pk: True, third.pk: True}

    assert student.post(f"/api/v1/lessons/{first.pk}/progress/", {"completed": True}, format="json").status_code == 200
    assert student.get(f"/api/v1/lessons/{second.pk}/").status_code == 200
    assert student.get(f"/api/v1/lessons/{third.pk}/").status_code == 403


def test_instructor_previews_own_draft_course_but_not_others(client_for, make_course, make_user):
    teacher = client_for(roles.INSTRUCTOR)
    own = make_course(status="draft", instructor=teacher.user)
    lesson = _lessons(own)[0]
    lesson.is_published = False
    lesson.save()
    res = teacher.get(f"/api/v1/lessons/{lesson.pk}/")
    assert res.status_code == 200 and res.json()["staff_preview"] is True
    outline = teacher.get(f"/api/v1/me/courses/{own.slug}/")
    assert outline.status_code == 200 and outline.json()["staff_preview"] is True

    other = make_course(status="draft", instructor=make_user(roles.INSTRUCTOR))
    assert teacher.get(f"/api/v1/lessons/{_lessons(other)[0].pk}/").status_code == 404
    assert teacher.get(f"/api/v1/me/courses/{other.slug}/").status_code == 404


def test_player_outline_needs_enrollment(client_for, make_course):
    student = client_for(roles.STUDENT)
    course = make_course()
    res = student.get(f"/api/v1/me/courses/{course.slug}/")
    assert res.status_code == 403 and res.json()["error"]["code"] == "not_enrolled"


# --- Progress ------------------------------------------------------------------------


def test_progress_is_recorded_and_course_completion_is_server_derived(client_for, make_course):
    student = client_for(roles.STUDENT)
    course = make_course(lessons=2)
    enroll_free(student.user, course)
    first, second = _lessons(course)

    res = student.post(f"/api/v1/lessons/{first.pk}/progress/", {}, format="json")
    assert res.status_code == 200 and res.json()["completed"] is False
    enrollment = Enrollment.objects.get()
    assert enrollment.last_lesson_id == first.pk and enrollment.last_accessed_at

    res = student.post(f"/api/v1/lessons/{first.pk}/progress/", {"completed": True}, format="json").json()
    assert res["completed"] is True and res["course_completed"] is False and res["progress"]["percent"] == 50
    res = student.post(f"/api/v1/lessons/{second.pk}/progress/", {"completed": True}, format="json").json()
    assert res["course_completed"] is True and res["progress"]["percent"] == 100

    res = student.post(f"/api/v1/lessons/{second.pk}/progress/", {"completed": False}, format="json").json()
    assert res["completed"] is False and res["progress"]["completed_lessons"] == 1


def test_progress_on_preview_lesson_requires_enrollment(api_client, client_for, make_course):
    course = make_course()
    lesson = _lessons(course)[0]
    lesson.is_preview = True
    lesson.save()
    assert api_client.post(f"/api/v1/lessons/{lesson.pk}/progress/", {}, format="json").status_code in (401, 403)
    student = client_for(roles.STUDENT)
    assert student.post(f"/api/v1/lessons/{lesson.pk}/progress/", {}, format="json").status_code == 403


def test_lesson_progress_of_other_course_is_not_writable(client_for, make_course):
    student = client_for(roles.STUDENT)
    enroll_free(student.user, make_course())
    other = make_course()
    res = student.post(f"/api/v1/lessons/{_lessons(other)[0].pk}/progress/", {"completed": True}, format="json")
    assert res.status_code == 403


# --- Lesson files: viewed in the page, never downloaded --------------------------------


def _pdf_resource(lesson, make_user, make_pdf, capture):
    upload = SimpleUploadedFile("notes.pdf", make_pdf(2), content_type="application/pdf")
    with capture(execute=True):
        return resources.add_file(lesson, upload, title="Notes", actor=make_user(roles.CONTENT_EDITOR))


def test_pdf_pages_are_authorised_per_lesson(
    client_for, make_course, make_user, make_pdf, django_capture_on_commit_callbacks
):
    course = make_course()
    first, second = _lessons(course)
    resource = _pdf_resource(first, make_user, make_pdf, django_capture_on_commit_callbacks)

    student = client_for(roles.STUDENT)
    page_url = f"/api/v1/lessons/{first.pk}/resources/{resource.pk}/pages/1/"
    assert student.get(page_url).status_code == 403
    assert APIClient().get(page_url).status_code in (401, 403)
    enroll_free(student.user, course)
    res = student.get(page_url)
    assert res.status_code == 200
    assert res["Content-Type"] == "image/webp" and res["Cache-Control"] == "private, no-store"
    assert res["Content-Disposition"].startswith("inline")
    assert student.get(f"/api/v1/lessons/{first.pk}/resources/{resource.pk}/pages/3/").status_code == 404
    # Addressed through its own lesson only (no IDOR via another lesson).
    assert student.get(f"/api/v1/lessons/{second.pk}/resources/{resource.pk}/pages/1/").status_code == 404
    # The original PDF has no learner URL at all.
    assert student.get(f"/api/v1/lessons/{first.pk}/resources/{resource.pk}/download/").status_code == 404
    assert student.get(f"/api/v1/lessons/{first.pk}/resources/{resource.pk}/view/").status_code == 404

    lesson = student.get(f"/api/v1/lessons/{first.pk}/").json()["lesson"]
    [shown] = lesson["resources"]
    assert shown["viewer"] == "pdf" and shown["status"] == "ready"
    assert [p["number"] for p in shown["pages"]] == [1, 2]
    assert "original_name" not in shown and "mime_type" not in shown


def test_preview_lesson_pages_are_open_to_visitors(
    make_course, make_user, make_pdf, django_capture_on_commit_callbacks
):
    course = make_course()
    first, _ = _lessons(course)
    first.is_preview = True
    first.save(update_fields=["is_preview"])
    resource = _pdf_resource(first, make_user, make_pdf, django_capture_on_commit_callbacks)
    res = APIClient().get(f"/api/v1/lessons/{first.pk}/resources/{resource.pk}/pages/2/")
    assert res.status_code == 200


def test_pages_are_hidden_until_ready(client_for, make_course, make_user, make_pdf):
    course = make_course()
    first, _ = _lessons(course)
    upload = SimpleUploadedFile("notes.pdf", make_pdf(1), content_type="application/pdf")
    resource = resources.add_file(first, upload, title="Notes", actor=make_user(roles.CONTENT_EDITOR))
    student = client_for(roles.STUDENT)
    enroll_free(student.user, course)
    [shown] = student.get(f"/api/v1/lessons/{first.pk}/").json()["lesson"]["resources"]
    assert shown["status"] == "pending" and shown["pages"] == []
    assert student.get(f"/api/v1/lessons/{first.pk}/resources/{resource.pk}/pages/1/").status_code == 404


def test_text_files_are_shown_inline_and_sandboxed(client_for, make_course, make_user):
    course = make_course()
    first, _ = _lessons(course)
    code = SimpleUploadedFile("hello.py", b"print('<b>hi</b>')\n", content_type="text/plain")
    resource = resources.add_file(first, code, title="Code", actor=make_user(roles.CONTENT_EDITOR))
    student = client_for(roles.STUDENT)
    url = f"/api/v1/lessons/{first.pk}/resources/{resource.pk}/view/"
    assert student.get(url).status_code == 403
    enroll_free(student.user, course)
    res = student.get(url)
    assert res.status_code == 200 and res.content == b"print('<b>hi</b>')\n"
    assert res["Content-Type"].startswith("text/plain") and res["Content-Disposition"].startswith("inline")
    assert "sandbox" in res["Content-Security-Policy"]


def test_files_that_cannot_be_shown_are_not_offered(client_for, make_course):
    from apps.catalog.models import LessonResource

    course = make_course()
    first, _ = _lessons(course)
    # An older upload from before lessons were view-only.
    LessonResource.objects.create(
        lesson=first,
        title="Old slides",
        kind="file",
        file="lessons/x/old.pptx",
        original_name="old.pptx",
        mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size_bytes=10,
    )
    student = client_for(roles.STUDENT)
    enroll_free(student.user, course)
    assert student.get(f"/api/v1/lessons/{first.pk}/").json()["lesson"]["resources"] == []


# --- Staff enrollment management -----------------------------------------------------


def test_support_grants_revokes_and_reinstates(client_for, make_course, make_user):
    support = client_for(roles.SUPPORT_STAFF)
    learner = make_user(email="learner@example.com")
    course = make_course(price=Decimal("3000"))
    url = "/api/v1/admin/learning/enrollments/"

    res = support.post(url, {"course": course.pk, "email": "LEARNER@example.com"}, format="json")
    assert res.status_code == 201, res.json()
    enrollment_id = res.json()["id"]
    assert res.json()["source"] == "admin" and res.json()["total_lessons"] == 2

    assert support.post(f"{url}{enrollment_id}/revoke/").json()["status"] == "revoked"
    assert support.post(f"{url}{enrollment_id}/revoke/").status_code == 409
    assert support.post(f"{url}{enrollment_id}/reinstate/").json()["status"] == "active"
    detail = support.get(f"{url}{enrollment_id}/").json()
    assert len(detail["lessons"]) == 2
    assert learner.enrollments.get().is_active


def test_grant_rejects_unknown_email_and_draft_course(client_for, make_course):
    support = client_for(roles.SUPPORT_STAFF)
    url = "/api/v1/admin/learning/enrollments/"
    assert (
        support.post(url, {"course": make_course().pk, "email": "nobody@example.com"}, format="json").status_code == 400
    )
    draft = make_course(status="draft")
    assert support.post(url, {"course": draft.pk, "email": support.user.email}, format="json").status_code == 400


def test_instructor_sees_only_own_learners_and_cannot_grant(client_for, make_course, make_user):
    teacher = client_for(roles.INSTRUCTOR)
    own = make_course(instructor=teacher.user)
    other = make_course()
    enroll_free(make_user(), own)
    foreign, _ = enroll_free(make_user(), other)
    url = "/api/v1/admin/learning/enrollments/"
    rows = teacher.get(url).json()["results"]
    assert [r["course"]["id"] for r in rows] == [own.pk]
    assert teacher.get(f"{url}{foreign.pk}/").status_code == 404
    res = teacher.post(url, {"course": own.pk, "email": make_user().email}, format="json")
    assert res.status_code == 403
    assert client_for(roles.STUDENT).get(url).status_code == 403
    assert client_for(roles.FINANCE_MANAGER).get(url).json()["count"] == 0


def test_enrollment_course_options_are_scoped(client_for, make_course):
    url = "/api/v1/admin/learning/courses/"
    teacher = client_for(roles.INSTRUCTOR)
    own = make_course(title="Own", instructor=teacher.user)
    other = make_course(title="Other")
    make_course(title="Draft", status="draft")
    archived = make_course(title="Archived", status="archived")
    support = client_for(roles.SUPPORT_STAFF)
    assert {c["id"] for c in support.get(url).json()} == {own.pk, other.pk, archived.pk}
    assert [c["id"] for c in teacher.get(url).json()] == [own.pk]
    assert client_for(roles.STUDENT).get(url).status_code == 403


def test_unverified_learner_cannot_enroll_until_verified(client_for, make_course, settings):
    course = make_course()
    learner = client_for(verified=False)
    res = learner.post(f"/api/v1/courses/{course.slug}/enroll/")
    assert res.status_code == 403 and res.json()["error"]["code"] == "email_unverified"
    assert not Enrollment.objects.filter(user=learner.user).exists()

    settings.EMAIL_VERIFICATION_REQUIRED = False
    assert learner.post(f"/api/v1/courses/{course.slug}/enroll/").status_code == 201
