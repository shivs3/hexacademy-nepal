"""Server-side prices and coupon rules. The browser only names courses and a
coupon code; every amount comes from here."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from apps.catalog.models import Course
from common.exceptions import DomainError

from .models import ZERO, Coupon, CouponRedemption, Order

CENT = Decimal("0.01")
MAX_ITEMS = 10


@dataclass
class QuoteLine:
    course: Course
    list_price: Decimal
    unit_price: Decimal
    discount: Decimal = ZERO

    @property
    def total(self) -> Decimal:
        return self.unit_price - self.discount


@dataclass
class Quote:
    lines: list[QuoteLine]
    coupon: Coupon | None

    @property
    def subtotal(self) -> Decimal:
        return sum((line.unit_price for line in self.lines), ZERO)

    @property
    def discount(self) -> Decimal:
        return sum((line.discount for line in self.lines), ZERO)

    @property
    def total(self) -> Decimal:
        return self.subtotal - self.discount


def normalise_code(code: str) -> str:
    return "".join(str(code or "").split()).upper()


def purchasable_courses(slugs: list[str]) -> list[Course]:
    unique = list(dict.fromkeys(s for s in slugs if s))
    if not unique:
        raise DomainError("Choose at least one course.", code="empty_order")
    if len(unique) > MAX_ITEMS:
        raise DomainError(f"An order can hold at most {MAX_ITEMS} courses.", code="too_many_items")
    found = {c.slug: c for c in Course.objects.filter(slug__in=unique, status=Course.Status.PUBLISHED)}
    missing = [s for s in unique if s not in found]
    if missing:
        raise DomainError("One or more courses are not available.", code="not_available", status_code=404)
    courses = [found[s] for s in unique]
    if any(c.is_free() for c in courses):
        raise DomainError("Free courses do not need an order; enroll directly.", code="free_course")
    return courses


def _coupon_error(message: str, code: str):
    return DomainError(message, code=code)


def replaceable_orders(user, courses):
    """The learner's unpaid orders that a new checkout for these courses replaces."""
    return Order.objects.filter(user=user, status=Order.Status.PENDING, items__course__in=courses).distinct()


def check_coupon(coupon: Coupon, *, user, lines: list[QuoteLine], now=None) -> list[QuoteLine]:
    """Returns the lines the coupon applies to, or raises with a reason.

    Reservations on the learner's own orders that this checkout replaces are not
    counted, so retrying an abandoned checkout with the same code works."""
    now = now or timezone.now()
    if not coupon.is_active or (coupon.starts_at and coupon.starts_at > now):
        raise _coupon_error("This coupon is not valid.", "coupon_invalid")
    if coupon.ends_at and coupon.ends_at <= now:
        raise _coupon_error("This coupon has expired.", "coupon_expired")
    restricted = set(coupon.courses.values_list("pk", flat=True))
    eligible = [line for line in lines if not restricted or line.course.pk in restricted]
    if not eligible:
        raise _coupon_error("This coupon does not apply to these courses.", "coupon_not_applicable")
    if sum((line.unit_price for line in eligible), ZERO) < coupon.min_subtotal:
        raise _coupon_error(
            f"This coupon needs a subtotal of at least Rs {coupon.min_subtotal}.", "coupon_min_subtotal"
        )
    replaced = replaceable_orders(user, [line.course for line in lines]).values("pk")
    counted = CouponRedemption.objects.filter(coupon=coupon, status__in=CouponRedemption.COUNTED).exclude(
        order__in=replaced
    )
    if coupon.max_redemptions is not None and counted.count() >= coupon.max_redemptions:
        raise _coupon_error("This coupon has been fully used.", "coupon_exhausted")
    if counted.filter(user=user).count() >= coupon.per_user_limit:
        raise _coupon_error("You have already used this coupon.", "coupon_user_limit")
    return eligible


def coupon_discount(coupon: Coupon, eligible_subtotal: Decimal) -> Decimal:
    if coupon.kind == Coupon.Kind.PERCENT:
        amount = (eligible_subtotal * coupon.value / 100).quantize(CENT, rounding=ROUND_HALF_UP)
        if coupon.max_discount is not None:
            amount = min(amount, coupon.max_discount)
    else:
        amount = coupon.value
    return min(amount, eligible_subtotal)


def allocate(discount: Decimal, lines: list[QuoteLine]) -> None:
    """Splits a discount across lines in proportion to price; the last line takes the rounding remainder."""
    base = sum((line.unit_price for line in lines), ZERO)
    remaining = discount
    for i, line in enumerate(lines):
        if i == len(lines) - 1:
            share = remaining
        else:
            share = (discount * line.unit_price / base).quantize(CENT, rounding=ROUND_HALF_UP)
            share = min(share, line.unit_price, remaining)
        line.discount = share
        remaining -= share


def find_coupon(code: str, *, lock: bool = False) -> Coupon:
    code = normalise_code(code)
    qs = Coupon.objects.select_for_update() if lock else Coupon.objects.all()
    coupon = qs.filter(code=code).first()
    if coupon is None:
        raise _coupon_error("This coupon is not valid.", "coupon_invalid")
    return coupon


def quote(user, slugs: list[str], coupon_code: str = "", *, lock_coupon: bool = False) -> Quote:
    now = timezone.now()
    lines = [
        QuoteLine(course=c, list_price=c.price, unit_price=c.current_price(now)) for c in purchasable_courses(slugs)
    ]
    coupon = None
    if normalise_code(coupon_code):
        coupon = find_coupon(coupon_code, lock=lock_coupon)
        eligible = check_coupon(coupon, user=user, lines=lines, now=now)
        allocate(coupon_discount(coupon, sum((line.unit_price for line in eligible), ZERO)), eligible)
    return Quote(lines=lines, coupon=coupon)
