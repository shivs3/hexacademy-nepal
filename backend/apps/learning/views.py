"""Learner endpoints: my enrollments, the course player and lesson progress.

Lesson content is only serialised after `services.lesson_access` allows it;
denials carry a machine-readable reason so the player can show the right
message (enroll, finish the previous lesson, or unavailable).
"""

from django.db.models import F, Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import policies, resources
from apps.catalog.models import Course, Lesson, LessonResource
from apps.catalog.services import ordered_lessons
from common.exceptions import DomainError

from . import services
from .models import Enrollment
from .serializers import (
    LessonViewSerializer,
    MyEnrollmentSerializer,
    PlayerOutlineSerializer,
    ProgressInputSerializer,
    ProgressResultSerializer,
)

DENIALS = {
    "not_enrolled": (403, "Enroll in this course to open this lesson."),
    "locked": (403, "Complete the previous lessons first."),
    "unavailable": (404, "This lesson is not available."),
}


def _deny(access: services.LessonAccess):
    status_code, message = DENIALS[access.reason]
    raise DomainError(message, code=access.reason, status_code=status_code)


def _lesson_or_404(pk) -> Lesson:
    return get_object_or_404(Lesson.objects.select_related("course", "module"), pk=pk)


def _accessible_lesson(request, pk) -> tuple[Lesson, services.LessonAccess]:
    lesson = _lesson_or_404(pk)
    access = services.lesson_access(request.user, lesson)
    if not access.allowed:
        _deny(access)
    return lesson, access


class MyEnrollmentsView(generics.ListAPIView):
    serializer_class = MyEnrollmentSerializer
    filter_backends: list = []

    def get_queryset(self):
        return (
            Enrollment.objects.filter(user=self.request.user, status=Enrollment.Status.ACTIVE)
            .exclude(course__status=Course.Status.DRAFT)
            .select_related("course__thumbnail")
            .order_by(F("last_accessed_at").desc(nulls_last=True), "-enrolled_at")
        )


class EnrollView(APIView):
    """Self-enrollment in a published free course. Paid courses are 402."""

    @extend_schema(request=None, responses={200: MyEnrollmentSerializer, 201: MyEnrollmentSerializer})
    def post(self, request, slug):
        course = get_object_or_404(Course.objects.exclude(status=Course.Status.DRAFT), slug=slug)
        enrollment, created = services.enroll_free(request.user, course, request=request)
        return Response(
            MyEnrollmentSerializer(enrollment).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class PlayerOutlineView(APIView):
    """Course outline for the player: modules, lessons, completion and locks."""

    @extend_schema(responses=PlayerOutlineSerializer)
    def get(self, request, slug):
        course = get_object_or_404(Course.objects.select_related("thumbnail"), slug=slug)
        staff = policies.can_view_admin(request.user, course)
        enrollment = services.active_enrollment(request.user, course)
        if not staff and (enrollment is None or course.status == Course.Status.DRAFT):
            # Not revealing drafts; published courses point the visitor to enroll.
            if course.status == Course.Status.DRAFT:
                raise DomainError("Course not found.", code="not_found", status_code=404)
            raise DomainError("Enroll in this course to open the player.", code="not_enrolled", status_code=403)

        lesson_qs = Lesson.objects.all() if staff else Lesson.objects.filter(is_published=True)
        modules = course.modules.prefetch_related(Prefetch("lessons", queryset=lesson_qs.order_by("position", "id")))
        published = list(ordered_lessons(course))
        completed = services.completed_lesson_ids(enrollment)
        locked = set() if staff else services.locked_lesson_ids(course, published, completed)
        outline = [
            {
                "id": module.pk,
                "title": module.title,
                "lessons": [
                    {
                        "id": lesson.pk,
                        "title": lesson.title,
                        "duration_minutes": lesson.duration_minutes,
                        "is_preview": lesson.is_preview,
                        "is_published": lesson.is_published,
                        "completed": lesson.pk in completed,
                        "locked": lesson.pk in locked,
                    }
                    for lesson in module.lessons.all()
                ],
            }
            for module in modules
        ]
        payload = {
            "course": course,
            "sequential": course.sequential,
            "staff_preview": staff and enrollment is None,
            "enrollment_id": enrollment.pk if enrollment else None,
            "progress": services.progress_summary(enrollment) if enrollment else None,
            "modules": [m for m in outline if m["lessons"]] if not staff else outline,
        }
        return Response(PlayerOutlineSerializer(payload).data)


class LessonView(APIView):
    permission_classes = [AllowAny]  # free previews are open; lesson_access decides

    @extend_schema(responses=LessonViewSerializer)
    def get(self, request, pk):
        lesson, access = _accessible_lesson(request, pk)
        lesson = (
            Lesson.objects.select_related("course__thumbnail", "module").prefetch_related("resources").get(pk=lesson.pk)
        )
        published_only = not access.staff_preview
        ids = [item.pk for item in ordered_lessons(lesson.course, published_only=published_only)]
        index = ids.index(lesson.pk) if lesson.pk in ids else -1
        completed = lesson.pk in services.completed_lesson_ids(access.enrollment)
        payload = {
            "lesson": lesson,
            "completed": completed,
            "previous_lesson_id": ids[index - 1] if index > 0 else None,
            "next_lesson_id": ids[index + 1] if 0 <= index < len(ids) - 1 else None,
            "staff_preview": access.staff_preview,
            "enrolled": access.enrollment is not None,
        }
        return Response(LessonViewSerializer(payload).data)


class LessonProgressView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ProgressInputSerializer, responses=ProgressResultSerializer)
    def post(self, request, pk):
        lesson, access = _accessible_lesson(request, pk)
        if access.enrollment is None:
            raise DomainError("Progress is recorded for enrolled learners only.", code="not_enrolled", status_code=403)
        if not lesson.is_published:
            raise DomainError("This lesson is not published yet.", code="unavailable", status_code=409)
        serializer = ProgressInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        progress = services.record_progress(access.enrollment, lesson, completed=serializer.validated_data["completed"])
        enrollment = Enrollment.objects.get(pk=access.enrollment.pk)
        return Response(
            ProgressResultSerializer(
                {
                    "completed": progress.completed_at is not None,
                    "course_completed": enrollment.completed_at is not None,
                    "progress": services.progress_summary(enrollment),
                }
            ).data
        )


class LessonResourceDownloadView(APIView):
    permission_classes = [AllowAny]  # preview lessons' files are open; lesson_access decides

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    def get(self, request, pk, resource_id):
        lesson, _ = _accessible_lesson(request, pk)
        resource = get_object_or_404(LessonResource, pk=resource_id, lesson=lesson)
        if resource.kind != LessonResource.Kind.FILE:
            raise ValidationError("This resource is a link, not a file.")
        return resources.file_response(resource)
