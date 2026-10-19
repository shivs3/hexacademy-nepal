"""Staff enrollment endpoints under /api/v1/admin/learning/.

Visibility: `learning.view_learner_progress` / `learning.manage_enrollments`
see every enrollment; instructors and teaching assistants see the learners of
courses they are listed on. Granting, revoking and reinstating access needs
`learning.manage_enrollments`: teaching staff cannot hand out paid courses.
"""

from django.db.models import Count, IntegerField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import policies
from apps.catalog.models import Course, Lesson
from common.permissions import HasPerm

from . import services
from .admin_serializers import (
    AdminEnrollmentDetailSerializer,
    AdminEnrollmentSerializer,
    EnrollmentCourseOptionSerializer,
    GrantSerializer,
)
from .models import Enrollment, LessonProgress

MANAGE_ENROLLMENTS = "learning.manage_enrollments"
VIEW_PROGRESS = "learning.view_learner_progress"


def can_see_all(user) -> bool:
    return user.has_perm(VIEW_PROGRESS) or user.has_perm(MANAGE_ENROLLMENTS)


def visible_enrollments(user):
    qs = Enrollment.objects.all()
    if not can_see_all(user):
        qs = qs.filter(course_id__in=policies.taught_course_ids(user))
    return qs


def annotate_progress(qs):
    completed = (
        LessonProgress.objects.filter(enrollment=OuterRef("pk"), completed_at__isnull=False, lesson__is_published=True)
        .values("enrollment")
        .annotate(n=Count("pk"))
        .values("n")
    )
    lessons = (
        Lesson.objects.filter(course=OuterRef("course"), is_published=True)
        .values("course")
        .annotate(n=Count("pk"))
        .values("n")
    )
    return qs.select_related("user", "course", "granted_by").annotate(
        completed_count=Coalesce(Subquery(completed, output_field=IntegerField()), 0),
        lesson_total=Coalesce(Subquery(lessons, output_field=IntegerField()), 0),
    )


@extend_schema(
    parameters=[
        OpenApiParameter("course", int),
        OpenApiParameter("status", str, enum=[c for c, _ in Enrollment.Status.choices]),
        OpenApiParameter("search", str),
    ]
)
class AdminEnrollmentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [HasPerm("accounts.access_admin_panel")]
    filter_backends: list = []

    def get_serializer_class(self):
        return AdminEnrollmentDetailSerializer if self.action == "retrieve" else AdminEnrollmentSerializer

    def get_queryset(self):
        qs = annotate_progress(visible_enrollments(self.request.user))
        params = self.request.query_params
        if (course := params.get("course", "")).isdigit():
            qs = qs.filter(course_id=int(course))
        if (state := params.get("status")) in Enrollment.Status.values:
            qs = qs.filter(status=state)
        if search := params.get("search", "").strip()[:100]:
            qs = qs.filter(Q(user__full_name__icontains=search) | Q(user__email__icontains=search))
        if self.action == "retrieve":
            qs = qs.prefetch_related("progress")
        return qs.order_by("-enrolled_at", "-id")

    def _require_manage(self):
        if not self.request.user.has_perm(MANAGE_ENROLLMENTS):
            raise PermissionDenied("Managing enrollments needs the enrollment permission.")

    def _fresh(self, enrollment):
        return AdminEnrollmentSerializer(annotate_progress(Enrollment.objects.all()).get(pk=enrollment.pk)).data

    @extend_schema(request=GrantSerializer, responses={200: AdminEnrollmentSerializer, 201: AdminEnrollmentSerializer})
    def create(self, request):
        self._require_manage()
        serializer = GrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        enrollment, created = services.grant(data["email"], data["course"], actor=request.user, request=request)
        return Response(self._fresh(enrollment), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(request=None, responses=AdminEnrollmentSerializer)
    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        self._require_manage()
        enrollment = services.revoke(self.get_object(), actor=request.user, request=request)
        return Response(self._fresh(enrollment))

    @extend_schema(request=None, responses=AdminEnrollmentSerializer)
    @action(detail=True, methods=["post"])
    def reinstate(self, request, pk=None):
        self._require_manage()
        enrollment = self.get_object()
        enrollment, _ = services.grant(enrollment.user, enrollment.course, actor=request.user, request=request)
        return Response(self._fresh(enrollment))


class EnrollmentCourseOptionsView(APIView):
    """Courses for the enrollment filters and the grant form: every course that can have
    learners for enrollment staff, the courses they teach for teaching staff. Kept apart
    from the catalog admin list so support staff need no catalog access."""

    permission_classes = [HasPerm("accounts.access_admin_panel")]
    MAX_OPTIONS = 500

    @extend_schema(responses=EnrollmentCourseOptionSerializer(many=True))
    def get(self, request):
        qs = Course.objects.exclude(status=Course.Status.DRAFT)
        if not can_see_all(request.user):
            qs = qs.filter(pk__in=policies.taught_course_ids(request.user))
        qs = qs.order_by("title", "pk").only("pk", "title", "slug", "status")[: self.MAX_OPTIONS]
        return Response(EnrollmentCourseOptionSerializer(qs, many=True).data)
