"""Assignment endpoints.

Learners: /api/v1/me/assignments/, /api/v1/assignments/{id}/[submission/[file/]].
Staff: /api/v1/admin/learning/assignments/ and /admin/learning/submissions/.
Every object is reached through a policy-filtered queryset (see
assignment_policies), so an id from another course or learner is a 404.
"""

from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import policies as catalog
from apps.catalog import resources
from apps.catalog.models import Course, CourseInstructor, Lesson
from common.pagination import StandardPagination

from . import assignment_policies as policies
from . import assignment_services as services
from .assignment_serializers import (
    AdminAssignmentSerializer,
    AdminSubmissionSerializer,
    AssignmentCourseOptionSerializer,
    AssignmentWriteSerializer,
    GradeSerializer,
    LearnerAssignmentDetailSerializer,
    LearnerAssignmentSerializer,
    MySubmissionSerializer,
    SubmitSerializer,
)
from .models import Assignment, Submission


def _require(allowed: bool, message: str):
    if not allowed:
        raise PermissionDenied(message)


# --- Learner ---------------------------------------------------------------------


def _with_mine(qs, user):
    return qs.select_related("course", "lesson").prefetch_related(
        Prefetch("submissions", queryset=Submission.objects.filter(user=user), to_attr="mine")
    )


def _attach(assignment):
    assignment.my_submission = assignment.mine[0] if assignment.mine else None
    return assignment


@extend_schema(
    parameters=[
        OpenApiParameter("course", str, description="Course slug."),
        OpenApiParameter("status", str, enum=["todo", "submitted", "graded"]),
    ]
)
class MyAssignmentsView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LearnerAssignmentSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Assignment.objects.none()
        user = self.request.user
        qs = policies.learner_assignments(user)
        params = self.request.query_params
        if course := params.get("course", "").strip()[:200]:
            qs = qs.filter(course__slug=course)
        mine = Submission.objects.filter(assignment=OuterRef("pk"), user=user)
        state = params.get("status")
        if state == "todo":
            qs = qs.exclude(Exists(mine.exclude(status=Submission.Status.RETURNED)))
        elif state in (Submission.Status.SUBMITTED, Submission.Status.GRADED):
            qs = qs.filter(Exists(mine.filter(status=state)))
        return _with_mine(qs, user)

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        data = self.get_serializer([_attach(a) for a in page], many=True).data
        return self.get_paginated_response(data)


def _learner_assignment(request, pk) -> Assignment:
    return _attach(get_object_or_404(_with_mine(policies.learner_assignments(request.user), request.user), pk=pk))


class AssignmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=LearnerAssignmentDetailSerializer)
    def get(self, request, pk):
        return Response(LearnerAssignmentDetailSerializer(_learner_assignment(request, pk)).data)


class SubmissionView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(request={"multipart/form-data": SubmitSerializer}, responses=MySubmissionSerializer)
    def post(self, request, pk):
        assignment = _learner_assignment(request, pk)
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sub = services.submit(
            assignment,
            request.user,
            text=data["text"],
            uploaded=data["file"],
            remove_file=data["remove_file"],
            request=request,
        )
        return Response(MySubmissionSerializer(sub).data, status=status.HTTP_200_OK)


class SubmissionFileView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    def get(self, request, pk):
        assignment = _learner_assignment(request, pk)
        sub = assignment.my_submission
        if not sub or not sub.file:
            return Response({"error": {"code": "not_found", "message": "No file.", "details": None}}, status=404)
        return resources.file_response(sub)


# --- Staff -----------------------------------------------------------------------


class CanUseAssignments(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.has_perm("accounts.access_admin_panel"))


def annotate_counts(qs):
    return qs.select_related("course", "lesson").annotate(
        submitted_count=Count("submissions", filter=Q(submissions__status=Submission.Status.SUBMITTED)),
        graded_count=Count("submissions", filter=Q(submissions__status=Submission.Status.GRADED)),
        returned_count=Count("submissions", filter=Q(submissions__status=Submission.Status.RETURNED)),
    )


@extend_schema(
    parameters=[
        OpenApiParameter("course", int),
        OpenApiParameter("search", str),
        OpenApiParameter("needs_grading", bool, description="Only assignments with ungraded submissions."),
    ]
)
class AdminAssignmentViewSet(viewsets.ModelViewSet):
    permission_classes = [CanUseAssignments]
    serializer_class = AdminAssignmentSerializer
    filter_backends: list = []
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        qs = annotate_counts(policies.staff_assignments(self.request.user))
        params = self.request.query_params
        if (course := params.get("course", "")).isdigit():
            qs = qs.filter(course_id=int(course))
        if search := params.get("search", "").strip()[:100]:
            qs = qs.filter(Q(title__icontains=search) | Q(course__title__icontains=search))
        if params.get("needs_grading") == "true":
            qs = qs.filter(submitted_count__gt=0)
        return qs.order_by("course__title", "due_at", "id")

    def _out(self, assignment, code=status.HTTP_200_OK):
        fresh = annotate_counts(Assignment.objects.filter(pk=assignment.pk)).get()
        return Response(self.get_serializer(fresh).data, status=code)

    @extend_schema(request=AssignmentWriteSerializer, responses={201: AdminAssignmentSerializer})
    def create(self, request):
        serializer = AssignmentWriteSerializer(data=request.data, context={"creating": True})
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        course = data.pop("course")
        _require(policies.can_author(request.user, course), "You cannot add assignments to this course.")
        assignment = services.create_assignment(course, actor=request.user, request=request, **data)
        return self._out(assignment, status.HTTP_201_CREATED)

    @extend_schema(request=AssignmentWriteSerializer, responses=AdminAssignmentSerializer)
    def partial_update(self, request, pk=None):
        assignment = self.get_object()
        _require(policies.can_author(request.user, assignment.course), "You cannot edit this assignment.")
        serializer = AssignmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = services.update_assignment(
            assignment, actor=request.user, request=request, **serializer.validated_data
        )
        return self._out(assignment)

    def update(self, request, *args, **kwargs):  # PUT is not offered
        return self.http_method_not_allowed(request)

    def destroy(self, request, pk=None):
        assignment = self.get_object()
        _require(policies.can_author(request.user, assignment.course), "You cannot delete this assignment.")
        services.delete_assignment(assignment, actor=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        parameters=[
            OpenApiParameter("status", str, enum=[c for c, _ in Submission.Status.choices]),
            OpenApiParameter("search", str),
        ],
        responses=AdminSubmissionSerializer(many=True),
    )
    @action(detail=True, methods=["get"])
    def submissions(self, request, pk=None):
        assignment = self.get_object()
        _require(policies.can_grade(request.user, assignment.course), "Only the teaching team reads submissions.")
        qs = assignment.submissions.select_related("user", "graded_by")
        if (state := request.query_params.get("status")) in Submission.Status.values:
            qs = qs.filter(status=state)
        if search := request.query_params.get("search", "").strip()[:100]:
            qs = qs.filter(Q(user__full_name__icontains=search) | Q(user__email__icontains=search))
        # Oldest waiting work first.
        page = self.paginate_queryset(qs.order_by("submitted_at", "id"))
        return self.get_paginated_response(AdminSubmissionSerializer(page, many=True).data)


class AdminSubmissionViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [CanUseAssignments]
    serializer_class = AdminSubmissionSerializer

    def get_queryset(self):
        return Submission.objects.filter(
            assignment__in=policies.gradable_assignments(self.request.user)
        ).select_related("user", "graded_by", "assignment__course")

    @extend_schema(request=GradeSerializer, responses=AdminSubmissionSerializer)
    @action(detail=True, methods=["post"])
    def grade(self, request, pk=None):
        sub = self.get_object()
        _require(policies.can_grade(request.user, sub.assignment.course), "Only the teaching team grades work.")
        serializer = GradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.grade(sub, actor=request.user, request=request, **serializer.validated_data)
        return Response(AdminSubmissionSerializer(self.get_queryset().get(pk=sub.pk)).data)

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        sub = self.get_object()
        if not sub.file:
            return Response({"error": {"code": "not_found", "message": "No file.", "details": None}}, status=404)
        return resources.file_response(sub)


class AssignmentCourseOptionsView(APIView):
    """Courses the user can add assignments to, with their lessons."""

    permission_classes = [CanUseAssignments]

    @extend_schema(responses=AssignmentCourseOptionSerializer(many=True))
    def get(self, request):
        user = request.user
        if catalog.can_manage_catalog(user):
            courses = Course.objects.all()
        elif user.has_perm(catalog.AUTHOR_COURSES):
            courses = Course.objects.filter(
                instructor_links__user=user, instructor_links__role=CourseInstructor.Role.INSTRUCTOR
            )
        else:
            courses = Course.objects.none()
        lessons = Lesson.objects.order_by("module__position", "position", "id")
        courses = courses.exclude(status=Course.Status.ARCHIVED).prefetch_related(Prefetch("lessons", queryset=lessons))
        return Response(AssignmentCourseOptionSerializer(courses.order_by("title").distinct(), many=True).data)
