"""Paid standalone exams: only learners staff gave access to may start them."""

from decimal import Decimal

import pytest

from apps.assessments import access
from apps.assessments.models import Exam, ExamAccess
from apps.audit.models import AuditLog

pytestmark = pytest.mark.django_db


def start(client, exam):
    return client.post(f"/api/v1/exams/{exam.slug}/attempts/")


def test_free_standalone_exam_open_to_everyone(client_for, make_exam):
    exam = make_exam()
    learner = client_for()
    row = learner.get("/api/v1/exams/").json()["results"][0]
    assert row["is_free"] is True and row["has_access"] is True and row["availability"] == "available"
    assert start(learner, exam).status_code == 201


def test_paid_exam_needs_access(client_for, make_exam, make_user):
    exam = make_exam(price=Decimal("250"))
    learner = client_for()
    row = learner.get("/api/v1/exams/").json()["results"][0]
    assert row["price"] == "250.00" and row["is_free"] is False
    assert row["has_access"] is False and row["availability"] == "not_purchased"
    res = start(learner, exam)
    assert res.status_code == 403 and "paid exam" in res.json()["error"]["message"]

    staff = make_user("support_staff")
    access.grant(learner.user, exam, actor=staff)
    detail = learner.get(f"/api/v1/exams/{exam.slug}/").json()
    assert detail["has_access"] is True and detail["availability"] == "available"
    assert start(learner, exam).status_code == 201
    assert AuditLog.objects.filter(action="assessments.exam_access_granted").exists()


def test_revoked_access_blocks_new_attempts_and_can_be_restored(client_for, make_exam, make_user):
    exam = make_exam(price=Decimal("100"))
    learner, staff = client_for(), make_user("support_staff")
    granted, changed = access.grant(learner.user, exam, actor=staff)
    assert changed
    access.revoke(granted, actor=staff)
    assert start(learner, exam).status_code == 403
    again, changed = access.grant(learner.user, exam, actor=staff)
    assert changed and again.pk == granted.pk and again.status == ExamAccess.Status.ACTIVE
    assert access.grant(learner.user, exam, actor=staff)[1] is False  # already active


def test_access_to_one_exam_does_not_open_another(client_for, make_exam, make_user):
    paid, other = make_exam(price=Decimal("100")), make_exam(price=Decimal("100"))
    learner = client_for()
    access.grant(learner.user, paid, actor=make_user("support_staff"))
    assert start(learner, other).status_code == 403


def test_course_exam_cannot_have_a_price(client_for, make_course):
    course = make_course()
    coordinator = client_for("exam_coordinator")
    res = coordinator.post(
        "/api/v1/admin/assessments/exams/",
        {"title": "Course test", "slug": "course-test", "duration_minutes": 30, "course": course.pk, "price": "50"},
        format="json",
    )
    assert res.status_code == 400 and "price" in res.json()["error"]["details"]


def test_admin_sets_price_on_standalone_exam(client_for):
    coordinator = client_for("exam_coordinator")
    res = coordinator.post(
        "/api/v1/admin/assessments/exams/",
        {"title": "Mock test", "slug": "mock-test", "duration_minutes": 30, "price": "300"},
        format="json",
    )
    assert res.status_code == 201, res.content
    assert res.json()["price"] == "300.00"
    exam = Exam.objects.get(slug="mock-test")
    res = coordinator.patch(f"/api/v1/admin/assessments/exams/{exam.pk}/", {"price": "-1"}, format="json")
    assert res.status_code == 400


def test_draft_exam_cannot_be_granted(make_exam, make_user):
    from common.exceptions import DomainError

    exam = make_exam(status="draft", price=Decimal("100"))
    with pytest.raises(DomainError):
        access.grant(make_user(), exam, actor=make_user("support_staff"))
