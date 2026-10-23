"""Learner endpoints: my class sessions, one session, and the join gate.

Lists and details never contain the meeting link or passcode. They are
returned only by POST .../join/, after `services.join` has checked
membership, enrollment, status and the join window on the server.
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.learning.models import Enrollment

from . import services
from .models import AttendanceRecord, ClassSession
from .serializers import JoinSerializer, LearnerSessionSerializer


def my_sessions(user):
    """Sessions of batches the user belongs to, while enrolled in the course."""
    return ClassSession.objects.filter(
        batch__memberships__user=user,
        batch__course__enrollments__user=user,
        batch__course__enrollments__status=Enrollment.Status.ACTIVE,
    ).select_related("batch__course", "instructor")


def attendance_context(user, sessions) -> dict:
    ids = [s.pk for s in sessions]
    return {"my_attendance": {r.session_id: r for r in AttendanceRecord.objects.filter(user=user, session_id__in=ids)}}


@extend_schema(
    parameters=[
        OpenApiParameter("scope", str, enum=["upcoming", "past"], description="Default: upcoming."),
        OpenApiParameter("course", int),
    ]
)
class MySessionsView(generics.ListAPIView):
    """Upcoming (including live) sessions soonest first, or past sessions latest first."""

    serializer_class = LearnerSessionSerializer
    filter_backends: list = []

    def get_queryset(self):
        now = timezone.now()
        qs = my_sessions(self.request.user)
        if (course := self.request.query_params.get("course", "")).isdigit():
            qs = qs.filter(batch__course_id=int(course))
        if self.request.query_params.get("scope") == "past":
            return qs.filter(Q(ends_at__lt=now)).order_by("-starts_at", "-id")
        return qs.filter(ends_at__gte=now).order_by("starts_at", "id")

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        context = {**self.get_serializer_context(), **attendance_context(request.user, page)}
        return self.get_paginated_response(LearnerSessionSerializer(page, many=True, context=context).data)


class SessionDetailView(APIView):
    @extend_schema(responses=LearnerSessionSerializer)
    def get(self, request, pk):
        session = get_object_or_404(my_sessions(request.user), pk=pk)
        context = attendance_context(request.user, [session])
        return Response(LearnerSessionSerializer(session, context=context).data)


class JoinView(APIView):
    """POST, not GET: joining records the learner's first join time."""

    @extend_schema(request=None, responses=JoinSerializer)
    def post(self, request, pk):
        session = get_object_or_404(ClassSession.objects.select_related("batch__course"), pk=pk)
        session = services.join(session, request.user, request=request)
        return Response(
            JoinSerializer(
                {"provider": session.provider, "join_url": session.join_url, "passcode": session.passcode}
            ).data
        )
