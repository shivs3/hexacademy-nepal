from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.learning.models import Assignment, Enrollment, Submission
from apps.learning.services import enroll_free
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

ADMIN = "/api/v1/admin/learning/assignments/"


@pytest.fixture
def team(client_for, make_course, make_user):
    """An instructor and a TA on one course, plus an enrolled student."""
    instructor = client_for(roles.INSTRUCTOR)
    ta = client_for(roles.TEACHING_ASSISTANT)
    course = make_course(instructor=instructor.user, ta=ta.user)
    student = client_for(roles.STUDENT)
    enroll_free(student.user, course)
    return instructor, ta, student, course


def _assignment(course, **extra):
    return Assignment.objects.create(
        course=course,
        title=extra.pop("title", "Essay"),
        instructions="<p>Write it.</p>",
        is_published=extra.pop("is_published", True),
        **extra,
    )


def _pdf(name="work.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4\n%%EOF", content_type="application/pdf")


# --- Authoring -----------------------------------------------------------------------


def test_instructor_creates_and_edits_assignment_on_own_course(team):
    instructor, _, _, course = team
    lesson = course.lessons.first()
    due = (timezone.now() + timedelta(days=3)).isoformat()
    res = instructor.post(
        ADMIN,
        {
            "course": course.pk,
            "lesson": lesson.pk,
            "title": "  Lab   report ",
            "instructions": "<p>Go</p><script>x</script>",
            "due_at": due,
            "max_points": 20,
        },
        format="json",
    )
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["title"] == "Lab report" and "<script" not in body["instructions"]
    assert body["lesson"] == {"id": lesson.pk, "title": lesson.title}
    assert body["can_edit"] and body["can_grade"] and body["submitted_count"] == 0
    assert body["is_published"] is False  # drafts by default

    res = instructor.patch(f"{ADMIN}{body['id']}/", {"is_published": True}, format="json")
    assert res.status_code == 200 and res.json()["is_published"]
    assert instructor.patch(f"{ADMIN}{body['id']}/", {"course": course.pk}, format="json").status_code == 400
    assert AuditLog.objects.filter(action="learning.assignment_created").exists()


def test_create_validation(team, make_course):
    instructor, _, _, course = team
    other_lesson = make_course().lessons.first()
    post = lambda data: instructor.post(ADMIN, {"course": course.pk, "title": "T", **data}, format="json")  # noqa: E731
    assert "lesson" in post({"lesson": other_lesson.pk}).json()["error"]["details"]
    assert "accepts_text" in post({"accepts_text": False, "accepts_file": False}).json()["error"]["details"]
    past = (timezone.now() - timedelta(hours=1)).isoformat()
    assert "due_at" in post({"due_at": past}).json()["error"]["details"]
    assert "title" in instructor.post(ADMIN, {"course": course.pk}, format="json").json()["error"]["details"]


def test_instructor_cannot_author_on_other_courses_and_ta_cannot_author(team, make_course):
    instructor, ta, _, course = team
    other = make_course()
    assert instructor.post(ADMIN, {"course": other.pk, "title": "X"}, format="json").status_code == 403
    assert ta.post(ADMIN, {"course": course.pk, "title": "X"}, format="json").status_code == 403
    foreign = _assignment(other)
    assert instructor.get(f"{ADMIN}{foreign.pk}/").status_code == 404
    assert [a["id"] for a in instructor.get(ADMIN).json()["results"]] == []


def test_content_editor_authors_but_cannot_read_submissions(team, client_for):
    _, _, student, course = team
    editor = client_for(roles.CONTENT_EDITOR)
    res = editor.post(ADMIN, {"course": course.pk, "title": "Editor task", "is_published": True}, format="json")
    assert res.status_code == 201
    assert res.json()["can_grade"] is False
    pk = res.json()["id"]
    student.post(f"/api/v1/assignments/{pk}/submission/", {"text": "answer"})
    assert editor.get(f"{ADMIN}{pk}/submissions/").status_code == 403
    sub = Submission.objects.get()
    assert editor.get(f"/api/v1/admin/learning/submissions/{sub.pk}/").status_code == 404


def test_students_and_finance_cannot_use_staff_endpoints(team, client_for):
    _, _, student, course = team
    _assignment(course)
    assert student.get(ADMIN).status_code == 403
    finance = client_for(roles.FINANCE_MANAGER)
    assert finance.get(ADMIN).json()["count"] == 0


def test_delete_blocked_once_work_exists(team):
    instructor, _, student, course = team
    empty, used = _assignment(course, title="Empty"), _assignment(course, title="Used")
    student.post(f"/api/v1/assignments/{used.pk}/submission/", {"text": "hi"})
    assert instructor.delete(f"{ADMIN}{empty.pk}/").status_code == 204
    res = instructor.delete(f"{ADMIN}{used.pk}/")
    assert res.status_code == 409 and res.json()["error"]["code"] == "has_submissions"


def test_course_options_list_authorable_courses_with_lessons(team, make_course):
    instructor, ta, _, course = team
    make_course()
    res = instructor.get("/api/v1/admin/learning/assignment-courses/").json()
    assert [c["id"] for c in res] == [course.pk]
    assert [lesson["title"] for lesson in res[0]["lessons"]] == ["Lesson 1", "Lesson 2"]
    assert ta.get("/api/v1/admin/learning/assignment-courses/").json() == []


# --- Learner side --------------------------------------------------------------------


def test_learner_sees_only_published_assignments_of_enrolled_courses(team, make_course, client_for):
    _, _, student, course = team
    visible = _assignment(course)
    _assignment(course, title="Draft", is_published=False)
    _assignment(make_course(), title="Elsewhere")
    res = student.get("/api/v1/me/assignments/").json()
    assert [a["id"] for a in res["results"]] == [visible.pk]
    assert res["results"][0]["can_submit"] is True and res["results"][0]["submission"] is None
    assert "instructions" in student.get(f"/api/v1/assignments/{visible.pk}/").json()

    stranger = client_for(roles.STUDENT)
    assert stranger.get(f"/api/v1/assignments/{visible.pk}/").status_code == 404
    assert stranger.post(f"/api/v1/assignments/{visible.pk}/submission/", {"text": "x"}).status_code == 404


def test_submit_text_and_file_then_resubmit_replaces(team):
    _, _, student, course = team
    a = _assignment(course)
    url = f"/api/v1/assignments/{a.pk}/submission/"
    res = student.post(url, {"text": "First try", "file": _pdf()}, format="multipart")
    assert res.status_code == 200, res.json()
    first = res.json()
    assert first["attempt"] == 1 and first["has_file"] and first["original_name"] == "work.pdf"
    assert first["points"] is None and first["is_late"] is False

    file_res = student.get(f"{url}file/")
    assert file_res.status_code == 200 and file_res["Cache-Control"] == "private, no-store"

    res = student.post(url, {"text": "Second try", "remove_file": "true"}, format="multipart")
    assert res.json()["attempt"] == 2 and res.json()["has_file"] is False
    assert student.get(f"{url}file/").status_code == 404
    assert Submission.objects.count() == 1


def test_submission_rules(team):
    _, _, student, course = team
    file_only = _assignment(course, accepts_text=False)
    text_only = _assignment(course, accepts_file=False)
    res = student.post(f"/api/v1/assignments/{file_only.pk}/submission/", {"text": "words"})
    assert "text" in res.json()["error"]["details"]
    res = student.post(f"/api/v1/assignments/{text_only.pk}/submission/", {"file": _pdf()}, format="multipart")
    assert "file" in res.json()["error"]["details"]
    res = student.post(f"/api/v1/assignments/{text_only.pk}/submission/", {"text": "   "})
    assert res.status_code == 400
    bad = SimpleUploadedFile("evil.pdf", b"MZ\x90\x00binary", content_type="application/pdf")
    res = student.post(f"/api/v1/assignments/{file_only.pk}/submission/", {"file": bad}, format="multipart")
    assert res.status_code == 400 and not Submission.objects.exists()


def test_late_work_follows_allow_late(team):
    _, _, student, course = team
    past = timezone.now() - timedelta(hours=1)
    closed = _assignment(course, due_at=past, allow_late=False)
    late_ok = _assignment(course, due_at=past, allow_late=True)
    res = student.post(f"/api/v1/assignments/{closed.pk}/submission/", {"text": "late"})
    assert res.status_code == 409 and res.json()["error"]["code"] == "closed"
    listing = {a["id"]: a for a in student.get("/api/v1/me/assignments/").json()["results"]}
    assert listing[closed.pk]["can_submit"] is False and listing[closed.pk]["closed_reason"]
    res = student.post(f"/api/v1/assignments/{late_ok.pk}/submission/", {"text": "late"})
    assert res.status_code == 200 and res.json()["is_late"] is True


def test_revoked_learner_cannot_submit_or_read(team):
    _, _, student, course = team
    a = _assignment(course)
    Enrollment.objects.filter(user=student.user).update(status=Enrollment.Status.REVOKED, revoked_at=timezone.now())
    assert student.get(f"/api/v1/assignments/{a.pk}/").status_code == 404
    assert student.post(f"/api/v1/assignments/{a.pk}/submission/", {"text": "x"}).status_code == 404


# --- Grading -------------------------------------------------------------------------


def test_ta_returns_then_grades_and_learner_is_notified(team):
    _, ta, student, course = team
    a = _assignment(course, max_points=10)
    url = f"/api/v1/assignments/{a.pk}/submission/"
    student.post(url, {"text": "draft"})
    sub = Submission.objects.get()
    grade_url = f"/api/v1/admin/learning/submissions/{sub.pk}/grade/"

    listing = ta.get(f"{ADMIN}{a.pk}/submissions/").json()["results"]
    assert [s["id"] for s in listing] == [sub.pk]
    assert ta.get(f"{ADMIN}?needs_grading=true").json()["count"] == 1

    assert ta.post(grade_url, {"outcome": "returned"}, format="json").status_code == 400  # feedback needed
    res = ta.post(grade_url, {"outcome": "returned", "feedback": "Add sources."}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "returned"
    mine = student.get(f"/api/v1/assignments/{a.pk}/").json()["submission"]
    assert mine["feedback"] == "Add sources." and mine["points"] is None
    assert Notification.objects.filter(user=student.user, kind="submission_returned").exists()

    student.post(url, {"text": "final"})
    assert ta.post(grade_url, {"outcome": "graded", "points": 11}, format="json").status_code == 400
    res = ta.post(grade_url, {"outcome": "graded", "points": 9, "feedback": "Good."}, format="json")
    assert res.status_code == 200 and res.json()["points"] == 9
    mine = student.get(f"/api/v1/assignments/{a.pk}/").json()
    assert mine["submission"]["points"] == 9 and mine["can_submit"] is False
    assert Notification.objects.filter(user=student.user, kind="submission_graded").exists()

    res = student.post(url, {"text": "sneaky change"})
    assert res.status_code == 409 and res.json()["error"]["code"] in ("graded", "closed")
    assert Submission.objects.get().text == "final"
    assert AuditLog.objects.filter(action="learning.submission_graded").exists()


def test_max_points_cannot_drop_below_awarded(team):
    instructor, _, student, course = team
    a = _assignment(course, max_points=50)
    student.post(f"/api/v1/assignments/{a.pk}/submission/", {"text": "x"})
    sub = Submission.objects.get()
    instructor.post(f"/api/v1/admin/learning/submissions/{sub.pk}/grade/", {"outcome": "graded", "points": 40},
                    format="json")  # fmt: skip
    assert instructor.patch(f"{ADMIN}{a.pk}/", {"max_points": 30}, format="json").status_code == 400
    assert instructor.patch(f"{ADMIN}{a.pk}/", {"max_points": 40}, format="json").status_code == 200


def test_other_course_staff_cannot_grade_or_download(team, client_for, make_course):
    _, _, student, course = team
    a = _assignment(course)
    student.post(f"/api/v1/assignments/{a.pk}/submission/", {"file": _pdf()}, format="multipart")
    sub = Submission.objects.get()
    outsider = client_for(roles.INSTRUCTOR)
    make_course(instructor=outsider.user)
    base = f"/api/v1/admin/learning/submissions/{sub.pk}/"
    assert outsider.get(base).status_code == 404
    assert outsider.get(f"{base}file/").status_code == 404
    assert outsider.post(f"{base}grade/", {"outcome": "graded", "points": 1}, format="json").status_code == 404
    another = client_for(roles.STUDENT)
    assert another.get(base).status_code == 403


def test_teaching_team_downloads_submission_file(team):
    instructor, _, student, course = team
    a = _assignment(course)
    student.post(f"/api/v1/assignments/{a.pk}/submission/", {"file": _pdf()}, format="multipart")
    sub = Submission.objects.get()
    res = instructor.get(f"/api/v1/admin/learning/submissions/{sub.pk}/file/")
    assert res.status_code == 200 and res["Content-Disposition"].startswith("attachment")
