"""Exam offer prices, and staff assigning courses and exams to many people at once."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.assessments.models import ExamAccess
from apps.audit.models import AuditLog
from apps.learning.models import Enrollment

pytestmark = pytest.mark.django_db
CATALOG = "/api/v1/exam-catalog/"
ASSIGN = "/api/v1/admin/access/assign/"
EXAMS = "/api/v1/admin/assessments/exams/"


def start(client, exam):
    return client.post(f"/api/v1/exams/{exam.slug}/attempts/")


# --- Offer prices --------------------------------------------------------------------


def test_offer_price_applies_until_it_ends(make_exam):
    exam = make_exam(price=Decimal("500"), sale_price=Decimal("300"))
    assert exam.current_price() == Decimal("300")
    exam.sale_ends_at = timezone.now() + timedelta(days=1)
    assert exam.current_price() == Decimal("300")
    assert exam.current_price(now=timezone.now() + timedelta(days=2)) == Decimal("500")
    assert not exam.is_free


@pytest.mark.parametrize("sale", [Decimal("0"), Decimal("500"), Decimal("600")])
def test_database_rejects_offer_not_between_zero_and_price(make_exam, sale):
    exam = make_exam(price=Decimal("500"))
    exam.sale_price = sale
    with pytest.raises(IntegrityError), transaction.atomic():
        exam.save()


def test_catalog_shows_both_prices_and_sorts_by_what_you_pay(make_exam):
    on_offer = make_exam(price=Decimal("900"), sale_price=Decimal("100"))
    regular = make_exam(price=Decimal("400"))
    expired = make_exam(price=Decimal("50"), sale_price=Decimal("10"))
    expired.sale_ends_at = timezone.now() - timedelta(hours=1)
    expired.save()

    rows = {r["slug"]: r for r in APIClient().get(CATALOG).json()["results"]}
    assert rows[on_offer.slug]["price"] == "900.00" and rows[on_offer.slug]["current_price"] == "100.00"
    assert rows[regular.slug]["current_price"] == "400.00"
    assert rows[expired.slug]["current_price"] == "50.00"
    order = [r["slug"] for r in APIClient().get(CATALOG, {"ordering": "price_low"}).json()["results"]]
    assert order == [expired.slug, on_offer.slug, regular.slug]


def test_request_and_checkout_use_the_offer_price(client_for, make_exam):
    exam = make_exam(price=Decimal("500"), sale_price=Decimal("350"))
    learner = client_for()
    item = learner.get("/api/v1/checkout/item/", {"exam": exam.slug}).json()
    assert item["price"] == "350.00" and item["list_price"] == "500.00"
    detail = learner.get(f"/api/v1/exams/{exam.slug}/").json()
    assert detail["current_price"] == "350.00" and detail["price"] == "500.00"
    res = learner.post(
        "/api/v1/access-requests/", {"exam": exam.slug, "full_name": "Sita", "phone": "9800000000"}, format="json"
    )
    assert res.status_code == 201 and res.json()["price"] == "350.00"


def test_manager_sets_and_clears_an_offer(client_for, make_exam):
    exam = make_exam(price=Decimal("500"))
    coordinator = client_for("exam_coordinator")
    url = f"{EXAMS}{exam.pk}/"
    ends = (timezone.now() + timedelta(days=7)).isoformat()
    res = coordinator.patch(url, {"sale_price": "299", "sale_ends_at": ends}, format="json")
    assert res.status_code == 200, res.content
    assert res.json()["sale_price"] == "299.00" and res.json()["sale_ends_at"]

    for change, field in (
        ({"sale_price": "500"}, "sale_price"),
        ({"sale_price": "0"}, "sale_price"),
        ({"sale_ends_at": (timezone.now() - timedelta(days=1)).isoformat()}, "sale_ends_at"),
        ({"price": "200"}, "sale_price"),  # the offer would no longer be below the price
    ):
        res = coordinator.patch(url, change, format="json")
        assert res.status_code == 400 and field in res.json()["error"]["details"], change

    res = coordinator.patch(url, {"sale_price": None}, format="json")
    assert res.status_code == 200 and res.json()["sale_price"] is None and res.json()["sale_ends_at"] is None


def test_offer_needs_a_price_of_its_own(client_for, make_exam, make_course):
    exam = make_exam(course=make_course(price=5000))
    res = client_for("exam_coordinator").patch(f"{EXAMS}{exam.pk}/", {"sale_price": "100"}, format="json")
    assert res.status_code == 400 and "sale_price" in res.json()["error"]["details"]


def test_instructors_cannot_set_an_offer(make_user, make_course):
    instructor = make_user("instructor")
    course = make_course(instructor=instructor)
    teacher = APIClient()
    teacher.force_authenticate(instructor)
    res = teacher.post(
        EXAMS, {"title": "Quiz", "slug": "quiz", "duration_minutes": 10, "course": course.pk}, format="json"
    )
    pk = res.json()["id"]
    res = teacher.patch(f"{EXAMS}{pk}/", {"sale_price": "10"}, format="json")
    assert res.status_code == 400 and "sale_price" in res.json()["error"]["details"]
    # Sending the unchanged values back (as the settings form does) is fine.
    res = teacher.patch(f"{EXAMS}{pk}/", {"sale_price": None, "sale_ends_at": None, "summary": "x"}, format="json")
    assert res.status_code == 200


# --- Assigning access ----------------------------------------------------------------


def test_staff_assign_courses_and_exams_to_several_people(client_for, make_user, make_course, make_exam):
    staff = client_for("support_staff")
    course = make_course(price=5000)
    other_course = make_course(price=2000)
    course_only_exam = make_exam(course=other_course)  # not offered by itself
    paid_exam = make_exam(price=Decimal("300"))
    a, b = make_user("student"), make_user("student")
    Enrollment.objects.create(user=b, course=course, source="admin")

    res = staff.post(
        ASSIGN,
        {"users": [a.pk, b.pk, a.pk], "courses": [course.pk], "exams": [course_only_exam.pk, paid_exam.pk]},
        format="json",
    )
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["added"] == 5 and body["already_had"] == 1 and len(body["results"]) == 6
    assert Enrollment.objects.filter(course=course, status="active").count() == 2
    assert ExamAccess.objects.filter(status="active").count() == 4
    assert AuditLog.objects.filter(action="assessments.exam_access_granted").count() == 4
    assert AuditLog.objects.filter(action="learning.enrollment_granted").count() == 1

    # Running it again changes nothing.
    again = staff.post(ASSIGN, {"users": [a.pk], "exams": [paid_exam.pk]}, format="json").json()
    assert again["added"] == 0 and again["already_had"] == 1

    # The assigned course-only exam now shows up for the learner and can be taken.
    learner = APIClient()
    learner.force_authenticate(a)
    listed = {row["slug"]: row for row in learner.get("/api/v1/exams/").json()["results"]}
    assert listed[course_only_exam.slug]["availability"] == "available"
    assert listed[course_only_exam.slug]["has_access"] is True
    assert start(learner, course_only_exam).status_code == 201
    assert start(learner, paid_exam).status_code == 201


def test_assign_is_all_or_nothing(client_for, make_user, make_course, make_exam):
    staff = client_for("support_staff")
    learner = make_user("student")
    res = staff.post(
        ASSIGN,
        {"users": [learner.pk], "courses": [make_course().pk], "exams": [make_exam(status="draft").pk]},
        format="json",
    )
    assert res.status_code == 400 and "exams" in res.json()["error"]["details"]
    assert not Enrollment.objects.filter(user=learner).exists()


def test_assign_validates_its_input(client_for, make_user, make_course):
    staff = client_for("support_staff")
    inactive = make_user("student")
    inactive.is_active = False
    inactive.save()
    course = make_course()
    assert staff.post(ASSIGN, {"users": [], "courses": [course.pk]}, format="json").status_code == 400
    res = staff.post(ASSIGN, {"users": [make_user("student").pk]}, format="json")
    assert res.status_code == 400 and "courses" in res.json()["error"]["details"]
    res = staff.post(ASSIGN, {"users": [inactive.pk], "courses": [course.pk]}, format="json")
    assert res.status_code == 400 and "users" in res.json()["error"]["details"]
    res = staff.post(
        ASSIGN, {"users": [make_user("student").pk], "courses": [make_course(status="draft").pk]}, format="json"
    )
    assert res.status_code == 400 and "courses" in res.json()["error"]["details"]


@pytest.mark.parametrize("roles", [("student",), ("finance_manager",), ("content_editor",), ("instructor",)])
def test_others_cannot_assign(roles, client_for, make_user, make_course):
    client = client_for(*roles)
    res = client.post(ASSIGN, {"users": [make_user("student").pk], "courses": [make_course().pk]}, format="json")
    assert res.status_code == 403
    assert not Enrollment.objects.exists()


def test_options_include_course_exams_and_single_grant_accepts_them(client_for, make_user, make_course, make_exam):
    staff = client_for("support_staff")
    course = make_course(price=5000)
    course.title = "NRB officer"
    course.save(update_fields=["title"])
    exam = make_exam(course=course)
    options = staff.get("/api/v1/admin/access/options/").json()
    row = next(e for e in options["exams"] if e["id"] == exam.pk)
    assert "NRB officer" in row["detail"]
    learner = make_user("student")
    res = staff.post(f"/api/v1/admin/users/{learner.pk}/exam-access/", {"exam": exam.pk}, format="json")
    assert res.status_code == 201


def test_revoked_grant_closes_a_course_only_exam_again(client_for, make_user, make_course, make_exam):
    staff = client_for("support_staff")
    exam = make_exam(course=make_course(price=5000))
    learner = make_user("student")
    staff.post(ASSIGN, {"users": [learner.pk], "exams": [exam.pk]}, format="json")
    access = ExamAccess.objects.get(user=learner, exam=exam)
    assert staff.post(f"/api/v1/admin/exam-access/{access.pk}/revoke/").status_code == 200
    client = APIClient()
    client.force_authenticate(learner)
    assert start(client, exam).status_code == 404


def test_people_lookup_for_the_assign_page(client_for, make_user):
    staff = client_for("support_staff")
    person = make_user("student")
    person.full_name = "Sunita Gurung"
    person.save()
    gone = make_user("student")
    gone.full_name = "Sunil Gone"
    gone.is_active = False
    gone.save()
    url = "/api/v1/admin/access/people/"
    assert staff.get(url, {"search": "s"}).json() == []
    rows = staff.get(url, {"search": "suni"}).json()
    assert [r["id"] for r in rows] == [person.pk] and set(rows[0]) == {"id", "full_name", "email"}
    assert client_for("student").get(url, {"search": "suni"}).status_code == 403
