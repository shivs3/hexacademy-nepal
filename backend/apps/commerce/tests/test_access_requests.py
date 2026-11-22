"""The checkout form: learners request paid courses and exams, staff approve."""

from decimal import Decimal

import pytest
from django.core import mail
from django.utils import timezone

from apps.assessments.models import Exam, ExamAccess
from apps.audit.models import AuditLog
from apps.commerce.models import AccessRequest, PaymentSettings
from apps.learning.models import Enrollment
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

FORM = {"full_name": "Sita Sharma", "phone": "+977 9800000000", "payment_reference": "eSewa 12345"}


@pytest.fixture
def paid_exam(db):
    return Exam.objects.create(
        title="Loksewa mock", slug="loksewa-mock", duration_minutes=30, status="published",
        published_at=timezone.now(), price=Decimal("200"),
    )  # fmt: skip


def send(client, expect=201, **body):
    res = client.post("/api/v1/access-requests/", {**FORM, **body}, format="json")
    assert res.status_code == expect, res.content
    return res.json()


def test_course_request_is_saved_emailed_and_approved(client_for, paid_course, django_capture_on_commit_callbacks):
    course = paid_course("1500.00", sale_price=Decimal("1200.00"))
    learner = client_for()
    with django_capture_on_commit_callbacks(execute=True):
        data = send(learner, course=course.slug, price="1")  # a browser price is ignored
    assert data["status"] == "pending" and data["price"] == "1200.00"
    assert data["item_title"] == course.title

    assert len(mail.outbox) == 1
    email = mail.outbox[0]
    assert email.to == ["hexacademynepal@gmail.com"]
    assert data["number"] in email.body and "eSewa 12345" in email.body and learner.user.email in email.body

    staff = client_for("support_staff")
    listed = staff.get("/api/v1/admin/commerce/requests/?status=pending").json()["results"]
    assert [r["number"] for r in listed] == [data["number"]]
    res = staff.post(f"/api/v1/admin/commerce/requests/{listed[0]['id']}/approve/", {"note": "Paid"}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "approved"

    enrollment = Enrollment.objects.get(user=learner.user, course=course)
    assert enrollment.is_active and enrollment.source == Enrollment.Source.ADMIN
    assert Notification.objects.filter(user=learner.user, title__startswith="Access approved").exists()
    assert AuditLog.objects.filter(action="commerce.access_request_approved").exists()
    # Approving twice does nothing more.
    again = staff.post(f"/api/v1/admin/commerce/requests/{listed[0]['id']}/approve/", {}, format="json")
    assert again.status_code == 409


def test_exam_request_approval_grants_exam_access(client_for, paid_exam):
    learner = client_for()
    data = send(learner, exam=paid_exam.slug)
    assert data["kind"] == "exam" and data["price"] == "200.00"
    finance = client_for("finance_manager")
    req = AccessRequest.objects.get(number=data["number"])
    assert finance.post(f"/api/v1/admin/commerce/requests/{req.pk}/approve/").status_code == 200
    access = ExamAccess.objects.get(user=learner.user, exam=paid_exam)
    assert access.status == "active" and access.source == "request"


def test_reject_needs_a_note_and_tells_the_learner(client_for, paid_course):
    course = paid_course()
    learner = client_for()
    data = send(learner, course=course.slug)
    req = AccessRequest.objects.get(number=data["number"])
    staff = client_for("support_staff")
    assert (
        staff.post(f"/api/v1/admin/commerce/requests/{req.pk}/reject/", {"note": " "}, format="json").status_code == 400
    )
    res = staff.post(f"/api/v1/admin/commerce/requests/{req.pk}/reject/", {"note": "No payment found"}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "rejected"
    mine = learner.get("/api/v1/me/access-requests/").json()["results"][0]
    assert mine["status"] == "rejected" and mine["staff_note"] == "No payment found"
    assert not Enrollment.objects.filter(user=learner.user, course=course).exists()
    # After a rejection the learner may ask again.
    send(learner, course=course.slug)


def test_one_pending_request_per_item(client_for, paid_course):
    course = paid_course()
    learner = client_for()
    send(learner, course=course.slug)
    res = send(learner, expect=409, course=course.slug)
    assert res["error"]["code"] == "already_requested"


def test_learner_can_cancel_own_pending_request_only(client_for, paid_course):
    course = paid_course()
    learner, other = client_for(), client_for()
    number = send(learner, course=course.slug)["number"]
    assert other.post(f"/api/v1/me/access-requests/{number}/cancel/").status_code == 404
    res = learner.post(f"/api/v1/me/access-requests/{number}/cancel/")
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert learner.post(f"/api/v1/me/access-requests/{number}/cancel/").status_code == 409
    assert other.get("/api/v1/me/access-requests/").json()["results"] == []


@pytest.mark.parametrize("case", ["free_course", "draft_course", "enrolled", "free_exam", "course_exam", "both"])
def test_invalid_requests_are_refused(case, client_for, paid_course, make_course, paid_exam):
    learner = client_for()
    if case == "free_course":
        body, code = {"course": make_course(price=0).slug}, 400
    elif case == "draft_course":
        body, code = {"course": paid_course(status="draft").slug}, 404
    elif case == "enrolled":
        course = paid_course()
        Enrollment.objects.create(user=learner.user, course=course, source="admin")
        body, code = {"course": course.slug}, 409
    elif case == "free_exam":
        paid_exam.price = 0
        paid_exam.save()
        body, code = {"exam": paid_exam.slug}, 400
    elif case == "course_exam":
        exam = Exam.objects.create(
            title="Quiz", slug="quiz", duration_minutes=10, status="published", course=paid_course()
        )
        body, code = {"exam": exam.slug}, 404  # only offered with its course
    else:
        body, code = {"course": paid_course().slug, "exam": paid_exam.slug}, 400
    send(learner, expect=code, **body)
    assert not AccessRequest.objects.exists()


def test_unverified_email_cannot_request(client_for, paid_course, settings):
    settings.EMAIL_VERIFICATION_REQUIRED = True
    learner = client_for(verified=False)
    res = send(learner, expect=403, course=paid_course().slug)
    assert res["error"]["code"] == "email_unverified"


def test_form_is_validated(client_for, paid_course):
    learner = client_for()
    course = paid_course()
    res = send(learner, expect=400, course=course.slug, phone="call me", full_name="")
    assert {"phone", "full_name"} <= set(res["error"]["details"])


def test_checkout_item_reads_price_and_instructions_from_server(client_for, paid_course, paid_exam):
    config = PaymentSettings.load()
    config.request_instructions = "<p>Pay to eSewa 98XXXXXXXX</p><script>alert(1)</script>"
    config.save()
    course = paid_course("900.00")
    learner = client_for()
    data = learner.get(f"/api/v1/checkout/item/?course={course.slug}").json()
    assert data["price"] == "900.00" and data["pending_request"] is None
    assert "eSewa" in data["instructions"] and "<script" not in data["instructions"]
    send(learner, course=course.slug)
    assert learner.get(f"/api/v1/checkout/item/?course={course.slug}").json()["pending_request"]["status"] == "pending"
    assert learner.get(f"/api/v1/checkout/item/?exam={paid_exam.slug}").json()["kind"] == "exam"
    assert learner.get("/api/v1/checkout/item/?course=nope").status_code == 404


def test_notify_address_is_admin_editable(client_for, paid_course, django_capture_on_commit_callbacks):
    finance = client_for("finance_manager")
    res = finance.patch(
        "/api/v1/admin/commerce/settings/", {"request_notify_email": "office@example.com"}, format="json"
    )
    assert res.status_code == 200 and res.json()["request_notify_email"] == "office@example.com"
    with django_capture_on_commit_callbacks(execute=True):
        send(client_for(), course=paid_course().slug)
    assert mail.outbox[-1].to == ["office@example.com"]


@pytest.mark.parametrize("roles", [(), ("instructor",), ("content_editor",), ("exam_coordinator",)])
def test_only_enrollment_or_order_staff_handle_requests(roles, client_for, paid_course):
    learner = client_for()
    send(learner, course=paid_course().slug)
    req = AccessRequest.objects.get()
    client = client_for(*roles)
    assert client.get("/api/v1/admin/commerce/requests/").status_code == 403
    assert client.post(f"/api/v1/admin/commerce/requests/{req.pk}/approve/").status_code == 403
    assert not Enrollment.objects.exists()


# --- Staff control of one learner's access -----------------------------------------


def test_user_access_overview_and_exam_grants(client_for, make_user, paid_course, paid_exam):
    learner = make_user()
    course = paid_course()
    Enrollment.objects.create(user=learner, course=course, source="admin")
    staff = client_for("support_staff")

    res = staff.post(f"/api/v1/admin/users/{learner.pk}/exam-access/", {"exam": paid_exam.pk}, format="json")
    assert res.status_code == 201
    access_id = res.json()["id"]
    again = staff.post(f"/api/v1/admin/users/{learner.pk}/exam-access/", {"exam": paid_exam.pk}, format="json")
    assert again.status_code == 200

    data = staff.get(f"/api/v1/admin/users/{learner.pk}/access/").json()
    assert data["user"]["email"] == learner.email
    assert [e["course_id"] for e in data["enrollments"]] == [course.pk]
    assert [a["exam_id"] for a in data["exam_access"]] == [paid_exam.pk]

    assert staff.post(f"/api/v1/admin/exam-access/{access_id}/revoke/").json()["status"] == "revoked"
    assert staff.post(f"/api/v1/admin/exam-access/{access_id}/revoke/").status_code == 409

    options = staff.get("/api/v1/admin/access/options/").json()
    assert course.pk in [c["id"] for c in options["courses"]]
    assert paid_exam.pk in [e["id"] for e in options["exams"]]


def test_finance_cannot_grant_exam_access_directly(client_for, make_user, paid_exam):
    learner = make_user()
    finance = client_for("finance_manager")
    res = finance.post(f"/api/v1/admin/users/{learner.pk}/exam-access/", {"exam": paid_exam.pk}, format="json")
    assert res.status_code == 403
    assert finance.get(f"/api/v1/admin/users/{learner.pk}/access/").status_code == 403
