"""Orders: server-side pricing, coupons, snapshots, ownership and expiry."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.commerce import pricing, services
from apps.commerce.models import CouponRedemption, Order
from apps.learning.models import Enrollment

from .conftest import order_for

pytestmark = pytest.mark.django_db


def test_quote_uses_server_prices_and_ignores_client_amounts(buyer, paid_course):
    course = paid_course("2000.00", sale_price=Decimal("1500.00"))
    res = buyer.post("/api/v1/orders/quote/", {"courses": [course.slug], "total": "1", "price": "1"}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["subtotal"] == "1500.00" and body["total"] == "1500.00"
    assert body["items"][0]["list_price"] == "2000.00"


def test_order_snapshots_names_and_prices(buyer, paid_course):
    course = paid_course("1500.00", title="Machine Learning Basics")
    order = order_for(buyer, course)
    assert order["status"] == "pending" and order["total"] == "1500.00" and order["can_pay"] is True
    course.title, course.price = "Renamed", Decimal("9999.00")
    course.save()
    detail = buyer.get(f"/api/v1/me/orders/{order['number']}/").json()
    assert detail["items"][0]["title"] == "Machine Learning Basics"
    assert detail["items"][0]["unit_price"] == "1500.00"


def test_orders_are_private_to_their_owner(buyer, client_for, paid_course):
    order = order_for(buyer, paid_course())
    other = client_for()
    assert other.get(f"/api/v1/me/orders/{order['number']}/").status_code == 404
    assert other.post(f"/api/v1/me/orders/{order['number']}/cancel/").status_code == 404
    res = other.post("/api/v1/payments/initiate/", {"order": order["number"], "provider": "sandbox"})
    assert res.status_code == 404
    assert other.get("/api/v1/me/orders/").json()["count"] == 0


def test_anonymous_cannot_order(api_client, paid_course):
    res = api_client.post("/api/v1/orders/", {"courses": [paid_course().slug]}, format="json")
    assert res.status_code in (401, 403)


@pytest.mark.parametrize(
    ("setup", "status_code", "code"),
    [
        ("free", 400, "free_course"),
        ("draft", 404, "not_available"),
        ("enrolled", 409, "already_enrolled"),
        ("revoked", 403, "revoked"),
    ],
)
def test_orders_are_refused_when_purchase_makes_no_sense(buyer, make_course, setup, status_code, code):
    course = make_course(
        price=Decimal("0") if setup == "free" else Decimal("500"),
        status="draft" if setup == "draft" else "published",
    )
    if setup in ("enrolled", "revoked"):
        Enrollment.objects.create(
            user=buyer.user,
            course=course,
            source="admin",
            status="revoked" if setup == "revoked" else "active",
            revoked_at=timezone.now() if setup == "revoked" else None,
        )
    res = buyer.post("/api/v1/orders/", {"courses": [course.slug]}, format="json")
    assert res.status_code == status_code, res.content
    assert res.json()["error"]["code"] == code


def test_percent_coupon_with_cap(buyer, paid_course, make_coupon):
    course = paid_course("3000.00")
    make_coupon("launch", kind="percent", value="50", max_discount=Decimal("1000.00"))
    order = order_for(buyer, course, coupon=" launch ")
    assert (order["discount"], order["total"], order["coupon_code"]) == ("1000.00", "2000.00", "LAUNCH")


def test_fixed_coupon_restricted_to_some_courses_is_split_exactly(buyer, paid_course, make_coupon):
    a, b, c = paid_course("1000.00"), paid_course("2000.00"), paid_course("700.00")
    make_coupon("PAIR", kind="fixed", value="100.00", courses=[a, b])
    order = order_for(buyer, a, b, c, coupon="PAIR")
    items = {i["course_slug"]: i for i in order["items"]}
    assert items[c.slug]["discount"] == "0.00"
    assert Decimal(items[a.slug]["discount"]) + Decimal(items[b.slug]["discount"]) == Decimal("100.00")
    assert order["total"] == "3600.00"


def test_allocation_never_loses_a_paisa():
    prices = ("333.33", "333.33", "333.34")
    lines = [pricing.QuoteLine(course=None, list_price=Decimal(p), unit_price=Decimal(p)) for p in prices]
    pricing.allocate(Decimal("100.00"), lines)
    assert sum(line.discount for line in lines) == Decimal("100.00")


@pytest.mark.parametrize(
    ("extra", "code"),
    [
        ({"is_active": False}, "coupon_invalid"),
        ({"ends_at": "past"}, "coupon_expired"),
        ({"min_subtotal": Decimal("5000")}, "coupon_min_subtotal"),
        ({"max_redemptions": 0}, "coupon_exhausted"),
    ],
)
def test_coupon_rules(buyer, paid_course, make_coupon, extra, code):
    if extra.get("ends_at") == "past":
        extra = {"starts_at": timezone.now() - timedelta(days=2), "ends_at": timezone.now() - timedelta(days=1)}
    make_coupon("RULES", **extra)
    res = buyer.post("/api/v1/orders/quote/", {"courses": [paid_course().slug], "coupon_code": "RULES"}, format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == code


def test_unknown_or_inapplicable_coupon(buyer, paid_course, make_coupon):
    other = paid_course()
    make_coupon("ONLYOTHER", courses=[other])
    for code, expected in (("NOPE", "coupon_invalid"), ("ONLYOTHER", "coupon_not_applicable")):
        res = buyer.post("/api/v1/orders/quote/", {"courses": [paid_course().slug], "coupon_code": code}, format="json")
        assert res.json()["error"]["code"] == expected


def test_coupon_limits_count_reservations_and_release_on_cancel(client_for, paid_course, make_coupon):
    course = paid_course()
    coupon = make_coupon("ONCE", max_redemptions=1)
    first, second = client_for(), client_for()
    order = order_for(first, course, coupon="ONCE")
    res = second.post("/api/v1/orders/", {"courses": [course.slug], "coupon_code": "ONCE"}, format="json")
    assert res.json()["error"]["code"] == "coupon_exhausted"
    # The same learner cannot stack it on a second order either (per-user limit 1) ... until released.
    assert first.post(f"/api/v1/me/orders/{order['number']}/cancel/").status_code == 200
    assert CouponRedemption.objects.get(coupon=coupon).status == "released"
    order_for(second, course, coupon="ONCE")


def test_full_discount_completes_without_payment(buyer, paid_course, make_coupon):
    course = paid_course()
    make_coupon("FREEPASS", value="100")
    order = order_for(buyer, course, coupon="FREEPASS")
    assert order["status"] == "paid" and order["total"] == "0.00"
    assert Enrollment.objects.get(user=buyer.user, course=course).source == "purchase"
    assert CouponRedemption.objects.get(order__number=order["number"]).status == "redeemed"


def test_new_order_replaces_an_unpaid_one(buyer, paid_course, make_coupon):
    course = paid_course()
    make_coupon("TWICE", per_user_limit=1)
    first = order_for(buyer, course, coupon="TWICE")
    second = order_for(buyer, course, coupon="TWICE")  # the first reservation is released
    assert Order.objects.get(number=first["number"]).status == "cancelled"
    assert second["status"] == "pending"


def test_unpaid_orders_expire_and_release_coupons(buyer, paid_course, make_coupon):
    make_coupon("LATER")
    order = order_for(buyer, paid_course(), coupon="LATER")
    Order.objects.filter(number=order["number"]).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert services.expire_stale_orders() == 1
    assert Order.objects.get(number=order["number"]).status == "expired"
    assert CouponRedemption.objects.get(order__number=order["number"]).status == "released"
    res = buyer.post("/api/v1/payments/initiate/", {"order": order["number"], "provider": "sandbox"}, format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "order_closed"


def test_database_rejects_inconsistent_totals(make_user):
    from django.db import IntegrityError

    with pytest.raises(IntegrityError):
        Order.objects.create(
            number="BAD-1", user=make_user(), subtotal=Decimal("100"), discount=Decimal("0"), total=Decimal("1")
        )
