"""Staff endpoints under /api/v1/admin/live-classes/.

Every object is reached through `policies.visible_batches`, so staff only see
batches of courses they may view; each write then asks the matching policy
(`can_schedule` or `can_take_attendance`) for that batch's course.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, Min, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import CourseInstructor
from apps.learning.models import Enrollment

from . import policies, services
from .admin_serializers import (
    AddMembersResultSerializer,
    AddMembersSerializer,
    AdminSessionSerializer,
    AttendanceSummarySerializer,
    AttendanceUpdateSerializer,
    BatchSerializer,
    BatchWriteSerializer,
    CancelSerializer,
    ClassTeamMemberSerializer,
    MemberSerializer,
    RosterRowSerializer,
    ScheduleCourseOptionSerializer,
    SessionCreateSerializer,
    SessionUpdateSerializer,
)
from .models import AttendanceRecord, Batch, BatchMembership, ClassSession

User = get_user_model()


class CanUseLiveClasses(BasePermission):
    """Admin-panel users who hold any live-class permission."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.has_perm("accounts.access_admin_panel")):
            return False
        return any(user.has_perm(p) for p in (policies.MANAGE_ALL, policies.VIEW_ALL, policies.TEACH))


def _require(allowed: bool, message: str):
    if not allowed:
        raise PermissionDenied(message)


def annotate_batches(qs):
    now = timezone.now()
    upcoming = Q(sessions__status=ClassSession.Status.SCHEDULED, sessions__ends_at__gte=now)
    return (
        qs.select_related("course")
        .prefetch_related("course__instructor_links")
        .annotate(
            member_count=Count("memberships", distinct=True),
            upcoming_count=Count("sessions", filter=upcoming, distinct=True),
            next_session_at=Min("sessions__starts_at", filter=upcoming),
        )
    )


@extend_schema(
    parameters=[
        OpenApiParameter("course", int),
        OpenApiParameter("status", str, enum=[c for c, _ in Batch.Status.choices]),
        OpenApiParameter("search", str),
    ]
)
class AdminBatchViewSet(viewsets.ModelViewSet):
    permission_classes = [CanUseLiveClasses]
    filter_backends: list = []
    http_method_names = ["get", "post", "patch", "delete"]

    def get_serializer_class(self):
        return BatchWriteSerializer if self.action in ("create", "partial_update") else BatchSerializer

    def get_queryset(self):
        qs = annotate_batches(policies.visible_batches(self.request.user))
        params = self.request.query_params
        if (course := params.get("course", "")).isdigit():
            qs = qs.filter(course_id=int(course))
        if (state := params.get("status")) in Batch.Status.values:
            qs = qs.filter(status=state)
        if search := params.get("search", "").strip()[:100]:
            qs = qs.filter(Q(name__icontains=search) | Q(course__title__icontains=search))
        return qs.order_by("-created_at", "-id")

    def _out(self, batch, code=status.HTTP_200_OK):
        fresh = annotate_batches(Batch.objects.all()).get(pk=batch.pk)
        return Response(BatchSerializer(fresh, context=self.get_serializer_context()).data, status=code)

    @extend_schema(request=BatchWriteSerializer, responses={201: BatchSerializer})
    def create(self, request):
        serializer = BatchWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        course = data.pop("course")
        _require(policies.can_schedule(request.user, course), "Only this course's instructors can create batches.")
        batch = services.create_batch(course, actor=request.user, request=request, **data)
        return self._out(batch, status.HTTP_201_CREATED)

    @extend_schema(request=BatchWriteSerializer, responses=BatchSerializer)
    def partial_update(self, request, pk=None):
        batch = self.get_object()
        _require(policies.can_schedule(request.user, batch.course), "Only this course's instructors can edit it.")
        serializer = BatchWriteSerializer(batch, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        data.pop("course", None)
        batch = services.update_batch(batch, actor=request.user, request=request, **data)
        return self._out(batch)

    def destroy(self, request, pk=None):
        batch = self.get_object()
        _require(policies.can_schedule(request.user, batch.course), "Only this course's instructors can delete it.")
        services.delete_batch(batch, actor=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --- Members -----------------------------------------------------------------

    @extend_schema(parameters=[OpenApiParameter("search", str)], responses=MemberSerializer(many=True))
    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        batch = self.get_object()
        enrolled = Enrollment.objects.filter(
            user=OuterRef("user"), course_id=batch.course_id, status=Enrollment.Status.ACTIVE
        )
        qs = batch.memberships.select_related("user").annotate(enrolled=Exists(enrolled))
        if search := request.query_params.get("search", "").strip()[:100]:
            qs = qs.filter(Q(user__full_name__icontains=search) | Q(user__email__icontains=search))
        page = self.paginate_queryset(qs.order_by("user__full_name", "user__email"))
        return self.get_paginated_response(MemberSerializer(page, many=True).data)

    @extend_schema(request=AddMembersSerializer, responses=AddMembersResultSerializer)
    @members.mapping.post
    def add_members(self, request, pk=None):
        batch = self.get_object()
        _require(policies.can_schedule(request.user, batch.course), "Only this course's instructors manage members.")
        serializer = AddMembersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        unknown: list[str] = []
        if data["all_enrolled"]:
            result = services.add_all_enrolled(batch, actor=request.user, request=request)
        else:
            emails = list(dict.fromkeys(e.strip().lower() for e in data["emails"]))
            users = list(User.objects.filter(email__in=emails))
            found = {u.email.lower() for u in users}
            unknown = [e for e in emails if e not in found]
            result = services.add_members(batch, users, actor=request.user, request=request)
        emails_by_id = dict(User.objects.filter(pk__in=result.not_enrolled).values_list("pk", "email"))
        return Response(
            AddMembersResultSerializer(
                {
                    "added": len(result.added),
                    "already_members": len(result.already_members),
                    "not_enrolled": [emails_by_id[i] for i in result.not_enrolled],
                    "unknown": unknown,
                }
            ).data
        )

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"members/(?P<membership_id>\d+)")
    def remove_member(self, request, pk=None, membership_id=None):
        batch = self.get_object()
        _require(policies.can_schedule(request.user, batch.course), "Only this course's instructors manage members.")
        membership = get_object_or_404(BatchMembership, pk=membership_id, batch=batch)
        services.remove_member(membership, actor=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses=ClassTeamMemberSerializer(many=True))
    @action(detail=True, methods=["get"])
    def team(self, request, pk=None):
        """The course's teaching team: who can be assigned to a session."""
        batch = self.get_object()
        links = CourseInstructor.objects.filter(course_id=batch.course_id, user__is_active=True).select_related("user")
        return Response(ClassTeamMemberSerializer(links.order_by("user__full_name"), many=True).data)


@extend_schema(
    parameters=[
        OpenApiParameter("batch", int),
        OpenApiParameter("course", int),
        OpenApiParameter("scope", str, enum=["upcoming", "past", "all"], description="Default: upcoming."),
        OpenApiParameter("status", str, enum=[c for c, _ in ClassSession.Status.choices]),
    ]
)
class AdminSessionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [CanUseLiveClasses]
    filter_backends: list = []
    serializer_class = AdminSessionSerializer

    def get_queryset(self):
        qs = (
            ClassSession.objects.filter(batch__in=policies.visible_batches(self.request.user))
            .select_related("batch__course", "instructor")
            .prefetch_related("batch__course__instructor_links")
        )
        params = self.request.query_params
        if (batch := params.get("batch", "")).isdigit():
            qs = qs.filter(batch_id=int(batch))
        if (course := params.get("course", "")).isdigit():
            qs = qs.filter(batch__course_id=int(course))
        if (state := params.get("status")) in ClassSession.Status.values:
            qs = qs.filter(status=state)
        now, scope = timezone.now(), params.get("scope", "upcoming")
        if self.action == "list" and scope == "past":
            return qs.filter(ends_at__lt=now).order_by("-starts_at", "-id")
        if self.action == "list" and scope != "all":
            qs = qs.filter(ends_at__gte=now)
        return qs.order_by("starts_at", "id")

    def _out(self, session, code=status.HTTP_200_OK):
        return Response(AdminSessionSerializer(session, context=self.get_serializer_context()).data, status=code)

    @extend_schema(request=SessionCreateSerializer, responses={201: AdminSessionSerializer(many=True)})
    def create(self, request):
        serializer = SessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        batch = data.pop("batch")
        _require(
            policies.can_schedule(request.user, batch.course), "Only this course's instructors can schedule classes."
        )
        sessions = services.schedule(batch, actor=request.user, request=request, **data)
        fresh = ClassSession.objects.filter(pk__in=[s.pk for s in sessions]).select_related(
            "batch__course", "instructor"
        )
        context = self.get_serializer_context()
        return Response(
            AdminSessionSerializer(fresh.order_by("starts_at"), many=True, context=context).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=SessionUpdateSerializer, responses=AdminSessionSerializer)
    def partial_update(self, request, pk=None):
        session = self.get_object()
        _require(policies.can_schedule(request.user, session.batch.course), "Only this course's instructors can edit.")
        serializer = SessionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = services.update_session(session, actor=request.user, request=request, **serializer.validated_data)
        return self._out(ClassSession.objects.select_related("batch__course", "instructor").get(pk=session.pk))

    @extend_schema(request=CancelSerializer, responses=AdminSessionSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        session = self.get_object()
        _require(
            policies.can_schedule(request.user, session.batch.course), "Only this course's instructors can cancel."
        )
        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = services.cancel_session(
            session, reason=serializer.validated_data["reason"], actor=request.user, request=request
        )
        return self._out(session)

    @extend_schema(responses=RosterRowSerializer(many=True))
    @action(detail=True, methods=["get"])
    def attendance(self, request, pk=None):
        session = self.get_object()
        _require(policies.can_take_attendance(request.user, session.batch.course), "Only the teaching team sees this.")
        return Response(RosterRowSerializer(services.roster(session), many=True).data)

    @extend_schema(request=AttendanceUpdateSerializer, responses=RosterRowSerializer(many=True))
    @attendance.mapping.put
    def set_attendance(self, request, pk=None):
        session = self.get_object()
        _require(policies.can_take_attendance(request.user, session.batch.course), "Only the teaching team marks it.")
        serializer = AttendanceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.set_attendance(session, serializer.validated_data["entries"], actor=request.user, request=request)
        return Response(RosterRowSerializer(services.roster(session), many=True).data)

    @extend_schema(responses=AttendanceSummarySerializer)
    @action(detail=True, methods=["get"], url_path="attendance-summary")
    def attendance_summary(self, request, pk=None):
        session = self.get_object()
        counts = AttendanceRecord.objects.filter(session=session).aggregate(
            **{s: Count("pk", filter=Q(status=s)) for s in AttendanceRecord.Status.values},
            joined=Count("pk", filter=Q(joined_at__isnull=False)),
        )
        return Response(AttendanceSummarySerializer(counts).data)


class ScheduleCourseOptionsView(APIView):
    """Courses the user can create batches for."""

    permission_classes = [CanUseLiveClasses]

    @extend_schema(responses=ScheduleCourseOptionSerializer(many=True))
    def get(self, request):
        courses = policies.schedulable_courses(request.user).order_by("title")
        return Response(ScheduleCourseOptionSerializer(courses, many=True).data)
