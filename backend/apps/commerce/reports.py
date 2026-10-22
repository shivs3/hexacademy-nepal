"""Revenue figures for finance. Dates are Nepal calendar days (TIME_ZONE)."""

from datetime import date

from django.db.models import Count, DecimalField, Sum, Value
from django.db.models.functions import Coalesce, TruncDate, TruncMonth

from .models import ZERO, Order, OrderItem, Payment, Refund

PAID_STATUSES = (Order.Status.PAID, Order.Status.PARTIALLY_REFUNDED, Order.Status.REFUNDED)
_MONEY = DecimalField(max_digits=12, decimal_places=2)


def _sum(field: str):
    return Coalesce(Sum(field), Value(ZERO), output_field=_MONEY)


def paid_orders(start: date, end: date):
    return Order.objects.filter(status__in=PAID_STATUSES, paid_at__date__gte=start, paid_at__date__lte=end)


def revenue(start: date, end: date, group: str = "day") -> dict:
    trunc = TruncMonth if group == "month" else TruncDate
    orders = paid_orders(start, end)
    refunds = Refund.objects.filter(created_at__date__gte=start, created_at__date__lte=end)

    buckets: dict = {}
    for row in orders.annotate(p=trunc("paid_at")).values("p").annotate(n=Count("pk"), gross=_sum("total")):
        period = row["p"].date() if hasattr(row["p"], "date") else row["p"]
        buckets[period] = {"period": period, "orders": row["n"], "gross": row["gross"], "refunds": ZERO}
    for row in refunds.annotate(p=trunc("created_at")).values("p").annotate(amount=_sum("amount")):
        period = row["p"].date() if hasattr(row["p"], "date") else row["p"]
        bucket = buckets.setdefault(period, {"period": period, "orders": 0, "gross": ZERO, "refunds": ZERO})
        bucket["refunds"] = row["amount"]
    series = [{**b, "net": b["gross"] - b["refunds"]} for _, b in sorted(buckets.items())]

    labels = dict(Payment.Provider.choices)
    by_provider = [
        {
            "key": r["provider"],
            "label": labels.get(r["provider"], r["provider"]),
            "orders": r["n"],
            "amount": r["amount"],
        }
        for r in Payment.objects.filter(order__in=orders, status=Payment.Status.COMPLETED)
        .values("provider")
        .annotate(n=Count("order", distinct=True), amount=_sum("amount"))
        .order_by("-amount")
    ]
    free = orders.filter(total=ZERO).count()
    if free:
        by_provider.append({"key": "none", "label": "No payment due (100% coupon)", "orders": free, "amount": ZERO})

    by_course = [
        {"key": r["course_slug"], "label": r["title"], "orders": r["n"], "amount": r["amount"]}
        for r in OrderItem.objects.filter(order__in=orders)
        .values("course_slug", "title")
        .annotate(n=Count("order", distinct=True), amount=_sum("total"))
        .order_by("-amount")[:10]
    ]

    totals = orders.aggregate(n=Count("pk"), gross=_sum("total"))
    refunded = refunds.aggregate(amount=_sum("amount"))["amount"]
    return {
        "start": start,
        "end": end,
        "group": group,
        "orders": totals["n"],
        "gross": totals["gross"],
        "refunds": refunded,
        "net": totals["gross"] - refunded,
        "series": series,
        "by_provider": by_provider,
        "by_course": by_course,
        "needs_review": Order.objects.filter(needs_review=True).count(),
        "transfers_awaiting_review": Payment.objects.filter(
            provider=Payment.Provider.BANK_TRANSFER, status=Payment.Status.PENDING, submitted_at__isnull=False
        ).count(),
    }
