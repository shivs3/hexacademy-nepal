"""Orders, payments, refunds and coupons.

Money is Decimal(10, 2) in Nepalese rupees, matching `Course.price`; nothing
here uses floats. An order is only marked paid by `services.verify_payment`
(after the provider confirmed the transaction server-side) or by a finance
manager approving a bank transfer; both are audited.
"""

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.catalog.models import Course
from common.models import TimeStampedModel

MONEY = {"max_digits": 10, "decimal_places": 2}
ZERO = Decimal("0.00")


class PaymentSettings(models.Model):
    """Singleton (id=1). Which payment methods learners see and the bank details
    for manual transfers. Gateway credentials are never stored here: they come
    from the environment (see docs/deployment.md)."""

    khalti_enabled = models.BooleanField(default=False)
    esewa_enabled = models.BooleanField(default=False)
    bank_transfer_enabled = models.BooleanField(default=False)
    bank_transfer_instructions = models.TextField(blank=True)  # sanitised rich text
    order_ttl_minutes = models.PositiveIntegerField(
        default=60, help_text="Unpaid orders expire after this long (bank transfers awaiting review do not)."
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "payment settings"
        verbose_name_plural = "payment settings"

    def __str__(self):
        return "Payment settings"

    @classmethod
    def load(cls) -> "PaymentSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class Coupon(TimeStampedModel):
    class Kind(models.TextChoices):
        PERCENT = "percent", "Percentage"
        FIXED = "fixed", "Fixed amount"

    code = models.CharField(max_length=40, unique=True)  # stored upper-case
    description = models.CharField(max_length=200, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    value = models.DecimalField(**MONEY)
    max_discount = models.DecimalField(**MONEY, null=True, blank=True, help_text="Cap for percentage coupons.")
    min_subtotal = models.DecimalField(**MONEY, default=ZERO)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    max_redemptions = models.PositiveIntegerField(null=True, blank=True)
    per_user_limit = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    courses = models.ManyToManyField(Course, blank=True, related_name="+", help_text="Empty means every paid course.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(value__gt=0), name="commerce_coupon_value_positive"),
            models.CheckConstraint(
                condition=~Q(kind="percent") | Q(value__lte=100), name="commerce_coupon_percent_max_100"
            ),
            models.CheckConstraint(condition=Q(min_subtotal__gte=0), name="commerce_coupon_min_subtotal"),
            models.CheckConstraint(
                condition=Q(starts_at__isnull=True) | Q(ends_at__isnull=True) | Q(ends_at__gt=F("starts_at")),
                name="commerce_coupon_window",
            ),
        ]

    def __str__(self):
        return self.code

    def save(self, *args, **kwargs):
        # Codes are matched case-insensitively; keep the stored form canonical
        # whichever path (API, Django admin, shell) created the row.
        self.code = "".join(self.code.split()).upper()
        super().save(*args, **kwargs)


class Order(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Awaiting payment"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"
        PARTIALLY_REFUNDED = "partially_refunded", "Partially refunded"
        REFUNDED = "refunded", "Refunded"

    number = models.CharField(max_length=24, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    currency = models.CharField(max_length=3, default="NPR")
    subtotal = models.DecimalField(**MONEY)
    discount = models.DecimalField(**MONEY, default=ZERO)
    total = models.DecimalField(**MONEY)
    refunded_amount = models.DecimalField(**MONEY, default=ZERO)
    coupon = models.ForeignKey(Coupon, null=True, blank=True, on_delete=models.SET_NULL, related_name="orders")
    coupon_code = models.CharField(max_length=40, blank=True)  # snapshot
    expires_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    # Set when something needs a person: a payment for an order that was already
    # paid, an amount mismatch, or a paid course the learner had been removed from.
    needs_review = models.BooleanField(default=False, db_index=True)
    review_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"]), models.Index(fields=["status", "paid_at"])]
        constraints = [
            models.CheckConstraint(condition=Q(subtotal__gte=0), name="commerce_order_subtotal_non_negative"),
            models.CheckConstraint(
                condition=Q(discount__gte=0) & Q(discount__lte=F("subtotal")), name="commerce_order_discount_range"
            ),
            models.CheckConstraint(
                condition=Q(total=F("subtotal") - F("discount")), name="commerce_order_total_matches"
            ),
            models.CheckConstraint(
                condition=Q(refunded_amount__gte=0) & Q(refunded_amount__lte=F("total")),
                name="commerce_order_refund_range",
            ),
            models.CheckConstraint(
                condition=~Q(status__in=["paid", "partially_refunded", "refunded"]) | Q(paid_at__isnull=False),
                name="commerce_order_paid_has_date",
            ),
        ]
        permissions = [
            ("view_orders", "Can view every order and payment"),
            ("manage_orders", "Can verify bank transfers, re-check payments and cancel orders"),
            ("manage_refunds", "Can record refunds"),
            ("manage_coupons", "Can manage coupons"),
            ("view_revenue", "Can view revenue reports and export orders"),
            ("manage_payment_settings", "Can change payment methods and bank transfer details"),
        ]

    def __str__(self):
        return self.number

    @property
    def is_paid(self) -> bool:
        return self.status in (self.Status.PAID, self.Status.PARTIALLY_REFUNDED, self.Status.REFUNDED)

    @property
    def is_open(self) -> bool:
        return self.status == self.Status.PENDING and (self.expires_at is None or self.expires_at > timezone.now())

    @property
    def refundable_amount(self) -> Decimal:
        return self.total - self.refunded_amount if self.is_paid else ZERO


class OrderItem(models.Model):
    """What was bought, with names and prices frozen at order time."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    course = models.ForeignKey(Course, null=True, on_delete=models.SET_NULL, related_name="+")
    title = models.CharField(max_length=160)
    course_slug = models.CharField(max_length=160)
    list_price = models.DecimalField(**MONEY)
    unit_price = models.DecimalField(**MONEY)  # price charged before coupons (sale price when on sale)
    discount = models.DecimalField(**MONEY, default=ZERO)  # this item's share of the coupon
    total = models.DecimalField(**MONEY)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["order", "course"], name="commerce_orderitem_unique_course"),
            models.CheckConstraint(condition=Q(total=F("unit_price") - F("discount")), name="commerce_item_total"),
            models.CheckConstraint(condition=Q(discount__gte=0), name="commerce_item_discount_non_negative"),
        ]

    def __str__(self):
        return f"{self.order_id}: {self.title}"


class Payment(TimeStampedModel):
    class Provider(models.TextChoices):
        KHALTI = "khalti", "Khalti"
        ESEWA = "esewa", "eSewa"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        SANDBOX = "sandbox", "Sandbox (test only)"

    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        PENDING = "pending", "Pending"  # gateway still processing, or a bank transfer awaiting review
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"
        REFUNDED = "refunded", "Refunded at the provider"
        DUPLICATE = "duplicate", "Paid twice: refund needed"
        MISMATCH = "mismatch", "Amount mismatch: review needed"

    TERMINAL = (Status.COMPLETED, Status.DUPLICATE, Status.MISMATCH, Status.REFUNDED)

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="payments")
    provider = models.CharField(max_length=20, choices=Provider.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.INITIATED, db_index=True)
    amount = models.DecimalField(**MONEY)
    currency = models.CharField(max_length=3, default="NPR")
    # Our identifier sent to the provider (Khalti purchase_order_id, eSewa transaction_uuid).
    reference = models.CharField(max_length=64, unique=True)
    # The provider's identifier for the payment session (Khalti pidx).
    provider_reference = models.CharField(max_length=100, null=True, blank=True)
    provider_transaction_id = models.CharField(max_length=100, blank=True)
    provider_status = models.CharField(max_length=40, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)

    # Bank transfer details supplied by the learner and the finance review.
    payer_name = models.CharField(max_length=120, blank=True)
    bank_reference = models.CharField(max_length=100, blank=True)
    transferred_on = models.DateField(null=True, blank=True)
    payer_note = models.CharField(max_length=500, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["provider", "status", "created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "provider_reference"],
                condition=Q(provider_reference__isnull=False),
                name="commerce_payment_provider_reference_unique",
            ),
            models.UniqueConstraint(
                fields=["order"], condition=Q(status="completed"), name="commerce_payment_one_completed_per_order"
            ),
            models.CheckConstraint(condition=Q(amount__gte=0), name="commerce_payment_amount_non_negative"),
        ]

    def __str__(self):
        return self.reference

    @property
    def is_terminal(self) -> bool:
        return self.status in self.TERMINAL


class PaymentEvent(models.Model):
    """Append-only history of everything a payment went through. `data` holds
    sanitised provider responses (no credentials)."""

    class Kind(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        VERIFIED = "verified", "Checked with the provider"
        PROVIDER_ERROR = "provider_error", "Provider unreachable or refused"
        WEBHOOK = "webhook", "Webhook received"
        SUBMITTED = "submitted", "Bank transfer submitted"
        APPROVED = "approved", "Bank transfer approved"
        REJECTED = "rejected", "Bank transfer rejected"
        STATUS = "status", "Status changed"

    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    source = models.CharField(max_length=20, blank=True)  # learner, task, webhook, staff
    status_after = models.CharField(max_length=20, blank=True)
    data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.payment_id}:{self.kind}"


class Refund(models.Model):
    """A refund paid back to the learner. Refunds are issued from the provider's
    merchant portal (or by bank); this records them against the order."""

    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="refunds")
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="refunds")
    amount = models.DecimalField(**MONEY)
    reason = models.CharField(max_length=500)
    provider_reference = models.CharField(max_length=100, blank=True)
    revoked_access = models.BooleanField(default=False)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.CheckConstraint(condition=Q(amount__gt=0), name="commerce_refund_amount_positive")]

    def __str__(self):
        return f"{self.order_id}: {self.amount}"


class CouponRedemption(models.Model):
    """Reserved when the order is placed (so limits hold under concurrency),
    redeemed when it is paid and released when it is cancelled or expires."""

    class Status(models.TextChoices):
        RESERVED = "reserved", "Reserved"
        REDEEMED = "redeemed", "Redeemed"
        RELEASED = "released", "Released"

    COUNTED = (Status.RESERVED, Status.REDEEMED)

    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, related_name="redemptions")
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="coupon_redemption")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RESERVED)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["coupon", "status"]), models.Index(fields=["coupon", "user", "status"])]

    def __str__(self):
        return f"{self.coupon_id}:{self.order_id}"


class WebhookEvent(models.Model):
    """Every accepted webhook delivery, keyed by the provider's event id so a
    replayed or retried delivery is recognised and ignored."""

    provider = models.CharField(max_length=20)
    event_id = models.CharField(max_length=100)
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    payload = models.JSONField(default=dict)
    received_at = models.DateTimeField(default=timezone.now)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["provider", "event_id"], name="commerce_webhook_unique_event")]

    def __str__(self):
        return f"{self.provider}:{self.event_id}"


class SandboxCharge(models.Model):
    """Gateway-side state for the local sandbox provider (development and tests
    only; production refuses to start with the sandbox enabled)."""

    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    token = models.CharField(max_length=64, unique=True)
    payment = models.OneToOneField(Payment, on_delete=models.CASCADE, related_name="sandbox_charge")
    amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.INITIATED)
    transaction_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.token
