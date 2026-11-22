"""The public Exams section and exam-only enrollment for course exams."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assessments import access
from apps.assessments.models import ExamCategory
from apps.audit.models import AuditLog
from apps.learning.models import Enrollment

pytestmark = pytest.mark.django_db
CATALOG = "/api/v1/exam-catalog/"


def start(client, exam):
    return client.post(f"/api/v1/exams/{exam.slug}/attempts/")


def slugs(res):
    return {row["slug"] for row in res.json()["results"]}


@pytest.fixture
def loksewa(db):
    return ExamCategory.objects.create(name="Loksewa", slug="loksewa")


def test_catalog_lists_every_kind_of_published_exam_to_visitors(make_exam, make_course, loksewa):
    course = make_course(price=5000)
    practice = make_exam(kind="practice", category=loksewa)
    formal_paid = make_exam(kind="formal", price=Decimal("300"))
    course_only = make_exam(course=course)
    course_sold = make_exam(course=course, sold_separately=True, price=Decimal("150"))
    draft = make_exam(status="draft")
    closed = make_exam(status="closed")
    past = make_exam(closes_at=timezone.now() - timedelta(minutes=1), opens_at=timezone.now() - timedelta(days=1))
    hidden_course = make_exam(course=make_course(status="draft"))

    res = APIClient().get(CATALOG)
    assert res.status_code == 200
    assert slugs(res) == {practice.slug, formal_paid.slug, course_only.slug, course_sold.slug}
    rows = {row["slug"]: row for row in res.json()["results"]}
    assert rows[practice.slug]["offer"] == "free" and rows[practice.slug]["category"]["slug"] == "loksewa"
    assert rows[formal_paid.slug]["offer"] == "paid" and rows[formal_paid.slug]["kind_label"] == "Formal assessment"
    assert rows[course_only.slug]["offer"] == "course" and rows[course_only.slug]["course"]["slug"] == course.slug
    assert rows[course_sold.slug]["offer"] == "paid" and rows[course_sold.slug]["price"] == "150.00"
    assert rows[practice.slug]["question_total"] == 3
    for slug in (draft.slug, closed.slug, past.slug, hidden_course.slug):
        assert APIClient().get(f"{CATALOG}{slug}/").status_code == 404


def test_catalog_never_sends_questions_or_answers(make_exam):
    exam = make_exam()
    body = APIClient().get(f"{CATALOG}{exam.slug}/").content.decode()
    assert "Answer every question." in body  # the instructions
    for secret in ("is_correct", "answer_key", "options", "Question "):
        assert secret not in body


def test_catalog_filters(make_exam, make_course, loksewa):
    course = make_course(price=5000)
    free = make_exam(category=loksewa, kind="formal")
    paid = make_exam(price=Decimal("100"))
    paid.title = "Engineering licence mock"
    paid.save(update_fields=["title"])
    with_course = make_exam(course=course)
    client = APIClient()
    assert slugs(client.get(CATALOG, {"offer": "free"})) == {free.slug}
    assert slugs(client.get(CATALOG, {"offer": "paid"})) == {paid.slug}
    assert slugs(client.get(CATALOG, {"offer": "course"})) == {with_course.slug}
    assert slugs(client.get(CATALOG, {"category": "loksewa"})) == {free.slug}
    assert slugs(client.get(CATALOG, {"kind": "formal"})) == {free.slug}
    assert slugs(client.get(CATALOG, {"search": "licence"})) == {paid.slug}
    cats = client.get(f"{CATALOG}categories/").json()
    assert cats == [{"name": "Loksewa", "slug": "loksewa", "description": "", "exam_count": 1}]
    loksewa.is_active = False
    loksewa.save()
    assert client.get(f"{CATALOG}categories/").json() == []
    assert free.slug not in slugs(client.get(CATALOG))


def test_course_exam_only_for_enrolled_learners_unless_sold_separately(client_for, make_exam, make_course):
    course = make_course(price=5000)
    exam = make_exam(course=course)
    learner = client_for()
    assert start(learner, exam).status_code == 404  # not listed for non-enrolled learners

    exam.sold_separately = True
    exam.save()
    row = learner.get(f"/api/v1/exams/{exam.slug}/").json()
    assert row["availability"] == "available" and row["has_access"] is True
    assert start(learner, exam).status_code == 201


def test_paid_exam_only_enrollment_for_a_course_exam(client_for, make_exam, make_course, make_user):
    course = make_course(price=5000)
    exam = make_exam(course=course, sold_separately=True, price=Decimal("200"))
    learner, enrolled = client_for(), client_for()
    Enrollment.objects.create(user=enrolled.user, course=course, source="admin")

    detail = learner.get(f"/api/v1/exams/{exam.slug}/").json()
    assert detail["availability"] == "not_purchased" and detail["has_access"] is False
    assert start(learner, exam).status_code == 403
    # Enrolled learners get it with the course, without paying again.
    assert enrolled.get(f"/api/v1/exams/{exam.slug}/").json()["has_access"] is True
    assert start(enrolled, exam).status_code == 201

    # The checkout form works for it, and approval opens it.
    res = learner.post(
        "/api/v1/access-requests/", {"exam": exam.slug, "full_name": "Sita", "phone": "9800000000"}, format="json"
    )
    assert res.status_code == 201 and res.json()["price"] == "200.00"
    res = enrolled.post(
        "/api/v1/access-requests/", {"exam": exam.slug, "full_name": "Ram", "phone": "9800000001"}, format="json"
    )
    assert res.status_code == 409 and res.json()["error"]["code"] == "already_has_access"
    access.grant(learner.user, exam, actor=make_user("support_staff"))
    assert start(learner, exam).status_code == 201


def test_only_exam_managers_set_how_an_exam_is_sold(client_for, make_user, make_course):
    instructor = make_user("instructor")
    course = make_course(instructor=instructor)
    teacher = APIClient()
    teacher.force_authenticate(instructor)
    res = teacher.post(
        "/api/v1/admin/assessments/exams/",
        {"title": "Unit test", "slug": "unit-test", "duration_minutes": 20, "course": course.pk},
        format="json",
    )
    assert res.status_code == 201, res.content
    pk = res.json()["id"]
    for change in ({"sold_separately": True}, {"price": "100"}):
        res = teacher.patch(f"/api/v1/admin/assessments/exams/{pk}/", change, format="json")
        assert res.status_code == 400 and next(iter(change)) in res.json()["error"]["details"]
    # Other fields still save for the instructor.
    assert (
        teacher.patch(f"/api/v1/admin/assessments/exams/{pk}/", {"summary": "Weekly"}, format="json").status_code == 200
    )

    coordinator = client_for("exam_coordinator")
    res = coordinator.patch(
        f"/api/v1/admin/assessments/exams/{pk}/", {"sold_separately": True, "price": "100"}, format="json"
    )
    assert res.status_code == 200 and res.json()["sold_separately"] is True and res.json()["price"] == "100.00"
    res = coordinator.patch(f"/api/v1/admin/assessments/exams/{pk}/", {"sold_separately": False}, format="json")
    assert res.status_code == 400 and "price" in res.json()["error"]["details"]


def test_standalone_exam_is_never_marked_sold_separately(client_for):
    coordinator = client_for("exam_coordinator")
    res = coordinator.post(
        "/api/v1/admin/assessments/exams/",
        {"title": "Mock", "slug": "mock", "duration_minutes": 20, "sold_separately": True},
        format="json",
    )
    assert res.status_code == 201 and res.json()["sold_separately"] is False


def test_exam_categories_admin(client_for, make_exam):
    coordinator = client_for("exam_coordinator")
    url = "/api/v1/admin/assessments/exam-categories/"
    res = coordinator.post(url, {"name": " IOE  entrance ", "slug": "ioe-entrance", "position": 1}, format="json")
    assert res.status_code == 201 and res.json()["name"] == "IOE entrance"
    pk = res.json()["id"]
    assert coordinator.post(url, {"name": "Again", "slug": "ioe-entrance"}, format="json").status_code == 400
    exam = make_exam(category_id=pk)
    assert coordinator.get(url).json()[0]["exam_count"] == 1

    res = coordinator.patch(f"/api/v1/admin/assessments/exams/{exam.pk}/", {"category": pk}, format="json")
    assert res.status_code == 200 and res.json()["category_name"] == "IOE entrance"

    assert coordinator.delete(f"{url}{pk}/").status_code == 204
    exam.refresh_from_db()
    assert exam.category_id is None  # the exam stays, uncategorised
    assert AuditLog.objects.filter(action__startswith="assessments.exam_category_").count() == 2


@pytest.mark.parametrize("roles", [("student",), ("finance_manager",), ("content_editor",)])
def test_others_cannot_change_exam_categories(roles, client_for):
    client = client_for(*roles)
    res = client.post("/api/v1/admin/assessments/exam-categories/", {"name": "X", "slug": "x"}, format="json")
    assert res.status_code == 403


def test_instructor_reads_but_cannot_change_categories(make_user, loksewa):
    teacher = APIClient()
    teacher.force_authenticate(make_user("instructor"))
    url = "/api/v1/admin/assessments/exam-categories/"
    assert teacher.get(url).status_code == 200
    assert teacher.patch(f"{url}{loksewa.pk}/", {"name": "Y"}, format="json").status_code == 403


def test_exam_sitemap_lists_public_exams(make_exam):
    listed, draft = make_exam(), make_exam(status="draft")
    rows = APIClient().get("/api/v1/seo/exam-sitemap/").json()
    assert [r["slug"] for r in rows] == [listed.slug] and draft.slug not in str(rows)
