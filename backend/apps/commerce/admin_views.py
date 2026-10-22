"""Finance endpoints under /api/v1/admin/commerce/.

Permissions (granted to the Finance Manager role; Support Staff can only view
orders). None of these expose gateway credentials or exam data.
"""

from datetime import date, timedelta

from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit import services as audit
from apps.catalog.models import Course
from common.exceptions import ConflictError
from common.permissions import HasPerm
from common.spreadsheet import csv_text

from . import reports, services
from .admin_serializers import (
    AdminOrderDetailSerializer,
    AdminOrderSerializer,
    AdminPaymentSerializer,
    AdminPaymentSettingsSerializer,
    ApproveTransferSerializer,
    CouponCourseSerializer,
    CouponSerializer,
    NoteSerializer,
    RefundInputSerializer,
    RevenueReportSerializer,
)
from .models import Coupon, CouponRedemption, Order, Payment, PaymentEvent, PaymentSettings

VIEW_ORDERS = "commerce.view_orders"
MANAGE_ORDERS = "commerce.manage_orders"
MANAGE_REFUNDS = "commerce.manage_refunds"
MANAGE_COUPONS = "commerce.manage_coupons"
VIEW_REVENUE = "commerce.view_revenue"
MANAGE_SETTINGS = "commerce.manage_payment_settings"
SEE_ORDERS = (VIEW_ORDERS, MANAGE_ORDERS, MANAGE_REFUNDS, VIEW_REVENUE)
MAX_EXPORT_DAYS = 366

transfer_waiting = Payment.objects.filter(
    order=OuterRef("pk"),
    provider=Payment.Provider.BANK_TRANSFER,
    status=Payment.Status.PENDING,
    submitted_at__isnull=False,
)

ORDER_FILTERS = [
    OpenApiParameter("status", str, enum=[c for c, _ in Order.Status.choices]),
    OpenApiParameter("provider", str, enum=[c for c, _ in Payment.Provider.choices]),
    OpenApiParameter("needs_review", bool),
    OpenApiParameter("awaiting_transfer_review", bool),
    OpenApiParameter("search", str, description="Order number, payment reference, learner name or email"),
]


def _date_range(params, *, default_days: int = 30) -> tuple[date, date]:
    today = timezone.localdate()
    end = parse_date(params.get("end") or "") or today
    start = parse_date(params.get("start") or "") or end - timedelta(days=default_days - 1)
    if start > end:
        raise ValidationError({"start": "Must be on or before the end date."})
    if (end - start).days >= MAX_EXPORT_DAYS:
        raise ValidationError({"start": f"Choose a range of at most {MAX_EXPORT_DAYS} days."})
    return start, end


def filter_orders(qs, params):
    if value := params.get("status"):
        qs = qs.filter(status=value)
    if value := params.get("provider"):
        qs = qs.filter(payments__provider=value).distinct()
    if params.get("needs_review") in ("true", "1"):
        qs = qs.filter(needs_review=True)
    if params.get("awaiting_transfer_review") in ("true", "1"):
        qs = qs.filter(Exists(transfer_waiting))
    if term := (params.get("search") or "").strip():
        qs = qs.filter(
            Q(number__icontains=term)
            | Q(payments__reference__iexact=term)
            | Q(payments__provider_transaction_id__iexact=term)
            | Q(user__email__icontains=term)
            | Q(user__full_name__icontains=term)
        ).distinct()
    return qs


@extend_schema(parameters=ORDER_FILTERS)
class AdminOrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    filter_backends: list = []
    lookup_field = "number"

    def get_permissions(self):
        perms = {
            "cancel": (MANAGE_ORDERS,),
            "refund": (MANAGE_REFUNDS,),
            "resolve_review": (MANAGE_ORDERS,),
            "export": (VIEW_REVENUE,),
        }.get(self.action, SEE_ORDERS)
        return [HasPerm(*perms, any_of=True)()]

    def get_serializer_class(self):
        return AdminOrderSerializer if self.action == "list" else AdminOrderDetailSerializer

    def get_queryset(self):
        qs = Order.objects.select_related("user").prefetch_related("items")
        if self.action not in ("retrieve", "refund", "cancel", "resolve_review"):
            qs = qs.prefetch_related("payments")
        else:
            # Detail responses need payment events; one "payments" prefetch only.
            qs = qs.prefetch_related(
                Prefetch(
                    "payments",
                    queryset=Payment.objects.select_related("reviewed_by").prefetch_related(
                        Prefetch("events", queryset=PaymentEvent.objects.order_by("created_at", "id"))
                    ),
                ),
                "refunds__processed_by",
            )
        return filter_orders(qs, self.request.query_params).order_by("-created_at")

    def _detail(self, order):
        return Response(AdminOrderDetailSerializer(self.get_queryset().get(pk=order.pk)).data)

    @extend_schema(request=NoteSerializer, responses=AdminOrderDetailSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, number=None):
        s = NoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = services.cancel_order(
            self.get_object(), actor=request.user, request=request, reason=s.validated_data["note"]
        )
        return self._detail(order)

    @extend_schema(request=RefundInputSerializer, responses={201: AdminOrderDetailSerializer})
    @action(detail=True, methods=["post"])
    def refund(self, request, number=None):
        s = RefundInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = self.get_object()
        services.record_refund(order, actor=request.user, request=request, **s.validated_data)
        response = self._detail(order)
        response.status_code = status.HTTP_201_CREATED
        return response

    @extend_schema(request=NoteSerializer, responses=AdminOrderDetailSerializer)
    @action(detail=True, methods=["post"], url_path="resolve-review")
    def resolve_review(self, request, number=None):
        s = NoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        order = services.resolve_review(
            self.get_object(), note=s.validated_data["note"], actor=request.user, request=request
        )
        return self._detail(order)

    @extend_schema(
        parameters=[
            *ORDER_FILTERS,
            OpenApiParameter("start", OpenApiTypes.DATE),
            OpenApiParameter("end", OpenApiTypes.DATE),
        ],
        responses={(200, "text/csv"): OpenApiTypes.STR},
    )
    @action(detail=False, methods=["get"])
    def export(self, request):
        start, end = _date_range(request.query_params)
        qs = (
            filter_orders(Order.objects.all(), request.query_params)
            .filter(created_at__date__gte=start, created_at__date__lte=end)
            .select_related("user")
            .prefetch_related("items", "payments")
            .order_by("created_at")
        )
        header = ["order", "created_at", "paid_at", "status", "learner", "email", "courses", "subtotal",
                  "discount", "coupon", "total", "refunded", "provider", "payment_reference",
                  "provider_transaction_id"]  # fmt: skip
        rows = []
        for o in qs:
            paid = next((p for p in o.payments.all() if p.status == Payment.Status.COMPLETED), None)
            rows.append([
                o.number, o.created_at.isoformat(), o.paid_at.isoformat() if o.paid_at else "", o.status,
                o.user.full_name, o.user.email, "; ".join(i.title for i in o.items.all()), o.subtotal, o.discount,
                o.coupon_code, o.total, o.refunded_amount, paid.provider if paid else "",
                paid.reference if paid else "", paid.provider_transaction_id if paid else "",
            ])  # fmt: skip
        audit.record(
            "commerce.orders_exported",
            actor=request.user,
            request=request,
            start=str(start),
            end=str(end),
            rows=len(rows),
        )
        response = HttpResponse(csv_text(header, rows), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="orders-{start}-to-{end}.csv"'
        return response


class AdminPaymentViewSet(viewsets.GenericViewSet):
    """Actions on a single payment: re-check a gateway, review a bank transfer."""

    queryset = Payment.objects.select_related("order", "reviewed_by").prefetch_related("events")
    permission_classes = [HasPerm(MANAGE_ORDERS)]
    serializer_class = AdminPaymentSerializer

    @extend_schema(request=None, responses=AdminPaymentSerializer)
    @action(detail=True, methods=["post"])
    def recheck(self, request, pk=None):
        payment = services.verify_payment(self.get_object(), source="staff", request=request)
        return Response(AdminPaymentSerializer(self.get_queryset().get(pk=payment.pk)).data)

    @extend_schema(request=ApproveTransferSerializer, responses=AdminPaymentSerializer)
    @action(detail=True, methods=["post"], url_path="approve-transfer")
    def approve_transfer(self, request, pk=None):
        s = ApproveTransferSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        payment = services.approve_bank_transfer(
            self.get_object(), actor=request.user, request=request, **s.validated_data
        )
        return Response(AdminPaymentSerializer(self.get_queryset().get(pk=payment.pk)).data)

    @extend_schema(request=NoteSerializer, responses=AdminPaymentSerializer)
    @action(detail=True, methods=["post"], url_path="reject-transfer")
    def reject_transfer(self, request, pk=None):
        s = NoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        payment = services.reject_bank_transfer(
            self.get_object(), note=s.validated_data["note"], actor=request.user, request=request
        )
        return Response(AdminPaymentSerializer(self.get_queryset().get(pk=payment.pk)).data)


@extend_schema(parameters=[OpenApiParameter("search", str), OpenApiParameter("active", bool)])
class AdminCouponViewSet(viewsets.ModelViewSet):
    serializer_class = CouponSerializer
    permission_classes = [HasPerm(MANAGE_COUPONS)]
    filter_backends: list = []

    def get_queryset(self):
        counted = Count("redemptions", filter=Q(redemptions__status__in=CouponRedemption.COUNTED))
        qs = Coupon.objects.prefetch_related("courses").annotate(redemption_count=counted)
        if term := (self.request.query_params.get("search") or "").strip():
            qs = qs.filter(Q(code__icontains=term) | Q(description__icontains=term))
        if self.request.query_params.get("active") in ("true", "1"):
            qs = qs.filter(is_active=True)
        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        coupon = serializer.save(created_by=self.request.user)
        audit.record(
            "commerce.coupon_created", actor=self.request.user, target=coupon, request=self.request, code=coupon.code
        )

    def perform_update(self, serializer):
        coupon = serializer.save()
        audit.record(
            "commerce.coupon_updated", actor=self.request.user, target=coupon, request=self.request, code=coupon.code
        )

    def perform_destroy(self, instance):
        if instance.redemptions.exists():
            raise ConflictError("This coupon has been used. Deactivate it instead.", code="coupon_in_use")
        audit.record(
            "commerce.coupon_deleted",
            actor=self.request.user,
            target=instance,
            request=self.request,
            code=instance.code,
        )
        instance.delete()

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        response.data = CouponSerializer(self.get_queryset().get(pk=response.data["id"])).data
        return response

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return Response(CouponSerializer(self.get_queryset().get(pk=kwargs["pk"])).data)


class AdminCouponCourseOptionsView(APIView):
    """Courses a coupon can be limited to. Coupon managers need this list without catalog permissions."""

    permission_classes = [HasPerm(MANAGE_COUPONS)]

    @extend_schema(responses=CouponCourseSerializer(many=True))
    def get(self, request):
        qs = Course.objects.exclude(status=Course.Status.ARCHIVED).order_by("title")
        return Response(CouponCourseSerializer(qs, many=True).data)


class AdminPaymentSettingsView(APIView):
    permission_classes = [HasPerm(MANAGE_SETTINGS)]

    @extend_schema(responses=AdminPaymentSettingsSerializer)
    def get(self, request):
        return Response(AdminPaymentSettingsSerializer(PaymentSettings.load()).data)

    @extend_schema(request=AdminPaymentSettingsSerializer, responses=AdminPaymentSettingsSerializer)
    def patch(self, request):
        current = PaymentSettings.load()
        s = AdminPaymentSettingsSerializer(current, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        obj = s.save(updated_by=request.user)
        audit.record(
            "commerce.settings_updated",
            actor=request.user,
            target=obj,
            request=request,
            fields=sorted(s.validated_data),
        )
        return Response(AdminPaymentSettingsSerializer(obj).data)


class AdminRevenueReportView(APIView):
    permission_classes = [HasPerm(VIEW_REVENUE)]

    @extend_schema(
        parameters=[
            OpenApiParameter("start", OpenApiTypes.DATE),
            OpenApiParameter("end", OpenApiTypes.DATE),
            OpenApiParameter("group", str, enum=["day", "month"]),
        ],
        responses=RevenueReportSerializer,
    )
    def get(self, request):
        start, end = _date_range(request.query_params)
        group = "month" if request.query_params.get("group") == "month" else "day"
        return Response(RevenueReportSerializer(reports.revenue(start, end, group)).data)
