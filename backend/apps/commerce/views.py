"""Learner checkout endpoints.

Every lookup is scoped to `request.user`, so another learner's order number or
payment reference behaves like an unknown one (404). Prices are recomputed on
the server; payment success is only ever decided by `services.verify_payment`.
"""

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.cms import sanitize
from common.exceptions import DomainError

from . import pricing, sandbox, services
from .models import Order, Payment, PaymentSettings
from .serializers import (
    BankTransferInputSerializer,
    CreateOrderSerializer,
    InitiateInputSerializer,
    InitiateResultSerializer,
    MyOrderSerializer,
    MyPaymentSerializer,
    PaymentMethodsSerializer,
    QuoteInputSerializer,
    QuoteSerializer,
    SandboxChargeSerializer,
    SandboxSimulateSerializer,
    VerifyResultSerializer,
)


class PaymentThrottleMixin:
    throttle_classes = [UserRateThrottle, ScopedRateThrottle]
    throttle_scope = "payment"


def my_orders(user):
    return (
        Order.objects.filter(user=user)
        .select_related("user")
        .prefetch_related("items", Prefetch("payments", queryset=Payment.objects.order_by("created_at")))
    )


def my_payment(user, reference) -> Payment:
    return get_object_or_404(Payment.objects.select_related("order__user"), reference=reference, order__user=user)


class PaymentMethodsView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=PaymentMethodsSerializer)
    def get(self, request):
        config = PaymentSettings.load()
        methods = services.available_methods()
        bank = any(m["key"] == Payment.Provider.BANK_TRANSFER for m in methods)
        payload = {
            "methods": methods,
            "bank_transfer_instructions": sanitize.clean_rich_text(config.bank_transfer_instructions) if bank else "",
            "sandbox": sandbox.enabled(),
        }
        return Response(PaymentMethodsSerializer(payload).data)


class QuoteView(PaymentThrottleMixin, APIView):
    @extend_schema(request=QuoteInputSerializer, responses=QuoteSerializer)
    def post(self, request):
        s = QuoteInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        q = pricing.quote(request.user, s.validated_data["courses"], s.validated_data["coupon_code"])
        return Response(QuoteSerializer(q).data)


class OrderCreateView(PaymentThrottleMixin, APIView):
    @extend_schema(request=CreateOrderSerializer, responses={201: MyOrderSerializer})
    def post(self, request):
        s = CreateOrderSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = services.create_order(
            request.user, s.validated_data["courses"], s.validated_data["coupon_code"], request=request
        )
        return Response(
            MyOrderSerializer(my_orders(request.user).get(pk=order.pk)).data, status=status.HTTP_201_CREATED
        )


class MyOrdersView(generics.ListAPIView):
    serializer_class = MyOrderSerializer
    filter_backends: list = []

    def get_queryset(self):
        return my_orders(self.request.user).order_by("-created_at")


class MyOrderDetailView(APIView):
    @extend_schema(responses=MyOrderSerializer)
    def get(self, request, number):
        return Response(MyOrderSerializer(get_object_or_404(my_orders(request.user), number=number)).data)


class MyOrderCancelView(APIView):
    @extend_schema(request=None, responses=MyOrderSerializer)
    def post(self, request, number):
        order = get_object_or_404(Order, number=number, user=request.user)
        services.cancel_order(order, actor=request.user, request=request, reason="cancelled by learner")
        return Response(MyOrderSerializer(my_orders(request.user).get(pk=order.pk)).data)


class InitiatePaymentView(PaymentThrottleMixin, APIView):
    @extend_schema(request=InitiateInputSerializer, responses={201: InitiateResultSerializer})
    def post(self, request):
        s = InitiateInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = get_object_or_404(Order, number=s.validated_data["order"], user=request.user)
        payment, initiation = services.initiate_payment(order, s.validated_data["provider"], request=request)
        action = {"kind": "none", "url": "", "fields": {}}
        if initiation is not None:
            action = {"kind": initiation.kind, "url": initiation.url, "fields": initiation.fields}
        return Response(
            InitiateResultSerializer({"payment": payment, "action": action}).data, status=status.HTTP_201_CREATED
        )


class VerifyPaymentView(PaymentThrottleMixin, APIView):
    """Called by the return page. Whatever the provider appended to the URL is
    ignored; the server asks the provider directly."""

    @extend_schema(request=None, responses=VerifyResultSerializer)
    def post(self, request, reference):
        payment = services.verify_payment(my_payment(request.user, reference), source="learner", request=request)
        order = my_orders(request.user).get(pk=payment.order_id)
        return Response(VerifyResultSerializer({"payment": payment, "order": order}).data)


class BankTransferView(PaymentThrottleMixin, APIView):
    @extend_schema(request=BankTransferInputSerializer, responses=MyPaymentSerializer)
    def post(self, request, reference):
        s = BankTransferInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        payment = services.submit_bank_transfer(
            my_payment(request.user, reference),
            payer_name=d["payer_name"],
            bank_reference=d["bank_reference"],
            transferred_on=d["transferred_on"],
            note=d["note"],
            request=request,
        )
        return Response(MyPaymentSerializer(payment).data)


def _sandbox_payment(request, reference) -> Payment:
    if not sandbox.enabled():
        raise DomainError("Not found.", code="not_found", status_code=404)
    payment = my_payment(request.user, reference)
    if payment.provider != Payment.Provider.SANDBOX:
        raise DomainError("Not found.", code="not_found", status_code=404)
    return payment


class SandboxChargeView(APIView):
    """The test gateway page's data. Only exists while the sandbox is enabled."""

    @extend_schema(responses=SandboxChargeSerializer)
    def get(self, request, reference):
        payment = _sandbox_payment(request, reference)
        charge = getattr(payment, "sandbox_charge", None)
        payload = {
            "reference": payment.reference,
            "order_number": payment.order.number,
            "amount": payment.amount,
            "status": charge.status if charge else "missing",
            "items": list(payment.order.items.values_list("title", flat=True)),
        }
        return Response(SandboxChargeSerializer(payload).data)

    @extend_schema(request=SandboxSimulateSerializer, responses=SandboxChargeSerializer)
    def post(self, request, reference):
        payment = _sandbox_payment(request, reference)
        s = SandboxSimulateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        charge = sandbox.simulate(payment, s.validated_data["outcome"])
        payload = {
            "reference": payment.reference,
            "order_number": payment.order.number,
            "amount": payment.amount,
            "status": charge.status,
            "items": list(payment.order.items.values_list("title", flat=True)),
        }
        return Response(SandboxChargeSerializer(payload).data)


class PaymentWebhookView(APIView):
    """Provider notifications. Khalti and eSewa ePay do not send webhooks (their
    payments are confirmed with the lookup/status APIs), so only the sandbox is
    accepted here. Authentication is the HMAC signature, not a session."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes: list = []

    @extend_schema(request=None, responses={200: None})
    def post(self, request, provider):
        if provider != "sandbox" or not sandbox.enabled():
            raise DomainError("Not found.", code="not_found", status_code=404)
        result = sandbox.handle_webhook(
            request.body,
            signature=request.headers.get("X-Sandbox-Signature", ""),
            timestamp=request.headers.get("X-Sandbox-Timestamp", ""),
        )
        return Response({"result": result})
