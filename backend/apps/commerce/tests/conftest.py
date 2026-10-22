import itertools
import json
import time
from decimal import Decimal

import pytest

from apps.commerce import sandbox
from apps.commerce.models import Coupon, Payment, PaymentSettings, SandboxCharge

_seq = itertools.count(1)


@pytest.fixture
def paid_course(make_course):
    def _make(price="1500.00", **extra):
        return make_course(price=Decimal(price), **extra)

    return _make


@pytest.fixture
def buyer(client_for):
    return client_for()


@pytest.fixture
def finance(client_for):
    return client_for("finance_manager")


@pytest.fixture
def make_coupon(db):
    def _make(code=None, kind="percent", value="10", courses=(), **extra):
        coupon = Coupon.objects.create(code=code or f"SAVE{next(_seq)}", kind=kind, value=Decimal(value), **extra)
        coupon.courses.set(courses)
        return coupon

    return _make


@pytest.fixture
def bank_enabled(db):
    config = PaymentSettings.load()
    config.bank_transfer_enabled = True
    config.bank_transfer_instructions = "<p>Demo bank: account 000-000 (replace with real details)</p>"
    config.save()
    return config


def order_for(client, *courses, coupon="", expect=201):
    res = client.post("/api/v1/orders/", {"courses": [c.slug for c in courses], "coupon_code": coupon}, format="json")
    assert res.status_code == expect, res.content
    return res.json()


def initiate(client, number, provider="sandbox", expect=201):
    res = client.post("/api/v1/payments/initiate/", {"order": number, "provider": provider}, format="json")
    assert res.status_code == expect, res.content
    return res.json()


def verify(client, reference, expect=200):
    res = client.post(f"/api/v1/payments/{reference}/verify/")
    assert res.status_code == expect, res.content
    return res.json()


def pay_with_sandbox(client, course, **kwargs):
    order = order_for(client, course, **kwargs)
    started = initiate(client, order["number"])
    ref = started["payment"]["reference"]
    res = client.post(f"/api/v1/payments/sandbox/{ref}/", {"outcome": "complete"}, format="json")
    assert res.status_code == 200, res.content
    return order, ref, verify(client, ref)


def complete_charge(reference):
    charge = SandboxCharge.objects.get(payment__reference=reference)
    charge.status, charge.transaction_id = SandboxCharge.Status.COMPLETED, f"tx-{reference}"
    charge.save()
    return Payment.objects.get(reference=reference)


def webhook(api_client, body: dict, *, secret=None, timestamp=None, signature=None):
    raw = json.dumps(body).encode()
    ts = str(int(time.time()) if timestamp is None else timestamp)
    sig = signature if signature is not None else sandbox.sign(raw, ts, secret)
    return api_client.post(
        "/api/v1/webhooks/payments/sandbox/",
        data=raw,
        content_type="application/json",
        HTTP_X_SANDBOX_SIGNATURE=sig,
        HTTP_X_SANDBOX_TIMESTAMP=ts,
    )
