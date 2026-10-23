"""Certificate eligibility, issuing triggers, privacy, PDF, verification and revocation."""

import pytest
from django.utils import timezone

from apps.accounts import roles
from apps.assessments.models import AttemptQuestion, Exam
from apps.assessments.tests.conftest import correct_ids
from apps.audit.models import AuditLog
from apps.certificates.models import Certificate, CertificateRule, CertificateTemplate
from apps.certificates.services import issue_if_eligible, new_number
from apps.learning.models import Assignment, Submission
from apps.learning.services import enroll_free
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture
def template(db):
    return CertificateTemplate.objects.create(name="Standard", signatory_name="Demo Signatory")


def rule_for(course, template, **kw):
    kw.setdefault("is_enabled", True)
    return CertificateRule.objects.create(course=course, template=template, **kw)


def complete_lessons(client, course):
    for lesson in course.lessons.all():
        assert (
            client.post(f"/api/v1/lessons/{lesson.pk}/progress/", {"completed": True}, format="json").status_code == 200
        )


def pass_exam(client, exam):
    attempt_id = client.post(f"/api/v1/exams/{exam.slug}/attempts/").json()["id"]
    for q in AttemptQuestion.objects.filter(attempt_id=attempt_id):
        client.put(f"/api/v1/attempts/{attempt_id}/answers/{q.pk}/", {"selected": correct_ids(q)}, format="json")
    assert client.post(f"/api/v1/attempts/{attempt_id}/submit/").status_code == 200


def test_number_format():
    number = new_number()
    assert number.startswith(f"HXN-{timezone.localtime().year}-") and len(number) == 17
    assert not set(number[9:]) & set("ILOU")


def test_completing_every_lesson_issues_once_and_notifies(client_for, make_course, template,
                                                          django_capture_on_commit_callbacks):  # fmt: skip
    course = make_course(lessons=2)
    rule_for(course, template)
    client = client_for()
    enroll_free(client.user, course)
    first = course.lessons.first()
    with django_capture_on_commit_callbacks(execute=True):
        client.post(f"/api/v1/lessons/{first.pk}/progress/", {"completed": True}, format="json")
    assert not Certificate.objects.exists()

    with django_capture_on_commit_callbacks(execute=True):
        complete_lessons(client, course)
    cert = Certificate.objects.get()
    assert cert.user == client.user and cert.course_title == course.title
    assert cert.recipient_name == client.user.full_name
    assert Notification.objects.filter(user=client.user, kind=Notification.Kind.CERTIFICATE_ISSUED).count() == 1
    assert AuditLog.objects.filter(action="certificates.issued").count() == 1
    # Idempotent: a later trigger does not issue a second certificate.
    assert issue_if_eligible(client.user, course) is None
    assert Certificate.objects.count() == 1

    body = client.get("/api/v1/me/certificates/").json()
    assert [c["number"] for c in body] == [cert.number]
    assert body[0]["verify_url"].endswith(f"/certificates/verify/{cert.number}")


def test_no_rule_or_disabled_rule_issues_nothing(client_for, make_course, template, django_capture_on_commit_callbacks):
    course = make_course(lessons=1)
    other = make_course(lessons=1)
    rule_for(other, template, is_enabled=False)
    client = client_for()
    enroll_free(client.user, course)
    enroll_free(client.user, other)
    with django_capture_on_commit_callbacks(execute=True):
        complete_lessons(client, course)
        complete_lessons(client, other)
    assert not Certificate.objects.exists()
    status = client.get(f"/api/v1/me/courses/{course.slug}/certificate/").json()
    assert status["offered"] is False and status["eligible"] is False


def test_exam_requirement_needs_a_released_pass(client_for, make_course, make_exam, template,
                                                django_capture_on_commit_callbacks):  # fmt: skip
    course = make_course(lessons=1)
    exam = make_exam(questions=2, course=course, pass_marks="2", result_release=Exam.ResultRelease.MANUAL)
    rule_for(course, template, required_exam=exam)
    client = client_for()
    enroll_free(client.user, course)
    with django_capture_on_commit_callbacks(execute=True):
        complete_lessons(client, course)
        pass_exam(client, exam)
    # Passed, but results are not published yet.
    assert not Certificate.objects.exists()
    status = client.get(f"/api/v1/me/courses/{course.slug}/certificate/").json()
    assert {r["key"]: r["met"] for r in status["requirements"]} == {"enrolled": True, "lessons": True, "exam": False}
    assert client.post(f"/api/v1/me/courses/{course.slug}/certificate/").status_code == 200
    assert not Certificate.objects.exists()

    staff = client_for(roles.EXAM_COORDINATOR)
    with django_capture_on_commit_callbacks(execute=True):
        assert staff.post(f"/api/v1/admin/assessments/exams/{exam.pk}/publish-results/").status_code == 200
    assert Certificate.objects.filter(user=client.user, course=course).exists()


def test_failed_exam_does_not_qualify_and_claim_endpoint_issues(client_for, make_course, make_exam, template):
    course = make_course(lessons=1)
    exam = make_exam(questions=2, course=course, pass_marks="2")
    rule_for(course, template, required_exam=exam, require_lessons=False)
    client = client_for()
    enroll_free(client.user, course)
    attempt_id = client.post(f"/api/v1/exams/{exam.slug}/attempts/").json()["id"]
    client.post(f"/api/v1/attempts/{attempt_id}/submit/")  # nothing answered: fails
    assert client.post(f"/api/v1/me/courses/{course.slug}/certificate/").status_code == 200
    assert not Certificate.objects.exists()

    pass_exam(client, exam)  # on_commit not executed: rely on the claim
    res = client.post(f"/api/v1/me/courses/{course.slug}/certificate/")
    assert res.status_code == 201 and res.json()["certificate"]["number"].startswith("HXN-")
    assert res.json()["eligible"] is False  # already holds it


def test_assignment_requirement(client_for, make_user, make_course, template, django_capture_on_commit_callbacks):
    instructor = make_user(roles.INSTRUCTOR)
    course = make_course(lessons=1, instructor=instructor)
    a = Assignment.objects.create(course=course, title="Essay", max_points=10, is_published=True, accepts_text=True)
    Assignment.objects.create(course=course, title="Draft", max_points=10, is_published=False, accepts_text=True)
    rule_for(course, template, require_lessons=False, require_assignments=True)
    client = client_for()
    enroll_free(client.user, course)
    client.post(f"/api/v1/assignments/{a.pk}/submission/", {"text": "My essay"})
    assert not Certificate.objects.exists()
    sub = Submission.objects.get()
    teacher = client_for()
    teacher.force_authenticate(instructor)
    with django_capture_on_commit_callbacks(execute=True):
        res = teacher.post(
            f"/api/v1/admin/learning/submissions/{sub.pk}/grade/",
            {"outcome": "graded", "points": 7, "feedback": ""},
            format="json",
        )
    assert res.status_code == 200
    assert Certificate.objects.filter(user=client.user).exists()


def test_revoked_enrollment_is_not_eligible(client_for, make_course, template):
    course = make_course(lessons=1)
    rule_for(course, template)
    client = client_for()
    enrollment, _ = enroll_free(client.user, course)
    complete_lessons(client, course)
    enrollment.status, enrollment.revoked_at = "revoked", timezone.now()
    enrollment.save()
    assert issue_if_eligible(client.user, course) is None


def test_learners_cannot_reach_other_learners_certificates(client_for, make_course, template):
    course = make_course(lessons=1)
    rule_for(course, template)
    owner = client_for()
    enroll_free(owner.user, course)
    complete_lessons(owner, course)
    cert = issue_if_eligible(owner.user, course)
    outsider = client_for()
    assert outsider.get("/api/v1/me/certificates/").json() == []
    assert outsider.get(f"/api/v1/me/certificates/{cert.number}/pdf/").status_code == 404
    assert outsider.get(f"/api/v1/me/courses/{course.slug}/certificate/").status_code == 404
    assert outsider.get(f"/api/v1/admin/certificates/issued/{cert.pk}/").status_code == 403

    res = owner.get(f"/api/v1/me/certificates/{cert.number}/pdf/")
    assert res.status_code == 200 and res["Content-Type"] == "application/pdf"
    assert b"".join(res).startswith(b"%PDF")


def test_public_verification_shows_minimal_fields_and_revocation(api_client, client_for, make_course, template):
    course = make_course(lessons=1)
    rule_for(course, template)
    learner = client_for()
    enroll_free(learner.user, course)
    complete_lessons(learner, course)
    cert = issue_if_eligible(learner.user, course)

    body = api_client.get(f"/api/v1/certificates/verify/{cert.number.lower()}/").json()
    assert set(body) == {"number", "heading", "recipient_name", "course_title", "issued_at", "status", "revoked_at"}
    assert body["status"] == "valid"
    assert api_client.get("/api/v1/certificates/verify/HXN-2026-NOTREAL1/").status_code == 404

    support = client_for(roles.SUPPORT_STAFF)
    assert support.get("/api/v1/admin/certificates/issued/").json()["count"] == 1
    assert support.post(f"/api/v1/admin/certificates/issued/{cert.pk}/revoke/", {"reason": "x"}).status_code == 403

    editor = client_for(roles.CONTENT_EDITOR)
    url = f"/api/v1/admin/certificates/issued/{cert.pk}/"
    assert editor.post(f"{url}revoke/", {"reason": ""}, format="json").status_code == 400
    res = editor.post(f"{url}revoke/", {"reason": "Issued in error"}, format="json")
    assert res.status_code == 200 and res.json()["revoked_by_name"] == editor.user.full_name
    assert editor.post(f"{url}revoke/", {"reason": "again"}, format="json").status_code == 409
    body = api_client.get(f"/api/v1/certificates/verify/{cert.number}/").json()
    assert body["status"] == "revoked" and body["revoked_at"]
    assert AuditLog.objects.filter(action="certificates.revoked", actor=editor.user).exists()
    # Revoked certificates are not re-issued by later triggers.
    assert issue_if_eligible(learner.user, course) is None

    assert editor.post(f"{url}reinstate/").json()["status"] == "valid"


def test_rule_management_and_validation(client_for, make_course, make_exam, template):
    editor = client_for(roles.CONTENT_EDITOR)
    course = make_course(lessons=1)
    other = make_course(lessons=1)
    foreign_exam = make_exam(course=other, pass_marks="1")
    no_pass = make_exam(course=course)
    good = make_exam(course=course, pass_marks="1")
    base = {"course": course.pk, "template": template.pk, "is_enabled": True}

    res = editor.post("/api/v1/admin/certificates/rules/", {**base, "required_exam": foreign_exam.pk}, format="json")
    assert res.status_code == 400 and "required_exam" in res.json()["error"]["details"]
    res = editor.post("/api/v1/admin/certificates/rules/", {**base, "required_exam": no_pass.pk}, format="json")
    assert res.status_code == 400
    res = editor.post(
        "/api/v1/admin/certificates/rules/", {**base, "require_lessons": False, "require_assignments": False},
        format="json",
    )  # fmt: skip
    assert res.status_code == 400 and "is_enabled" in res.json()["error"]["details"]
    res = editor.post("/api/v1/admin/certificates/rules/", {**base, "required_exam": good.pk}, format="json")
    assert res.status_code == 201 and res.json()["required_exam"]["id"] == good.pk
    rule_id = res.json()["id"]
    assert editor.post("/api/v1/admin/certificates/rules/", base, format="json").status_code == 400  # one per course
    res = editor.patch(f"/api/v1/admin/certificates/rules/{rule_id}/", {"required_exam": None}, format="json")
    assert res.status_code == 200 and res.json()["required_exam"] is None

    options = editor.get("/api/v1/admin/certificates/courses/").json()
    row = next(c for c in options if c["id"] == course.pk)
    assert row["has_rule"] is True and [e["id"] for e in row["exams"]] == [good.pk]

    # The template is in use, so it cannot be deleted.
    assert editor.delete(f"/api/v1/admin/certificates/templates/{template.pk}/").status_code == 409

    for role in (roles.FINANCE_MANAGER, roles.INSTRUCTOR, roles.SUPPORT_STAFF, roles.STUDENT):
        assert client_for(role).get("/api/v1/admin/certificates/rules/").status_code == 403


def test_issue_to_eligible_learners(client_for, make_course, template):
    course = make_course(lessons=1)
    learners = [client_for() for _ in range(3)]
    for c in learners:
        enroll_free(c.user, course)
    for c in learners[:2]:
        complete_lessons(c, course)
    rule = rule_for(course, template)
    editor = client_for(roles.CONTENT_EDITOR)
    res = editor.post(f"/api/v1/admin/certificates/rules/{rule.pk}/issue-eligible/")
    assert res.json() == {"issued": 2}
    assert editor.post(f"/api/v1/admin/certificates/rules/{rule.pk}/issue-eligible/").json() == {"issued": 0}
    progress = learners[2].get("/api/v1/me/certificates/progress/").json()
    assert len(progress) == 1 and progress[0]["eligible"] is False
