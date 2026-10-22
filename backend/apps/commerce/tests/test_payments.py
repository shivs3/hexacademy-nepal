"""Payments: only server-side verification with the provider marks an order paid."""

import base64
import copy
import hashlib
import hmac
from datetime import timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone

from apps.commerce import services
from apps.commerce.models import Order, Payment, PaymentSettings, SandboxCharge, WebhookEvent
from apps.commerce.providers import esewa, khalti
from apps.learning.models import Enrollment

from .conftest import complete_charge, initiate, order_for, pay_with_sandbox, verify, webhook

pytestmark = pytest.mark.django_db


def _enrolled(user, course) -> bool:
    return Enrollment.objects.filter(user=user, course=course, status="active").exists()


# --- Sandbox happy path and idempotency --------------------------------------------------


def test_sandbox_purchase_enrolls_only_after_verification(buyer, paid_course):
    course = paid_course()
    order = order_for(buyer, course)
    started = initiate(buyer, order["number"])
    assert started["action"]["kind"] == "redirect"
    assert started["action"]["url"].endswith(f"/checkout/sandbox/{started['payment']['reference']}")
    ref = started["payment"]["reference"]

    # Returning without paying changes nothing.
    result = verify(buyer, ref)
    assert result["order"]["status"] == "pending" and not _enrolled(buyer.user, course)

    assert buyer.post(f"/api/v1/payments/sandbox/{ref}/", {"outcome": "complete"}, format="json").status_code == 200
    result = verify(buyer, ref)
    assert result["payment"]["status"] == "completed" and result["order"]["status"] == "paid"
    enrollment = Enrollment.objects.get(user=buyer.user, course=course)
    assert enrollment.source == "purchase" and enrollment.status == "active"

    # Verifying again is a no-op: no second enrollment, payment untouched.
    again = verify(buyer, ref)
    assert again["order"]["status"] == "paid"
    assert Enrollment.objects.filter(user=buyer.user, course=course).count() == 1
    assert Payment.objects.get(reference=ref).events.filter(kind="verified").count() == 2  # pending + completed


def test_query_parameters_and_body_cannot_fake_success(buyer, paid_course):
    order = order_for(buyer, paid_course())
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    res = buyer.post(
        f"/api/v1/payments/{ref}/verify/?status=Completed&pidx=x&total_amount=150000",
        {"status": "completed", "amount": "1500.00"},
        format="json",
    )
    assert res.json()["order"]["status"] == "pending"


def test_cancelled_sandbox_charge_leaves_order_payable(buyer, paid_course):
    order = order_for(buyer, paid_course())
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    buyer.post(f"/api/v1/payments/sandbox/{ref}/", {"outcome": "cancel"}, format="json")
    result = verify(buyer, ref)
    assert result["payment"]["status"] == "cancelled"
    assert result["order"]["status"] == "pending" and result["order"]["can_pay"] is True
    res = buyer.post(f"/api/v1/payments/sandbox/{ref}/", {"outcome": "complete"}, format="json")
    assert res.status_code == 409


def test_payments_of_other_users_are_invisible(buyer, client_for, paid_course):
    order = order_for(buyer, paid_course())
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    other = client_for()
    assert other.post(f"/api/v1/payments/{ref}/verify/").status_code == 404
    assert other.get(f"/api/v1/payments/sandbox/{ref}/").status_code == 404
    assert other.post(f"/api/v1/payments/sandbox/{ref}/", {"outcome": "complete"}, format="json").status_code == 404


def test_amount_mismatch_is_flagged_not_paid(buyer, paid_course):
    course = paid_course()
    order = order_for(buyer, course)
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    complete_charge(ref)
    SandboxCharge.objects.filter(payment__reference=ref).update(amount=Decimal("1.00"))
    result = verify(buyer, ref)
    assert result["payment"]["status"] == "mismatch"
    db_order = Order.objects.get(number=order["number"])
    assert db_order.status == "pending" and db_order.needs_review
    assert not _enrolled(buyer.user, course)


def test_second_completed_payment_is_recorded_as_duplicate(buyer, paid_course):
    order = order_for(buyer, paid_course())
    first = initiate(buyer, order["number"])["payment"]["reference"]
    second = initiate(buyer, order["number"])["payment"]["reference"]
    complete_charge(first)
    complete_charge(second)
    verify(buyer, first)
    result = verify(buyer, second)
    assert result["payment"]["status"] == "duplicate"
    db_order = Order.objects.get(number=order["number"])
    assert db_order.status == "paid" and db_order.needs_review and "paid twice" in db_order.review_reason
    assert db_order.payments.filter(status="completed").count() == 1


def test_late_payment_on_a_replaced_order_is_honoured_and_flagged(buyer, paid_course):
    course = paid_course()
    order = order_for(buyer, course)
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    complete_charge(ref)  # the learner paid, then (say) closed the tab
    Payment.objects.filter(reference=ref).update(status="initiated")
    services.cancel_order(Order.objects.get(number=order["number"]), actor=buyer.user, reason="test")
    Payment.objects.filter(reference=ref).update(status="pending")  # the gateway still knows it
    verify(buyer, ref)
    db_order = Order.objects.get(number=order["number"])
    assert db_order.status == "paid" and db_order.needs_review and "paid after" in db_order.review_reason
    assert _enrolled(buyer.user, course)


def test_disabled_or_unknown_method_is_refused(buyer, paid_course):
    order = order_for(buyer, paid_course())
    for provider in ("khalti", "esewa", "bank_transfer"):  # not configured / not enabled in tests
        res = buyer.post("/api/v1/payments/initiate/", {"order": order["number"], "provider": provider}, format="json")
        assert res.status_code == 400, provider
        assert res.json()["error"]["code"] == "method_unavailable"


def test_payment_methods_are_public_and_secret_free(api_client, bank_enabled):
    res = api_client.get("/api/v1/payments/methods/")
    assert res.status_code == 200
    keys = [m["key"] for m in res.json()["methods"]]
    assert keys == ["sandbox", "bank_transfer"]
    assert "test-sandbox-secret" not in res.content.decode()


def test_sandbox_endpoints_vanish_when_disabled(buyer, paid_course, settings, api_client):
    order = order_for(buyer, paid_course())
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    settings.PAYMENTS = {**copy.deepcopy(settings.PAYMENTS), "ENABLE_SANDBOX_PROVIDER": False}
    assert buyer.get(f"/api/v1/payments/sandbox/{ref}/").status_code == 404
    assert webhook(api_client, {"event_id": "e1", "reference": ref}).status_code == 404
    assert "sandbox" not in [m["key"] for m in buyer.get("/api/v1/payments/methods/").json()["methods"]]


# --- Webhooks ------------------------------------------------------------------------


@pytest.fixture
def paid_charge(buyer, paid_course):
    course = paid_course()
    order = order_for(buyer, course)
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    complete_charge(ref)
    return course, order, ref


def test_signed_webhook_triggers_verification_once(api_client, buyer, paid_charge):
    course, order, ref = paid_charge
    res = webhook(api_client, {"event_id": "evt-1", "reference": ref})
    assert res.status_code == 200 and res.json() == {"result": "processed"}
    assert Order.objects.get(number=order["number"]).status == "paid"
    assert _enrolled(buyer.user, course)
    replay = webhook(api_client, {"event_id": "evt-1", "reference": ref})
    assert replay.json() == {"result": "duplicate"}
    assert WebhookEvent.objects.filter(provider="sandbox", event_id="evt-1").count() == 1


@pytest.mark.parametrize(
    "kwargs",
    [
        {"secret": "wrong-secret"},
        {"signature": ""},
        {"signature": "00" * 32},
        {"timestamp": 1_000_000},  # far in the past
    ],
)
def test_webhook_rejects_bad_signatures_and_stale_deliveries(api_client, paid_charge, kwargs):
    _course, order, ref = paid_charge
    res = webhook(api_client, {"event_id": "evt-x", "reference": ref}, **kwargs)
    assert res.status_code == 401
    assert Order.objects.get(number=order["number"]).status == "pending"
    assert not WebhookEvent.objects.exists()


def test_webhook_body_cannot_decide_the_outcome(api_client, buyer, paid_course):
    order = order_for(buyer, paid_course())
    ref = initiate(buyer, order["number"])["payment"]["reference"]  # never paid at the gateway
    res = webhook(api_client, {"event_id": "evt-2", "reference": ref, "status": "completed", "amount": "1500.00"})
    assert res.json() == {"result": "processed"}
    assert Order.objects.get(number=order["number"]).status == "pending"


def test_webhook_for_unknown_reference_and_bad_payload(api_client):
    assert webhook(api_client, {"event_id": "evt-3", "reference": "NOPE"}).json() == {"result": "ignored"}
    assert webhook(api_client, {"reference": "NOPE"}).status_code == 400


def test_webhook_for_real_providers_is_not_routed(api_client):
    for provider in ("khalti", "esewa", "other"):
        res = api_client.post(f"/api/v1/webhooks/payments/{provider}/", {}, format="json")
        assert res.status_code == 404


# --- Khalti (HTTP mocked; request shapes from docs.khalti.com) -----------------------


@pytest.fixture
def khalti_on(settings):
    payments = copy.deepcopy(settings.PAYMENTS)
    payments["KHALTI"] = {"SECRET_KEY": "test-khalti-key", "BASE_URL": "https://dev.khalti.com/api/v2/"}
    settings.PAYMENTS = payments
    config = PaymentSettings.load()
    config.khalti_enabled = True
    config.save()


def test_khalti_initiate_sends_paisa_and_key_header(buyer, paid_course, khalti_on):
    order = order_for(buyer, paid_course("1500.50"))
    reply = {"pidx": "PIDX123", "payment_url": "https://test-pay.khalti.com/?pidx=PIDX123", "expires_at": None}
    with mock.patch.object(khalti, "request_json", return_value=(200, reply)) as call:
        started = initiate(buyer, order["number"], provider="khalti")
    method, url = call.call_args.args
    kw = call.call_args.kwargs
    assert (method, url) == ("POST", "https://dev.khalti.com/api/v2/epayment/initiate/")
    assert kw["headers"] == {"Authorization": "Key test-khalti-key"}
    assert kw["body"]["amount"] == 150050
    assert kw["body"]["purchase_order_id"] == started["payment"]["reference"]
    assert kw["body"]["return_url"].endswith(f"/checkout/complete/{started['payment']['reference']}")
    assert started["action"] == {"kind": "redirect", "url": reply["payment_url"], "fields": {}}
    assert Payment.objects.get(reference=started["payment"]["reference"]).provider_reference == "PIDX123"


def _khalti_payment(buyer, course):
    order = order_for(buyer, course)
    reply = {"pidx": "PIDX-1", "payment_url": "https://test-pay.khalti.com/?pidx=PIDX-1"}
    with mock.patch.object(khalti, "request_json", return_value=(200, reply)):
        return order, initiate(buyer, order["number"], provider="khalti")["payment"]["reference"]


@pytest.mark.parametrize(
    ("http", "reply", "payment_status", "order_status"),
    [
        (200, {"status": "Completed", "total_amount": 150000, "transaction_id": "T1"}, "completed", "paid"),
        (200, {"status": "Pending", "total_amount": 150000}, "pending", "pending"),
        (400, {"status": "User canceled", "total_amount": 150000}, "cancelled", "pending"),
        (400, {"status": "Expired", "total_amount": 150000}, "expired", "pending"),
        (200, {"status": "Completed", "total_amount": 100}, "mismatch", "pending"),
    ],
)
def test_khalti_lookup_outcomes(buyer, paid_course, khalti_on, http, reply, payment_status, order_status):
    order, ref = _khalti_payment(buyer, paid_course("1500.00"))
    with mock.patch.object(khalti, "request_json", return_value=(http, {"pidx": "PIDX-1", **reply})) as call:
        result = verify(buyer, ref)
    assert call.call_args.kwargs["body"] == {"pidx": "PIDX-1"}
    assert call.call_args.args[1].endswith("epayment/lookup/")
    assert result["payment"]["status"] == payment_status
    assert result["order"]["status"] == order_status


def test_khalti_outage_keeps_payment_pending_and_is_logged(buyer, paid_course, khalti_on):
    order, ref = _khalti_payment(buyer, paid_course())
    with mock.patch.object(khalti, "request_json", side_effect=khalti.ProviderError("timeout")):
        result = verify(buyer, ref)
    assert result["payment"]["status"] == "initiated" and result["order"]["status"] == "pending"
    assert Payment.objects.get(reference=ref).events.filter(kind="provider_error").exists()


def test_khalti_initiate_failure_returns_502(buyer, paid_course, khalti_on):
    order = order_for(buyer, paid_course())
    with mock.patch.object(khalti, "request_json", return_value=(401, {"detail": "Invalid token."})):
        res = buyer.post("/api/v1/payments/initiate/", {"order": order["number"], "provider": "khalti"}, format="json")
    assert res.status_code == 502 and res.json()["error"]["code"] == "provider_unavailable"
    assert "test-khalti-key" not in res.content.decode()
    assert Payment.objects.get(order__number=order["number"]).status == "failed"


def test_khalti_minimum_amount(buyer, paid_course, khalti_on):
    order = order_for(buyer, paid_course("5.00"))
    res = buyer.post("/api/v1/payments/initiate/", {"order": order["number"], "provider": "khalti"}, format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == "amount_too_small"


# --- eSewa (HTTP mocked; formats from developer.esewa.com.np) ------------------------


@pytest.fixture
def esewa_on(settings):
    payments = copy.deepcopy(settings.PAYMENTS)
    payments["ESEWA"] = {
        "PRODUCT_CODE": "TESTCODE",
        "SECRET_KEY": "test-esewa-secret",
        "FORM_URL": "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
        "STATUS_URL": "https://rc.esewa.com.np/api/epay/transaction/status/",
    }
    settings.PAYMENTS = payments
    config = PaymentSettings.load()
    config.esewa_enabled = True
    config.save()


def test_esewa_signature_follows_documented_message():
    message = "total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST"
    expected = base64.b64encode(hmac.new(b"k", message.encode(), hashlib.sha256).digest()).decode()
    assert esewa.sign(message, "k") == expected
    assert esewa.format_amount(Decimal("1000.00")) == "1000"
    assert esewa.format_amount(Decimal("1000.50")) == "1000.50"


def test_esewa_initiate_returns_a_signed_form(buyer, paid_course, esewa_on):
    order = order_for(buyer, paid_course("1500.00"))
    started = initiate(buyer, order["number"], provider="esewa")
    action, ref = started["action"], started["payment"]["reference"]
    assert action["kind"] == "form" and action["url"] == "https://rc-epay.esewa.com.np/api/epay/main/v2/form"
    f = action["fields"]
    assert (f["total_amount"], f["transaction_uuid"], f["product_code"]) == ("1500", ref, "TESTCODE")
    assert f["signed_field_names"] == "total_amount,transaction_uuid,product_code"
    message = f"total_amount=1500,transaction_uuid={ref},product_code=TESTCODE"
    assert f["signature"] == esewa.sign(message, "test-esewa-secret")
    assert "test-esewa-secret" not in str(started)


@pytest.mark.parametrize(
    ("reply", "payment_status", "order_status"),
    [
        ({"status": "COMPLETE", "total_amount": 1500.0, "ref_id": "R1"}, "completed", "paid"),
        ({"status": "PENDING", "total_amount": 1500.0}, "pending", "pending"),
        ({"status": "CANCELED", "total_amount": 1500.0}, "cancelled", "pending"),
        ({"status": "COMPLETE", "total_amount": 15.0}, "mismatch", "pending"),
    ],
)
def test_esewa_status_check(buyer, paid_course, esewa_on, reply, payment_status, order_status):
    order = order_for(buyer, paid_course("1500.00"))
    ref = initiate(buyer, order["number"], provider="esewa")["payment"]["reference"]
    body = {"product_code": "TESTCODE", "transaction_uuid": ref, **reply}
    with mock.patch.object(esewa, "request_json", return_value=(200, body)) as call:
        result = verify(buyer, ref)
    assert call.call_args.args == ("GET", "https://rc.esewa.com.np/api/epay/transaction/status/")
    expected = {"product_code": "TESTCODE", "total_amount": "1500", "transaction_uuid": ref}
    assert call.call_args.kwargs["params"] == expected
    assert result["payment"]["status"] == payment_status and result["order"]["status"] == order_status


def test_esewa_answer_for_another_transaction_is_rejected(buyer, paid_course, esewa_on):
    order = order_for(buyer, paid_course("1500.00"))
    ref = initiate(buyer, order["number"], provider="esewa")["payment"]["reference"]
    body = {"status": "COMPLETE", "total_amount": 1500.0, "transaction_uuid": "SOMEONE-ELSE"}
    with mock.patch.object(esewa, "request_json", return_value=(200, body)):
        result = verify(buyer, ref)
    assert result["order"]["status"] == "pending"


# --- Background reconciliation -------------------------------------------------------


def test_reconcile_completes_abandoned_redirects(buyer, paid_course):
    course = paid_course()
    order = order_for(buyer, course)
    ref = initiate(buyer, order["number"])["payment"]["reference"]
    complete_charge(ref)  # the learner paid but never came back
    assert services.reconcile_pending_payments() == 0  # too recent to chase
    Payment.objects.filter(reference=ref).update(created_at=timezone.now() - timedelta(minutes=10))
    assert services.reconcile_pending_payments() == 1
    assert Order.objects.get(number=order["number"]).status == "paid"
    assert _enrolled(buyer.user, course)
    assert services.reconcile_pending_payments() == 0  # terminal now


def test_paid_order_survives_expiry_job(buyer, paid_course):
    order, _ref, _ = pay_with_sandbox(buyer, paid_course())
    Order.objects.filter(number=order["number"]).update(expires_at=timezone.now() - timedelta(days=1))
    assert services.expire_stale_orders() == 0
    assert Order.objects.get(number=order["number"]).status == "paid"


# --- Bank transfer (learner side) ----------------------------------------------------


def test_bank_transfer_submission_holds_the_order(buyer, paid_course, bank_enabled):
    course = paid_course()
    order = order_for(buyer, course)
    started = initiate(buyer, order["number"], provider="bank_transfer")
    assert started["action"]["kind"] == "none" and started["payment"]["status"] == "pending"
    again = initiate(buyer, order["number"], provider="bank_transfer")
    assert again["payment"]["reference"] == started["payment"]["reference"]  # reused, not duplicated
    ref = started["payment"]["reference"]
    res = buyer.post(
        f"/api/v1/payments/{ref}/bank-transfer/",
        {"payer_name": "Demo Learner", "bank_reference": " TXN-77 ", "transferred_on": "2026-10-20"},
        format="json",
    )
    assert res.status_code == 200 and res.json()["bank_reference"] == "TXN-77"
    db_order = Order.objects.get(number=order["number"])
    assert db_order.expires_at > timezone.now() + timedelta(days=13)
    assert not _enrolled(buyer.user, course)
    # While finance reviews, the learner can neither cancel nor replace the order.
    assert buyer.post(f"/api/v1/me/orders/{order['number']}/cancel/").status_code == 409
    res = buyer.post("/api/v1/orders/", {"courses": [course.slug]}, format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "transfer_under_review"
    # Verify is a no-op for manual payments.
    assert verify(buyer, ref)["order"]["status"] == "pending"
