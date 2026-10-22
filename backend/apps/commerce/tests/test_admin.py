"""Staff tools: order review, bank-transfer approval, refunds, coupons, settings and reports."""

import csv
import io
from decimal import Decimal

import pytest

from apps.audit.models import AuditLog
from apps.commerce.models import Coupon, Order, Payment
from apps.learning.models import Enrollment

from .conftest import initiate, order_for, pay_with_sandbox

pytestmark = pytest.mark.django_db

ORDERS = "/api/v1/admin/commerce/orders/"
PAYMENTS = "/api/v1/admin/commerce/payments/"
COUPONS = "/api/v1/admin/commerce/coupons/"
SETTINGS = "/api/v1/admin/commerce/settings/"
REVENUE = "/api/v1/admin/commerce/reports/revenue/"
COURSE_OPTIONS = "/api/v1/admin/commerce/course-options/"


@pytest.fixture
def submitted_transfer(buyer, paid_course, bank_enabled):
    course = paid_course("2500.00")
    order = order_for(buyer, course)
    ref = initiate(buyer, order["number"], provider="bank_transfer")["payment"]["reference"]
    res = buyer.post(
        f"/api/v1/payments/{ref}/bank-transfer/",
        {"payer_name": "Demo Learner", "bank_reference": "TXN-1", "transferred_on": "2026-10-20"},
        format="json",
    )
    assert res.status_code == 200
    return course, order, Payment.objects.get(reference=ref)


# --- Access control ------------------------------------------------------------------


@pytest.mark.parametrize("role", [None, "content_editor", "instructor", "exam_coordinator"])
def test_non_finance_staff_cannot_reach_commerce_admin(client_for, role):
    client = client_for(*([role] if role else []))
    for url in (ORDERS, COUPONS, SETTINGS, REVENUE, f"{ORDERS}export/", COURSE_OPTIONS):
        assert client.get(url).status_code == 403, (role, url)


def test_support_staff_can_look_up_orders_but_not_act(client_for, buyer, paid_course):
    order, _ref, _ = pay_with_sandbox(buyer, paid_course())
    support = client_for("support_staff")
    assert support.get(ORDERS).json()["count"] == 1
    assert support.get(f"{ORDERS}{order['number']}/").status_code == 200
    assert support.post(f"{ORDERS}{order['number']}/refund/", {"amount": "1", "reason": "x"}).status_code == 403
    assert support.get(f"{ORDERS}export/").status_code == 403
    assert support.get(COUPONS).status_code == 403
    assert support.get(SETTINGS).status_code == 403


def test_finance_does_not_get_exam_keys_or_cms(finance):
    assert finance.get("/api/v1/admin/assessments/questions/").status_code == 403
    assert finance.get("/api/v1/admin/cms/pages/").status_code == 403


# --- Orders --------------------------------------------------------------------------


def test_order_list_filters_and_search(finance, buyer, paid_course, submitted_transfer):
    paid, _ref, _ = pay_with_sandbox(buyer, paid_course())
    _course, pending, payment = submitted_transfer
    numbers = lambda q: [o["number"] for o in finance.get(ORDERS, q).json()["results"]]  # noqa: E731
    assert set(numbers({})) == {paid["number"], pending["number"]}
    assert numbers({"status": "paid"}) == [paid["number"]]
    assert numbers({"awaiting_transfer_review": "true"}) == [pending["number"]]
    assert numbers({"provider": "sandbox"}) == [paid["number"]]
    assert numbers({"search": payment.reference}) == [pending["number"]]
    detail = finance.get(f"{ORDERS}{pending['number']}/").json()
    assert detail["payments"][0]["bank_reference"] == "TXN-1"
    assert [e["kind"] for e in detail["payments"][0]["events"]] == ["initiated", "submitted"]


def test_staff_can_cancel_an_unpaid_order(finance, buyer, paid_course):
    order = order_for(buyer, paid_course())
    res = finance.post(f"{ORDERS}{order['number']}/cancel/", {"note": "duplicate request"}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert AuditLog.objects.filter(action="commerce.order_cancelled", actor=finance.user).exists()


def test_resolve_review_clears_flag_with_note(finance, buyer, paid_course):
    order, _ref, _ = pay_with_sandbox(buyer, paid_course())
    Order.objects.filter(number=order["number"]).update(needs_review=True, review_reason="paid twice")
    url = f"{ORDERS}{order['number']}/resolve-review/"
    assert finance.post(url, {"note": ""}, format="json").status_code == 400
    res = finance.post(url, {"note": "refunded second payment at Khalti"}, format="json")
    assert res.status_code == 200 and res.json()["needs_review"] is False
    assert finance.post(url, {"note": "again"}, format="json").status_code == 409


# --- Bank transfers ------------------------------------------------------------------


def test_approve_transfer_requires_exact_amount_then_enrolls(finance, buyer, submitted_transfer):
    course, order, payment = submitted_transfer
    url = f"{PAYMENTS}{payment.pk}/approve-transfer/"
    res = finance.post(url, {"amount_received": "2000.00"}, format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == "amount_mismatch"
    assert not Enrollment.objects.filter(user=buyer.user, course=course).exists()

    res = finance.post(url, {"amount_received": "2500.00", "note": "seen in statement"}, format="json")
    assert res.status_code == 200
    assert Order.objects.get(number=order["number"]).status == "paid"
    assert Enrollment.objects.get(user=buyer.user, course=course).source == "purchase"
    assert AuditLog.objects.filter(action="commerce.bank_transfer_approved", actor=finance.user).exists()
    assert finance.post(url, {"amount_received": "2500.00"}, format="json").status_code == 409


def test_reject_transfer_needs_a_reason_and_learner_sees_it(finance, buyer, submitted_transfer):
    _course, order, payment = submitted_transfer
    url = f"{PAYMENTS}{payment.pk}/reject-transfer/"
    assert finance.post(url, {"note": ""}, format="json").status_code == 400
    assert finance.post(url, {"note": "No matching deposit found"}, format="json").status_code == 200
    mine = buyer.get(f"/api/v1/me/orders/{order['number']}/").json()
    assert mine["payments"][0]["status"] == "failed"
    assert mine["payments"][0]["review_note"] == "No matching deposit found"
    assert mine["status"] == "pending"  # the learner may try again


def test_payment_actions_need_manage_orders(client_for, submitted_transfer):
    _course, _order, payment = submitted_transfer
    support = client_for("support_staff")
    assert support.post(f"{PAYMENTS}{payment.pk}/approve-transfer/", {"amount_received": "2500.00"}).status_code == 403
    assert support.post(f"{PAYMENTS}{payment.pk}/recheck/").status_code == 403


def test_recheck_verifies_with_the_provider(finance, buyer, paid_course):
    from .conftest import complete_charge

    order = order_for(buyer, paid_course())
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    payment = complete_charge(ref)
    res = finance.post(f"{PAYMENTS}{payment.pk}/recheck/")
    assert res.status_code == 200 and res.json()["status"] == "completed"
    assert Order.objects.get(number=order["number"]).status == "paid"


# --- Refunds -------------------------------------------------------------------------


def test_partial_then_full_refund_with_revocation(finance, buyer, paid_course):
    course = paid_course("1000.00")
    order, _ref, _ = pay_with_sandbox(buyer, course)
    url = f"{ORDERS}{order['number']}/refund/"
    res = finance.post(url, {"amount": "400.00", "reason": "partial goodwill"}, format="json")
    assert res.status_code == 201
    assert res.json()["status"] == "partially_refunded" and res.json()["refundable_amount"] == "600.00"
    assert Enrollment.objects.get(user=buyer.user, course=course).status == "active"

    res = finance.post(url, {"amount": "600.01", "reason": "too much"}, format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_amount"

    res = finance.post(url, {"amount": "600.00", "reason": "course withdrawn", "revoke_access": True}, format="json")
    assert res.status_code == 201 and res.json()["status"] == "refunded"
    assert Enrollment.objects.get(user=buyer.user, course=course).status == "revoked"
    assert AuditLog.objects.filter(action="commerce.refund_recorded").count() == 2
    assert finance.post(url, {"amount": "1.00", "reason": "again"}, format="json").status_code == 409


def test_unpaid_orders_cannot_be_refunded(finance, buyer, paid_course):
    order = order_for(buyer, paid_course())
    res = finance.post(f"{ORDERS}{order['number']}/refund/", {"amount": "1.00", "reason": "x"}, format="json")
    assert res.status_code == 409


# --- Coupons -------------------------------------------------------------------------


def test_coupon_crud_and_validation(finance, paid_course):
    course = paid_course()
    res = finance.post(COUPONS, {"code": "dashain-25", "kind": "percent", "value": "25", "courses": [course.pk]})
    assert res.status_code == 201 and res.json()["code"] == "DASHAIN-25"
    assert res.json()["course_details"][0]["slug"] == course.slug
    assert AuditLog.objects.filter(action="commerce.coupon_created").exists()

    bad = [
        {"code": "DASHAIN-25", "kind": "fixed", "value": "10"},  # duplicate (case-insensitive)
        {"code": "bad code!", "kind": "fixed", "value": "10"},
        {"code": "OVER", "kind": "percent", "value": "120"},
        {"code": "CAPPED", "kind": "fixed", "value": "10", "max_discount": "5"},
        {"code": "ZERO", "kind": "fixed", "value": "0"},
        {
            "code": "WINDOW",
            "kind": "fixed",
            "value": "5",
            "starts_at": "2026-10-10T00:00Z",
            "ends_at": "2026-10-01T00:00Z",
        },
    ]
    for body in bad:
        assert finance.post(COUPONS, body, format="json").status_code == 400, body

    coupon_id = res.json()["id"]
    res = finance.patch(f"{COUPONS}{coupon_id}/", {"is_active": False}, format="json")
    assert res.status_code == 200 and res.json()["is_active"] is False
    assert finance.delete(f"{COUPONS}{coupon_id}/").status_code == 204


def test_coupon_course_options_skip_archived(finance, paid_course):
    live, old = paid_course(), paid_course()
    old.status = "archived"
    old.save(update_fields=["status"])
    slugs = [c["slug"] for c in finance.get(COURSE_OPTIONS).json()]
    assert live.slug in slugs and old.slug not in slugs


def test_used_coupon_cannot_be_deleted_or_change_type(finance, buyer, paid_course, make_coupon):
    coupon = make_coupon("USED", value="10")
    order_for(buyer, paid_course(), coupon="USED")
    assert finance.get(COUPONS).json()["results"][0]["redemption_count"] == 1
    res = finance.delete(f"{COUPONS}{coupon.pk}/")
    assert res.status_code == 409 and res.json()["error"]["code"] == "coupon_in_use"
    assert finance.patch(f"{COUPONS}{coupon.pk}/", {"kind": "fixed"}, format="json").status_code == 400
    assert Coupon.objects.filter(pk=coupon.pk).exists()


# --- Settings ------------------------------------------------------------------------


def test_settings_show_gateway_status_without_secrets(finance, settings):
    res = finance.get(SETTINGS)
    assert res.status_code == 200
    body = res.content.decode()
    assert {g["key"] for g in res.json()["gateways"]} == {"khalti", "esewa", "sandbox"}
    assert "test-sandbox-secret" not in body and "SECRET" not in body


def test_settings_validation_and_audit(finance):
    res = finance.patch(SETTINGS, {"bank_transfer_enabled": True}, format="json")
    assert res.status_code == 400 and "bank_transfer_instructions" in str(res.json())
    res = finance.patch(
        SETTINGS,
        {
            "bank_transfer_enabled": True,
            "bank_transfer_instructions": (
                '<p>Demo account 000</p><script>alert(1)</script><a href="javascript:x">x</a>'
            ),
            "order_ttl_minutes": 120,
        },
        format="json",
    )
    assert res.status_code == 200
    assert "<script" not in res.json()["bank_transfer_instructions"]
    assert "javascript:" not in res.json()["bank_transfer_instructions"]
    assert finance.patch(SETTINGS, {"order_ttl_minutes": 5}, format="json").status_code == 400
    assert AuditLog.objects.filter(action="commerce.settings_updated", actor=finance.user).exists()


def test_content_editor_cannot_change_payment_settings(client_for):
    editor = client_for("content_editor")
    assert editor.patch(SETTINGS, {"bank_transfer_enabled": False}, format="json").status_code == 403


# --- Reports -------------------------------------------------------------------------


def test_revenue_report_totals(finance, buyer, client_for, paid_course, make_coupon):
    a, b = paid_course("1000.00"), paid_course("500.00")
    order, _ref, _ = pay_with_sandbox(buyer, a)
    pay_with_sandbox(client_for(), b)
    make_coupon("ALL", value="100")
    order_for(client_for(), a, coupon="ALL")  # fully discounted, counts as an order with no revenue
    finance.post(f"{ORDERS}{order['number']}/refund/", {"amount": "200.00", "reason": "goodwill"}, format="json")
    order_for(client_for(), b)  # unpaid: not revenue

    report = finance.get(REVENUE).json()
    assert (report["gross"], report["refunds"], report["net"], report["orders"]) == ("1500.00", "200.00", "1300.00", 3)
    providers = {row["key"]: row for row in report["by_provider"]}
    assert providers["sandbox"]["amount"] == "1500.00" and providers["none"]["orders"] == 1
    assert report["by_course"][0]["amount"] == "1000.00"
    assert sum(Decimal(row["net"]) for row in report["series"]) == Decimal("1300.00")
    assert finance.get(REVENUE, {"start": "2026-10-10", "end": "2026-01-01"}).status_code == 400


def test_order_export_is_formula_safe_and_audited(finance, client_for, paid_course):
    learner = client_for()
    learner.user.full_name = '=HYPERLINK("http://evil")'
    learner.user.save()
    pay_with_sandbox(learner, paid_course())
    res = finance.get(f"{ORDERS}export/")
    assert res.status_code == 200 and res["Content-Type"].startswith("text/csv")
    rows = list(csv.reader(io.StringIO(res.content.decode())))
    assert rows[0][0] == "order" and len(rows) == 2
    assert rows[1][4].startswith("'=")
    assert AuditLog.objects.filter(action="commerce.orders_exported", actor=finance.user).exists()
