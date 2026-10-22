"""Staff serializers for orders, payments, refunds, coupons and payment settings."""

from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Course
from apps.cms import sanitize

from . import pricing
from .models import Coupon, CouponRedemption, Order, Payment, PaymentEvent, PaymentSettings, Refund
from .providers import GATEWAYS
from .serializers import MONEY, OrderItemSerializer


class BuyerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()


class AdminOrderSerializer(serializers.ModelSerializer):
    user = BuyerSerializer()
    status_label = serializers.CharField(source="get_status_display")
    item_titles = serializers.SerializerMethodField()
    providers = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "number",
            "user",
            "status",
            "status_label",
            "total",
            "refunded_amount",
            "coupon_code",
            "created_at",
            "paid_at",
            "needs_review",
            "review_reason",
            "item_titles",
            "providers",
        ]

    def get_item_titles(self, order) -> list[str]:
        return [i.title for i in order.items.all()]

    def get_providers(self, order) -> list[str]:
        return sorted({p.provider for p in order.payments.all() if p.status != Payment.Status.INITIATED})


class PaymentEventSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display")

    class Meta:
        model = PaymentEvent
        fields = ["id", "kind", "kind_label", "source", "status_after", "data", "created_at"]


class AdminPaymentSerializer(serializers.ModelSerializer):
    provider_label = serializers.CharField(source="get_provider_display")
    status_label = serializers.CharField(source="get_status_display")
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", default="", read_only=True)
    events = PaymentEventSerializer(many=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "reference",
            "provider",
            "provider_label",
            "status",
            "status_label",
            "amount",
            "provider_reference",
            "provider_transaction_id",
            "provider_status",
            "created_at",
            "verified_at",
            "last_checked_at",
            "payer_name",
            "bank_reference",
            "transferred_on",
            "payer_note",
            "submitted_at",
            "reviewed_by_name",
            "reviewed_at",
            "review_note",
            "events",
        ]


class RefundSerializer(serializers.ModelSerializer):
    processed_by_name = serializers.CharField(source="processed_by.full_name", read_only=True)

    class Meta:
        model = Refund
        fields = ["id", "amount", "reason", "provider_reference", "revoked_access", "processed_by_name", "created_at"]


class AdminOrderDetailSerializer(AdminOrderSerializer):
    items = OrderItemSerializer(many=True)
    payments = AdminPaymentSerializer(many=True)
    refunds = RefundSerializer(many=True)
    refundable_amount = serializers.DecimalField(**MONEY)

    class Meta(AdminOrderSerializer.Meta):
        fields = [
            *AdminOrderSerializer.Meta.fields,
            "currency",
            "subtotal",
            "discount",
            "expires_at",
            "cancelled_at",
            "refundable_amount",
            "items",
            "payments",
            "refunds",
        ]


class RefundInputSerializer(serializers.Serializer):
    amount = serializers.DecimalField(**MONEY, min_value=Decimal("0.01"))
    reason = serializers.CharField(max_length=500)
    provider_reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    revoke_access = serializers.BooleanField(default=False)


class ApproveTransferSerializer(serializers.Serializer):
    amount_received = serializers.DecimalField(**MONEY)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class NoteSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500)


# --- Coupons -------------------------------------------------------------------------


class CouponCourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "title", "slug"]


class CouponSerializer(serializers.ModelSerializer):
    courses = serializers.PrimaryKeyRelatedField(many=True, queryset=Course.objects.all(), required=False)
    course_details = serializers.SerializerMethodField()
    redemption_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Coupon
        fields = [
            "id",
            "code",
            "description",
            "kind",
            "value",
            "max_discount",
            "min_subtotal",
            "starts_at",
            "ends_at",
            "max_redemptions",
            "per_user_limit",
            "is_active",
            "courses",
            "course_details",
            "redemption_count",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    @extend_schema_field(CouponCourseSerializer(many=True))
    def get_course_details(self, coupon) -> list[dict]:
        return CouponCourseSerializer(coupon.courses.all(), many=True).data

    def validate_code(self, value):
        code = pricing.normalise_code(value)
        if not code or not code.replace("-", "").replace("_", "").isalnum() or not code.isascii():
            raise serializers.ValidationError("Use letters, digits, hyphens and underscores only.")
        qs = Coupon.objects.filter(code=code)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A coupon with this code already exists.")
        return code

    def validate_description(self, value):
        return sanitize.clean_plain_text(value)

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        kind, value = get("kind"), get("value")
        if value is not None and value <= 0:
            raise serializers.ValidationError({"value": "Must be greater than zero."})
        if kind == Coupon.Kind.PERCENT and value is not None and value > 100:
            raise serializers.ValidationError({"value": "A percentage cannot exceed 100."})
        if kind == Coupon.Kind.FIXED and get("max_discount") is not None:
            raise serializers.ValidationError({"max_discount": "Only percentage coupons have a cap."})
        starts, ends = get("starts_at"), get("ends_at")
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": "Must be after the start."})
        if get("per_user_limit") == 0:
            raise serializers.ValidationError({"per_user_limit": "Must be at least 1."})
        if self.instance and "kind" in attrs and attrs["kind"] != self.instance.kind:
            if CouponRedemption.objects.filter(coupon=self.instance).exists():
                raise serializers.ValidationError({"kind": "A coupon that has been used cannot change type."})
        return attrs


# --- Settings ------------------------------------------------------------------------


class GatewayStatusSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    configured = serializers.BooleanField()


class AdminPaymentSettingsSerializer(serializers.ModelSerializer):
    gateways = serializers.SerializerMethodField()

    class Meta:
        model = PaymentSettings
        fields = [
            "khalti_enabled",
            "esewa_enabled",
            "bank_transfer_enabled",
            "bank_transfer_instructions",
            "order_ttl_minutes",
            "updated_at",
            "gateways",
        ]
        read_only_fields = ["updated_at"]

    @extend_schema_field(GatewayStatusSerializer(many=True))
    def get_gateways(self, obj) -> list[dict]:
        # Whether credentials are present, never the credentials themselves.
        return [{"key": key, "label": g.label, "configured": g.is_configured()} for key, g in GATEWAYS.items()]

    def validate_bank_transfer_instructions(self, value):
        return sanitize.clean_rich_text(value)

    def validate_order_ttl_minutes(self, value):
        if not 15 <= value <= 60 * 24 * 7:
            raise serializers.ValidationError("Between 15 minutes and 7 days.")
        return value

    def validate(self, attrs):
        enabled = attrs.get("bank_transfer_enabled", self.instance.bank_transfer_enabled)
        text = attrs.get("bank_transfer_instructions", self.instance.bank_transfer_instructions)
        if enabled and sanitize.rich_text_is_empty(text):
            raise serializers.ValidationError(
                {"bank_transfer_instructions": "Add the account details learners should pay into."}
            )
        return attrs


# --- Reports -------------------------------------------------------------------------


class RevenueBucketSerializer(serializers.Serializer):
    period = serializers.DateField()
    orders = serializers.IntegerField()
    gross = serializers.DecimalField(**MONEY)
    refunds = serializers.DecimalField(**MONEY)
    net = serializers.DecimalField(**MONEY)


class RevenueBreakdownSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    orders = serializers.IntegerField()
    amount = serializers.DecimalField(**MONEY)


class RevenueReportSerializer(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()
    group = serializers.CharField()
    orders = serializers.IntegerField()
    gross = serializers.DecimalField(**MONEY)
    refunds = serializers.DecimalField(**MONEY)
    net = serializers.DecimalField(**MONEY)
    series = RevenueBucketSerializer(many=True)
    by_provider = RevenueBreakdownSerializer(many=True)
    by_course = RevenueBreakdownSerializer(many=True)
    needs_review = serializers.IntegerField()
    transfers_awaiting_review = serializers.IntegerField()
