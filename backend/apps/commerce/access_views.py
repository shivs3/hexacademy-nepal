"""Access requests (the checkout form) and staff control of what each learner can use.

Learner:
  GET  /checkout/item/?course=<slug> | ?exam=<slug>   price, instructions, pending request
  POST /access-requests/                              send the form
  GET  /me/access-requests/                           my requests
  POST /me/access-requests/<number>/cancel/

Staff (`learning.manage_enrollments` or `commerce.manage_orders`):
  GET  /admin/commerce/requests/                      ?status= &kind= &search=
  POST /admin/commerce/requests/<id>/approve/         grants the course or exam
  POST /admin/commerce/requests/<id>/reject/          note required

Staff (`learning.manage_enrollments`):
  GET  /admin/users/<id>/access/                      courses, exams, batches, requests
  POST /admin/users/<id>/exam-access/                 {exam}
  POST /admin/exam-access/<id>/revoke/
  GET  /admin/access/options/                         what can be granted

Course enrollments themselves are granted and revoked through the existing
/admin/learning/enrollments/ endpoints, and batches through
/admin/live-classes/batches/<id>/members/.
"""

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.assessments import access as exam_access
from apps.assessments.models import Exam, ExamAccess
from apps.catalog.models import Course
from apps.cms import sanitize
from apps.learning.models import Enrollment
from apps.live_classes.models import Batch, BatchMembership
from common.exceptions import DomainError
from common.permissions import HasPerm

from . import access_requests
from .access_serializers import (
    AccessExamSerializer,
    AccessOptionsSerializer,
    AccessRequestInputSerializer,
    AdminAccessRequestSerializer,
    CheckoutItemSerializer,
    DecisionSerializer,
    GrantExamSerializer,
    MyAccessRequestSerializer,
    UserAccessSerializer,
)
from .models import AccessRequest, PaymentSettings

MANAGE_ENROLLMENTS = "learning.manage_enrollments"
HANDLE_REQUESTS = HasPerm(MANAGE_ENROLLMENTS, "commerce.manage_orders", any_of=True)


def _instructions() -> str:
    return sanitize.clean_rich_text(PaymentSettings.load().request_instructions)


# --- Learner -------------------------------------------------------------------------


@extend_schema(
    parameters=[OpenApiParameter("course", str), OpenApiParameter("exam", str)],
    responses=CheckoutItemSerializer,
)
class CheckoutItemView(APIView):
    def get(self, request):
        course_slug, exam_slug = request.query_params.get("course"), request.query_params.get("exam")
        pending = AccessRequest.objects.filter(user=request.user, status=AccessRequest.Status.PENDING)
        if course_slug:
            course = get_object_or_404(Course.objects.filter(status=Course.Status.PUBLISHED), slug=course_slug)
            item = {"kind": "course", "slug": course.slug, "title": course.title, "price": course.current_price()}
            pending = pending.filter(course=course)
        elif exam_slug:
            exam = get_object_or_404(
                Exam.objects.filter(status=Exam.Status.PUBLISHED, course__isnull=True), slug=exam_slug
            )
            item = {"kind": "exam", "slug": exam.slug, "title": exam.title, "price": exam.price}
            pending = pending.filter(exam=exam)
        else:
            raise DomainError("Choose a course or an exam.")
        item["pending_request"] = pending.first()
        item["instructions"] = _instructions()
        return Response(CheckoutItemSerializer(item).data)


class AccessRequestCreateView(APIView):
    throttle_classes = [UserRateThrottle, ScopedRateThrottle]
    throttle_scope = "access_request"

    @extend_schema(request=AccessRequestInputSerializer, responses={201: MyAccessRequestSerializer})
    def post(self, request):
        data = AccessRequestInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        req = access_requests.create(request.user, request=request, **data.validated_data)
        return Response(MyAccessRequestSerializer(req).data, status=status.HTTP_201_CREATED)


class MyAccessRequestsView(generics.ListAPIView):
    serializer_class = MyAccessRequestSerializer
    filter_backends: list = []

    def get_queryset(self):
        return AccessRequest.objects.filter(user=self.request.user).select_related("course", "exam")


class MyAccessRequestCancelView(APIView):
    @extend_schema(request=None, responses=MyAccessRequestSerializer)
    def post(self, request, number):
        req = get_object_or_404(AccessRequest, number=number, user=request.user)
        req = access_requests.cancel(req, actor=request.user, request=request)
        return Response(MyAccessRequestSerializer(req).data)


# --- Staff: requests -----------------------------------------------------------------


@extend_schema(
    parameters=[
        OpenApiParameter("status", str, enum=[c for c, _ in AccessRequest.Status.choices]),
        OpenApiParameter("kind", str, enum=[c for c, _ in AccessRequest.Kind.choices]),
        OpenApiParameter("search", str),
        OpenApiParameter("user", int),
    ]
)
class AdminAccessRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [HANDLE_REQUESTS]
    serializer_class = AdminAccessRequestSerializer
    filter_backends: list = []

    def get_queryset(self):
        qs = AccessRequest.objects.select_related("user", "handled_by")
        params = self.request.query_params
        if (value := params.get("status")) in AccessRequest.Status.values:
            qs = qs.filter(status=value)
        if (value := params.get("kind")) in AccessRequest.Kind.values:
            qs = qs.filter(kind=value)
        if (value := params.get("user", "")).isdigit():
            qs = qs.filter(user_id=int(value))
        if value := params.get("search", "").strip()[:100]:
            qs = qs.filter(
                Q(number__icontains=value)
                | Q(item_title__icontains=value)
                | Q(full_name__icontains=value)
                | Q(phone__icontains=value)
                | Q(user__email__icontains=value)
                | Q(payment_reference__icontains=value)
            )
        return qs

    @extend_schema(request=DecisionSerializer, responses=AdminAccessRequestSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        req = access_requests.approve(self.get_object(), actor=request.user, request=request, **data.validated_data)
        return Response(AdminAccessRequestSerializer(req).data)

    @extend_schema(request=DecisionSerializer, responses=AdminAccessRequestSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        req = access_requests.reject(self.get_object(), actor=request.user, request=request, **data.validated_data)
        return Response(AdminAccessRequestSerializer(req).data)


# --- Staff: one learner's access -----------------------------------------------------


def _target_user(pk):
    return get_object_or_404(get_user_model(), pk=pk)


class AdminUserAccessView(APIView):
    permission_classes = [HasPerm(MANAGE_ENROLLMENTS)]

    @extend_schema(responses=UserAccessSerializer)
    def get(self, request, pk):
        user = _target_user(pk)
        payload = {
            "user": user,
            "enrollments": Enrollment.objects.filter(user=user).select_related("course", "granted_by"),
            "exam_access": ExamAccess.objects.filter(user=user).select_related("exam", "granted_by"),
            "batches": BatchMembership.objects.filter(user=user).select_related("batch", "batch__course"),
            "requests": AccessRequest.objects.filter(user=user).select_related("user", "handled_by")[:50],
        }
        return Response(UserAccessSerializer(payload).data)


class AdminUserExamAccessView(APIView):
    permission_classes = [HasPerm(MANAGE_ENROLLMENTS)]

    @extend_schema(request=GrantExamSerializer, responses={200: AccessExamSerializer, 201: AccessExamSerializer})
    def post(self, request, pk):
        user = _target_user(pk)
        if not user.is_active:
            raise DomainError("This account is deactivated.")
        data = GrantExamSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        access, changed = exam_access.grant(user, data.validated_data["exam"], actor=request.user, request=request)
        return Response(AccessExamSerializer(access).data, status=status.HTTP_201_CREATED if changed else 200)


class AdminExamAccessRevokeView(APIView):
    permission_classes = [HasPerm(MANAGE_ENROLLMENTS)]

    @extend_schema(request=None, responses=AccessExamSerializer)
    def post(self, request, pk):
        access = exam_access.revoke(get_object_or_404(ExamAccess, pk=pk), actor=request.user, request=request)
        return Response(AccessExamSerializer(access).data)


class AdminAccessOptionsView(APIView):
    permission_classes = [HasPerm(MANAGE_ENROLLMENTS)]

    @extend_schema(responses=AccessOptionsSerializer)
    def get(self, request):
        courses = Course.objects.exclude(status=Course.Status.DRAFT).order_by("title")
        exams = Exam.objects.filter(status=Exam.Status.PUBLISHED, course__isnull=True).order_by("title")
        batches = Batch.objects.filter(status=Batch.Status.ACTIVE).select_related("course").order_by("name")
        payload = {
            "courses": [
                {"id": c.pk, "title": c.title, "price": c.current_price(), "detail": c.get_status_display()}
                for c in courses
            ],
            "exams": [{"id": e.pk, "title": e.title, "price": e.price, "detail": e.get_kind_display()} for e in exams],
            "batches": [{"id": b.pk, "title": b.name, "price": 0, "detail": b.course.title} for b in batches],
        }
        return Response(AccessOptionsSerializer(payload).data)
