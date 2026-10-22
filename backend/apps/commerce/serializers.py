"""Learner-facing commerce serializers. They expose the learner's own orders
and payments only; staff fields (review notes about other users, events) are
in admin_serializers."""

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import Order, OrderItem, Payment

MONEY = {"max_digits": 10, "decimal_places": 2}


class PaymentMethodSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    kind = serializers.ChoiceField(choices=["gateway", "manual"])
    min_amount = serializers.DecimalField(**MONEY)


class PaymentMethodsSerializer(serializers.Serializer):
    methods = PaymentMethodSerializer(many=True)
    bank_transfer_instructions = serializers.CharField(allow_blank=True)
    sandbox = serializers.BooleanField()


class QuoteInputSerializer(serializers.Serializer):
    courses = serializers.ListField(child=serializers.SlugField(max_length=160), min_length=1, max_length=10)
    coupon_code = serializers.CharField(max_length=40, required=False, allow_blank=True, default="")


class QuoteLineSerializer(serializers.Serializer):
    course_slug = serializers.CharField(source="course.slug")
    title = serializers.CharField(source="course.title")
    list_price = serializers.DecimalField(**MONEY)
    unit_price = serializers.DecimalField(**MONEY)
    discount = serializers.DecimalField(**MONEY)
    total = serializers.DecimalField(**MONEY)


class QuoteSerializer(serializers.Serializer):
    items = QuoteLineSerializer(source="lines", many=True)
    subtotal = serializers.DecimalField(**MONEY)
    discount = serializers.DecimalField(**MONEY)
    total = serializers.DecimalField(**MONEY)
    coupon_code = serializers.CharField(source="coupon.code", default="")
    currency = serializers.CharField(default="NPR")


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["course_slug", "title", "list_price", "unit_price", "discount", "total"]


class MyPaymentSerializer(serializers.ModelSerializer):
    provider_label = serializers.CharField(source="get_provider_display")
    status_label = serializers.CharField(source="get_status_display")

    class Meta:
        model = Payment
        fields = [
            "reference",
            "provider",
            "provider_label",
            "status",
            "status_label",
            "amount",
            "created_at",
            "verified_at",
            "bank_reference",
            "transferred_on",
            "submitted_at",
            "review_note",
        ]


class MyOrderSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display")
    items = OrderItemSerializer(many=True)
    payments = serializers.SerializerMethodField()
    can_pay = serializers.BooleanField(source="is_open")
    buyer_name = serializers.CharField(source="user.full_name")
    buyer_email = serializers.EmailField(source="user.email")

    class Meta:
        model = Order
        fields = [
            "number",
            "status",
            "status_label",
            "currency",
            "subtotal",
            "discount",
            "total",
            "refunded_amount",
            "coupon_code",
            "created_at",
            "expires_at",
            "paid_at",
            "can_pay",
            "buyer_name",
            "buyer_email",
            "items",
            "payments",
        ]

    @extend_schema_field(MyPaymentSerializer(many=True))
    def get_payments(self, order) -> list[dict]:
        # Abandoned gateway attempts are noise for the learner.
        shown = [p for p in order.payments.all() if p.status != Payment.Status.INITIATED]
        return MyPaymentSerializer(shown, many=True).data


class CreateOrderSerializer(QuoteInputSerializer):
    pass


class InitiateInputSerializer(serializers.Serializer):
    order = serializers.CharField(max_length=24)
    provider = serializers.ChoiceField(choices=Payment.Provider.choices)


class PaymentActionSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["redirect", "form", "none"])
    url = serializers.CharField(allow_blank=True)
    fields = serializers.DictField(child=serializers.CharField())


class InitiateResultSerializer(serializers.Serializer):
    payment = MyPaymentSerializer()
    action = PaymentActionSerializer()


class VerifyResultSerializer(serializers.Serializer):
    payment = MyPaymentSerializer()
    order = MyOrderSerializer()


class BankTransferInputSerializer(serializers.Serializer):
    payer_name = serializers.CharField(max_length=120)
    bank_reference = serializers.CharField(max_length=100)
    transferred_on = serializers.DateField()
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class SandboxSimulateSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=["complete", "cancel"])


class SandboxChargeSerializer(serializers.Serializer):
    reference = serializers.CharField()
    order_number = serializers.CharField()
    amount = serializers.DecimalField(**MONEY)
    status = serializers.CharField()
    items = serializers.ListField(child=serializers.CharField())
