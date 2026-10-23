"""Staff endpoints under /api/v1/admin/certificates/.

Templates and rules need ``certificates.manage_certificates``. Issued
certificates can be read with ``view_certificates`` too; revoking and
reinstating need ``manage_certificates``.
"""

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assessments.models import Exam
from apps.audit import services as audit
from apps.catalog.models import Course
from common.exceptions import ConflictError
from common.pagination import StandardPagination

from . import policies, services
from .models import Certificate, CertificateRule, CertificateTemplate
from .serializers import (
    AdminCertificateSerializer,
    CourseOptionSerializer,
    IssuedCountSerializer,
    RevokeSerializer,
    RuleSerializer,
    RuleWriteSerializer,
    TemplateSerializer,
)
from .views import pdf_response


def _panel(user) -> bool:
    return bool(user and user.is_authenticated and user.has_perm("accounts.access_admin_panel"))


class CanManageCertificates(BasePermission):
    def has_permission(self, request, view):
        return _panel(request.user) and policies.can_manage(request.user)


class CanViewCertificates(BasePermission):
    def has_permission(self, request, view):
        if not (_panel(request.user) and policies.can_view_all(request.user)):
            return False
        return request.method in ("GET", "HEAD", "OPTIONS") or policies.can_manage(request.user)


class AdminTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [CanManageCertificates]
    serializer_class = TemplateSerializer
    pagination_class = None
    filter_backends: list = []
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        return CertificateTemplate.objects.annotate(
            rule_count=Count("rules", distinct=True), certificate_count=Count("certificates", distinct=True)
        )

    def perform_create(self, serializer):
        obj = serializer.save()
        audit.record("certificates.template_created", target=obj, request=self.request)

    def perform_update(self, serializer):
        obj = serializer.save()
        audit.record("certificates.template_updated", target=obj, request=self.request)

    def perform_destroy(self, instance):
        if instance.rules.exists() or instance.certificates.exists():
            raise ConflictError(
                "This template is used by a course rule or an issued certificate.", code="template_in_use"
            )
        audit.record("certificates.template_deleted", target=instance, request=self.request)
        instance.delete()


class AdminRuleViewSet(viewsets.ModelViewSet):
    permission_classes = [CanManageCertificates]
    pagination_class = None
    filter_backends: list = []
    http_method_names = ["get", "post", "patch", "delete"]

    def get_serializer_class(self):
        return RuleWriteSerializer if self.action in ("create", "partial_update") else RuleSerializer

    def get_queryset(self):
        return CertificateRule.objects.select_related("course", "template", "required_exam").annotate(
            issued_count=Count("course__certificates", distinct=True)
        )

    def _out(self, rule, code=status.HTTP_200_OK):
        return Response(RuleSerializer(self.get_queryset().get(pk=rule.pk)).data, status=code)

    def _save(self, serializer, instance=None):
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        course = data.get("course", instance.course if instance else None)

        def current(key, default):
            return data[key] if key in data else (getattr(instance, key) if instance else default)

        services.validate_rule(
            course,
            required_exam=current("required_exam", None),
            is_enabled=current("is_enabled", False),
            require_lessons=current("require_lessons", True),
            require_assignments=current("require_assignments", False),
        )
        with transaction.atomic():
            rule = serializer.save(updated_by=self.request.user)
            audit.record(
                "certificates.rule_saved",
                target=rule,
                request=self.request,
                course=rule.course_id,
                enabled=rule.is_enabled,
                exam=rule.required_exam_id,
            )
        return rule

    @extend_schema(request=RuleWriteSerializer, responses={201: RuleSerializer})
    def create(self, request):
        return self._out(self._save(RuleWriteSerializer(data=request.data)), status.HTTP_201_CREATED)

    @extend_schema(request=RuleWriteSerializer, responses=RuleSerializer)
    def partial_update(self, request, pk=None):
        rule = self.get_object()
        data = {k: v for k, v in request.data.items() if k != "course"}
        return self._out(self._save(RuleWriteSerializer(rule, data=data, partial=True), rule))

    def perform_destroy(self, instance):
        audit.record("certificates.rule_deleted", target=instance, request=self.request, course=instance.course_id)
        instance.delete()

    @extend_schema(request=None, responses=IssuedCountSerializer)
    @action(detail=True, methods=["post"], url_path="issue-eligible")
    def issue_eligible(self, request, pk=None):
        rule = self.get_object()
        if not rule.is_enabled:
            raise ConflictError("Enable the rule first.", code="rule_disabled")
        return Response({"issued": services.issue_to_eligible(rule.course, actor=request.user, request=request)})


class CourseOptionsView(APIView):
    permission_classes = [CanManageCertificates]

    @extend_schema(responses=CourseOptionSerializer(many=True))
    def get(self, request):
        exams = Exam.objects.exclude(status=Exam.Status.DRAFT).filter(pass_marks__isnull=False).order_by("title")
        qs = (
            Course.objects.exclude(status=Course.Status.ARCHIVED)
            .annotate(has_rule=Exists(CertificateRule.objects.filter(course=OuterRef("pk"))))
            .prefetch_related(Prefetch("exams", queryset=exams))
            .order_by("title")
        )
        return Response(CourseOptionSerializer(qs, many=True).data)


@extend_schema(
    parameters=[
        OpenApiParameter("course", int),
        OpenApiParameter("status", str, enum=[c for c, _ in Certificate.Status.choices]),
        OpenApiParameter("search", str),
    ]
)
class AdminCertificateViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [CanViewCertificates]
    serializer_class = AdminCertificateSerializer
    pagination_class = StandardPagination
    filter_backends: list = []

    def get_queryset(self):
        qs = Certificate.objects.select_related("user", "course", "template", "revoked_by")
        params = self.request.query_params
        if (course := params.get("course", "")).isdigit():
            qs = qs.filter(course_id=int(course))
        if (state := params.get("status")) in Certificate.Status.values:
            qs = qs.filter(status=state)
        if search := params.get("search", "").strip()[:100]:
            qs = qs.filter(
                Q(number__icontains=search)
                | Q(recipient_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(course_title__icontains=search)
            )
        return qs.order_by("-issued_at", "-id")

    @extend_schema(request=RevokeSerializer, responses=AdminCertificateSerializer)
    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        serializer = RevokeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cert = services.revoke(
            self.get_object(), reason=serializer.validated_data["reason"], actor=request.user, request=request
        )
        return Response(AdminCertificateSerializer(self.get_queryset().get(pk=cert.pk)).data)

    @extend_schema(request=None, responses=AdminCertificateSerializer)
    @action(detail=True, methods=["post"])
    def reinstate(self, request, pk=None):
        cert = services.reinstate(self.get_object(), actor=request.user, request=request)
        return Response(AdminCertificateSerializer(self.get_queryset().get(pk=cert.pk)).data)

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        return pdf_response(self.get_object())
