"""Order and payment rules.

Lock order: Order rows are always locked before Payment rows. Provider calls
happen outside transactions (a slow gateway must not hold locks); the result is
then applied under the locks, where an already-final payment is left alone, so
any number of concurrent or repeated verifications have the effect of one.
"""

import logging
import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.cms import sanitize
from apps.learning import services as learning
from apps.learning.models import Enrollment
from common.exceptions import ConflictError, DomainError

from . import pricing
from .models import (
    ZERO,
    CouponRedemption,
    Order,
    OrderItem,
    Payment,
    PaymentEvent,
    PaymentSettings,
    Refund,
)
from .providers import GATEWAYS, ProviderError, Verification, get_gateway

logger = logging.getLogger(__name__)

BANK_TRANSFER = Payment.Provider.BANK_TRANSFER
# Re-check gateway payments the learner never came back from, for this long.
RECONCILE_WINDOW = timedelta(hours=24)
RECONCILE_EVERY = timedelta(minutes=5)
# How long a bank transfer may wait for review before the order can expire.
BANK_TRANSFER_HOLD = timedelta(days=14)


# --- Methods -------------------------------------------------------------------------


def available_methods() -> list[dict]:
    """Methods a learner may choose now: enabled by finance and, for gateways, configured."""
    config = PaymentSettings.load()
    enabled = {"khalti": config.khalti_enabled, "esewa": config.esewa_enabled, "sandbox": True}
    methods = [
        {"key": key, "label": gateway.label, "kind": "gateway", "min_amount": gateway.min_amount}
        for key, gateway in GATEWAYS.items()
        if enabled[key] and gateway.is_configured()
    ]
    if config.bank_transfer_enabled:
        methods.append({"key": BANK_TRANSFER, "label": "Bank transfer", "kind": "manual", "min_amount": ZERO})
    return methods


def _method_or_error(key: str) -> dict:
    method = next((m for m in available_methods() if m["key"] == key), None)
    if method is None:
        raise DomainError("This payment method is not available.", code="method_unavailable")
    return method


# --- Orders --------------------------------------------------------------------------


def _new_number() -> str:
    return f"HX{timezone.localdate():%y%m%d}-{secrets.token_hex(3).upper()}"


def _check_learner_can_buy(user, courses) -> None:
    enrollments = {e.course_id: e for e in Enrollment.objects.filter(user=user, course__in=courses)}
    for course in courses:
        enrollment = enrollments.get(course.pk)
        if enrollment and enrollment.is_active:
            raise ConflictError(f"You are already enrolled in {course.title}.", code="already_enrolled")
        if enrollment:
            raise DomainError(
                "Your access to this course was removed. Contact support.", code="revoked", status_code=403
            )


def _release_coupon(order: Order) -> None:
    CouponRedemption.objects.filter(order=order, status=CouponRedemption.Status.RESERVED).update(
        status=CouponRedemption.Status.RELEASED
    )


@transaction.atomic
def create_order(user, slugs: list[str], coupon_code: str = "", *, request=None) -> Order:
    # The coupon row lock serialises redemptions so usage limits hold under concurrency.
    q = pricing.quote(user, slugs, coupon_code, lock_coupon=True)
    courses = [line.course for line in q.lines]
    _check_learner_can_buy(user, courses)

    # An earlier unpaid order for the same courses is replaced. If it is paid
    # later anyway, verification still honours it (and flags any double payment).
    overlapping = pricing.replaceable_orders(user, courses)
    stale = Order.objects.select_for_update().filter(pk__in=overlapping.values("pk"))
    for old in stale:
        if _transfer_under_review(old):
            raise ConflictError(
                "A bank transfer for this course is waiting for review. Please wait for it to be confirmed.",
                code="transfer_under_review",
            )
        _close(old, Order.Status.CANCELLED, actor=user, request=request, reason="replaced")

    ttl = PaymentSettings.load().order_ttl_minutes
    order = Order.objects.create(
        number=_new_number(),
        user=user,
        currency=settings.PAYMENTS["DEFAULT_CURRENCY"],
        subtotal=q.subtotal,
        discount=q.discount,
        total=q.total,
        coupon=q.coupon,
        coupon_code=q.coupon.code if q.coupon else "",
        expires_at=timezone.now() + timedelta(minutes=ttl),
    )
    OrderItem.objects.bulk_create(
        OrderItem(
            order=order,
            course=line.course,
            title=line.course.title,
            course_slug=line.course.slug,
            list_price=line.list_price,
            unit_price=line.unit_price,
            discount=line.discount,
            total=line.total,
        )
        for line in q.lines
    )
    if q.coupon:
        CouponRedemption.objects.create(coupon=q.coupon, order=order, user=user, amount=q.discount)
    audit.record("commerce.order_created", actor=user, target=order, request=request, total=str(order.total))

    if order.total == ZERO:
        # Fully discounted: nothing to collect.
        _mark_paid(order, actor=user, request=request, note="no payment due")
    return order


def _transfer_under_review(order: Order) -> bool:
    return order.payments.filter(
        provider=BANK_TRANSFER, status=Payment.Status.PENDING, submitted_at__isnull=False
    ).exists()


def _close(order: Order, status: str, *, actor=None, request=None, reason: str = "") -> None:
    order.status = status
    order.cancelled_at = timezone.now()
    order.save(update_fields=["status", "cancelled_at", "updated_at"])
    _release_coupon(order)
    order.payments.filter(status__in=[Payment.Status.INITIATED, Payment.Status.PENDING]).update(
        status=Payment.Status.CANCELLED if status == Order.Status.CANCELLED else Payment.Status.EXPIRED
    )
    audit.record(f"commerce.order_{status}", actor=actor, target=order, request=request, reason=reason)


@transaction.atomic
def cancel_order(order: Order, *, actor, request=None, reason: str = "") -> Order:
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status != Order.Status.PENDING:
        raise ConflictError("Only unpaid orders can be cancelled.", code="not_cancellable")
    if _transfer_under_review(order):
        raise ConflictError("A bank transfer for this order is being reviewed.", code="transfer_under_review")
    _close(order, Order.Status.CANCELLED, actor=actor, request=request, reason=reason)
    return order


def _flag(order: Order, reason: str) -> None:
    order.needs_review = True
    order.review_reason = reason[:300]


def _fulfil(order: Order) -> list[str]:
    """Enrolls the buyer in every course on the order. Returns problems for review."""
    problems = []
    for item in order.items.select_related("course"):
        if item.course is None:
            problems.append(f"{item.title} no longer exists")
            continue
        enrollment, created = learning.enroll_purchase(order.user, item.course)
        if enrollment is None:
            problems.append(f"the learner had been removed from {item.title}; access was not restored")
        elif not created and order.total > ZERO:
            problems.append(f"the learner already had access to {item.title} (possible double purchase)")
    return problems


def _mark_paid(order: Order, *, actor=None, request=None, payment: Payment | None = None, note: str = "") -> None:
    """Caller holds the order lock and has verified the money."""
    late = order.get_status_display().lower() if order.status != Order.Status.PENDING else ""
    order.status, order.paid_at = Order.Status.PAID, timezone.now()
    problems = _fulfil(order)
    if late:
        problems.insert(0, f"paid after the order was {late}")
    if problems:
        _flag(order, "; ".join(problems))
    order.save(update_fields=["status", "paid_at", "needs_review", "review_reason", "updated_at"])
    CouponRedemption.objects.filter(order=order).update(status=CouponRedemption.Status.REDEEMED)
    audit.record(
        "commerce.order_paid",
        actor=actor,
        target=order,
        request=request,
        payment=payment.reference if payment else None,
        provider=payment.provider if payment else None,
        note=note,
    )


# --- Payments ------------------------------------------------------------------------


def return_url(payment: Payment) -> str:
    return f"{settings.FRONTEND_URL}/checkout/complete/{payment.reference}"


def _event(payment: Payment, kind: str, *, source: str, data: dict | None = None) -> None:
    PaymentEvent.objects.create(payment=payment, kind=kind, source=source, status_after=payment.status, data=data or {})


def initiate_payment(order: Order, provider_key: str, *, request=None):
    """Creates a Payment and asks the provider how to collect it. Returns (payment, Initiation | None)."""
    method = _method_or_error(provider_key)
    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if not order.is_open:
            raise ConflictError("This order can no longer be paid. Start a new order.", code="order_closed")
        if order.total < method["min_amount"]:
            raise DomainError(
                f"{method['label']} needs a total of at least Rs {method['min_amount']}.", code="amount_too_small"
            )
        if provider_key == BANK_TRANSFER:
            existing = order.payments.filter(provider=BANK_TRANSFER, status=Payment.Status.PENDING).first()
            if existing:
                return existing, None
        payment = Payment.objects.create(
            order=order,
            provider=provider_key,
            amount=order.total,
            currency=order.currency,
            reference=f"{order.number}-{secrets.token_hex(4).upper()}",
            status=Payment.Status.PENDING if provider_key == BANK_TRANSFER else Payment.Status.INITIATED,
        )
    if provider_key == BANK_TRANSFER:
        _event(payment, PaymentEvent.Kind.INITIATED, source="learner")
        return payment, None

    gateway = get_gateway(provider_key)
    try:
        initiation = gateway.initiate(payment, return_url=return_url(payment), website_url=settings.FRONTEND_URL)
    except ProviderError as exc:
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])
        _event(payment, PaymentEvent.Kind.PROVIDER_ERROR, source="learner", data={"message": str(exc)})
        logger.warning("payment initiation failed", extra={"payment": payment.reference, "provider": provider_key})
        raise DomainError(
            "The payment provider is not responding. Please try again shortly.",
            code="provider_unavailable",
            status_code=502,
        ) from None
    if initiation.provider_reference:
        payment.provider_reference = initiation.provider_reference
        payment.save(update_fields=["provider_reference", "updated_at"])
    _event(payment, PaymentEvent.Kind.INITIATED, source="learner", data=initiation.data)
    return payment, initiation


def verify_payment(payment: Payment, *, source: str, request=None) -> Payment:
    """Asks the provider for the payment's real state and applies it. Idempotent."""
    if payment.is_terminal or payment.provider == BANK_TRANSFER:
        return payment
    gateway = get_gateway(payment.provider)
    if gateway is None or not gateway.is_configured():
        return payment
    try:
        result = gateway.verify(payment)
    except ProviderError as exc:
        _event(payment, PaymentEvent.Kind.PROVIDER_ERROR, source=source, data={"message": str(exc)})
        Payment.objects.filter(pk=payment.pk).update(last_checked_at=timezone.now())
        payment.refresh_from_db()
        return payment
    return _apply(payment.pk, result, source=source, request=request)


GATEWAY_STATUS = {
    "pending": Payment.Status.PENDING,
    "failed": Payment.Status.FAILED,
    "cancelled": Payment.Status.CANCELLED,
    "expired": Payment.Status.EXPIRED,
    "refunded": Payment.Status.REFUNDED,
}


@transaction.atomic
def _apply(payment_id: int, result: Verification, *, source: str, request=None) -> Payment:
    order_id = Payment.objects.values_list("order_id", flat=True).get(pk=payment_id)
    order = Order.objects.select_for_update().get(pk=order_id)
    payment = Payment.objects.select_for_update().get(pk=payment_id)
    now = timezone.now()
    payment.last_checked_at = now
    payment.provider_status = result.raw_status[:40]
    if result.transaction_id:
        payment.provider_transaction_id = result.transaction_id[:100]
    fields = ["last_checked_at", "provider_status", "provider_transaction_id", "status", "verified_at", "updated_at"]

    if payment.is_terminal:
        payment.save(update_fields=fields)
        return payment

    if result.status == "completed":
        payment.verified_at = now
        if result.amount is None or result.amount != payment.amount or payment.amount != order.total:
            payment.status = Payment.Status.MISMATCH
            _flag(order, f"payment {payment.reference} reported Rs {result.amount}, expected Rs {payment.amount}")
            order.save(update_fields=["needs_review", "review_reason", "updated_at"])
            audit.record("commerce.payment_mismatch", target=payment, request=request, reported=str(result.amount))
        elif order.is_paid:
            payment.status = Payment.Status.DUPLICATE
            _flag(order, f"paid twice; refund payment {payment.reference}")
            order.save(update_fields=["needs_review", "review_reason", "updated_at"])
            audit.record("commerce.payment_duplicate", target=payment, request=request, order=order.number)
        else:
            payment.status = Payment.Status.COMPLETED
            payment.save(update_fields=fields)
            _mark_paid(order, request=request, payment=payment)
            _event(payment, PaymentEvent.Kind.VERIFIED, source=source, data=result.data)
            return payment
    elif result.status == "not_found":
        # The learner never finished at the provider. Give up once the order has lapsed.
        if not order.is_open and now - payment.created_at > RECONCILE_WINDOW:
            payment.status = Payment.Status.EXPIRED
    else:
        payment.status = GATEWAY_STATUS[result.status]
    payment.save(update_fields=fields)
    _event(payment, PaymentEvent.Kind.VERIFIED, source=source, data=result.data)
    return payment


def reconcile_pending_payments(now=None) -> int:
    """Re-checks gateway payments the learner may have abandoned mid-redirect."""
    now = now or timezone.now()
    due = Payment.objects.filter(
        status__in=[Payment.Status.INITIATED, Payment.Status.PENDING],
        created_at__gte=now - RECONCILE_WINDOW,
        created_at__lte=now - RECONCILE_EVERY,
    ).exclude(provider=BANK_TRANSFER)
    due = due.filter(last_checked_at__isnull=True) | due.filter(last_checked_at__lte=now - RECONCILE_EVERY)
    count = 0
    for payment in due.select_related("order")[:200]:
        verify_payment(payment, source="task")
        count += 1
    return count


def expire_stale_orders(now=None) -> int:
    now = now or timezone.now()
    count = 0
    for order_id in Order.objects.filter(status=Order.Status.PENDING, expires_at__lte=now).values_list("pk", flat=True)[
        :500
    ]:
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=order_id)
            if order.status != Order.Status.PENDING or order.expires_at > now:
                continue
            if _transfer_under_review(order):
                continue  # finance has a transfer to review
            _close(order, Order.Status.EXPIRED, reason="unpaid")
            count += 1
    return count


# --- Bank transfers -----------------------------------------------------------------


@transaction.atomic
def submit_bank_transfer(
    payment: Payment, *, payer_name: str, bank_reference: str, transferred_on, note: str, request=None
):
    order = Order.objects.select_for_update().get(pk=payment.order_id)
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.provider != BANK_TRANSFER or payment.status != Payment.Status.PENDING:
        raise ConflictError("This payment cannot be updated.", code="not_editable")
    if order.status != Order.Status.PENDING:
        raise ConflictError("This order can no longer be paid. Start a new order.", code="order_closed")
    if payment.submitted_at is None and not order.is_open:
        raise ConflictError("This order has expired. Start a new order.", code="order_closed")
    payment.payer_name = sanitize.clean_plain_text(payer_name)[:120]
    payment.bank_reference = sanitize.clean_plain_text(bank_reference)[:100]
    payment.transferred_on = transferred_on
    payment.payer_note = sanitize.clean_plain_text(note)[:500]
    payment.submitted_at = timezone.now()
    payment.save()
    # Keep the order open while finance reviews the transfer.
    order.expires_at = max(order.expires_at or timezone.now(), timezone.now() + BANK_TRANSFER_HOLD)
    order.save(update_fields=["expires_at", "updated_at"])
    _event(payment, PaymentEvent.Kind.SUBMITTED, source="learner", data={"bank_reference": payment.bank_reference})
    audit.record("commerce.bank_transfer_submitted", target=payment, request=request)
    return payment


def _reviewable_transfer(payment: Payment) -> tuple[Order, Payment]:
    order = Order.objects.select_for_update().get(pk=payment.order_id)
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.provider != BANK_TRANSFER or payment.status != Payment.Status.PENDING or payment.submitted_at is None:
        raise ConflictError("There is no submitted bank transfer to review.", code="not_reviewable")
    return order, payment


@transaction.atomic
def approve_bank_transfer(payment: Payment, *, amount_received: Decimal, note: str, actor, request=None) -> Payment:
    order, payment = _reviewable_transfer(payment)
    if amount_received != payment.amount:
        raise DomainError(
            f"The amount received must equal the order total (Rs {payment.amount}). Reject the transfer otherwise.",
            code="amount_mismatch",
        )
    if order.is_paid:
        raise ConflictError("This order is already paid.", code="already_paid")
    now = timezone.now()
    payment.status, payment.verified_at = Payment.Status.COMPLETED, now
    payment.reviewed_by, payment.reviewed_at, payment.review_note = actor, now, sanitize.clean_plain_text(note)[:500]
    payment.save()
    _event(payment, PaymentEvent.Kind.APPROVED, source="staff", data={"by": actor.pk})
    audit.record(
        "commerce.bank_transfer_approved", actor=actor, target=payment, request=request, amount=str(amount_received)
    )
    _mark_paid(order, actor=actor, request=request, payment=payment, note="bank transfer approved")
    return payment


@transaction.atomic
def reject_bank_transfer(payment: Payment, *, note: str, actor, request=None) -> Payment:
    _order, payment = _reviewable_transfer(payment)
    note = sanitize.clean_plain_text(note)[:500]
    if not note:
        raise DomainError("Explain why the transfer was rejected; the learner will see this.", code="note_required")
    now = timezone.now()
    payment.status = Payment.Status.FAILED
    payment.reviewed_by, payment.reviewed_at, payment.review_note = actor, now, note
    payment.save()
    _event(payment, PaymentEvent.Kind.REJECTED, source="staff", data={"by": actor.pk})
    audit.record("commerce.bank_transfer_rejected", actor=actor, target=payment, request=request)
    return payment


# --- Refunds -------------------------------------------------------------------------


@transaction.atomic
def record_refund(
    order: Order, *, amount: Decimal, reason: str, provider_reference: str, revoke_access: bool, actor, request=None
) -> Refund:
    order = Order.objects.select_for_update().get(pk=order.pk)
    if not order.is_paid:
        raise ConflictError("Only paid orders can be refunded.", code="not_refundable")
    if order.refundable_amount == ZERO:
        raise ConflictError("This order has already been fully refunded.", code="fully_refunded")
    if amount <= 0 or amount > order.refundable_amount:
        raise DomainError(f"Refund between Rs 0.01 and Rs {order.refundable_amount}.", code="invalid_amount")
    reason = sanitize.clean_plain_text(reason)[:500]
    if not reason:
        raise DomainError("Give a reason for the refund.", code="reason_required")
    payment = order.payments.filter(status=Payment.Status.COMPLETED).first()
    refund = Refund.objects.create(
        order=order,
        payment=payment,
        amount=amount,
        reason=reason,
        provider_reference=sanitize.clean_plain_text(provider_reference)[:100],
        revoked_access=revoke_access,
        processed_by=actor,
    )
    order.refunded_amount += amount
    order.status = Order.Status.REFUNDED if order.refunded_amount == order.total else Order.Status.PARTIALLY_REFUNDED
    order.save(update_fields=["refunded_amount", "status", "updated_at"])
    if revoke_access:
        course_ids = order.items.exclude(course=None).values_list("course_id", flat=True)
        for enrollment in Enrollment.objects.filter(
            user=order.user,
            course_id__in=course_ids,
            status=Enrollment.Status.ACTIVE,
            source=Enrollment.Source.PURCHASE,
        ):
            learning.revoke(enrollment, actor=actor, request=request)
    audit.record(
        "commerce.refund_recorded",
        actor=actor,
        target=order,
        request=request,
        amount=str(amount),
        revoked_access=revoke_access,
    )
    return refund


@transaction.atomic
def resolve_review(order: Order, *, note: str, actor, request=None) -> Order:
    order = Order.objects.select_for_update().get(pk=order.pk)
    if not order.needs_review:
        raise ConflictError("This order is not flagged for review.", code="not_flagged")
    note = sanitize.clean_plain_text(note)[:300]
    if not note:
        raise DomainError("Describe how this was resolved.", code="note_required")
    previous = order.review_reason
    order.needs_review, order.review_reason = False, ""
    order.save(update_fields=["needs_review", "review_reason", "updated_at"])
    audit.record("commerce.review_resolved", actor=actor, target=order, request=request, reason=previous, note=note)
    return order
