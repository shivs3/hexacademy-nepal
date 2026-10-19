"""Staff catalog endpoints under /api/v1/admin/catalog/.

Every course-scoped request is checked against policies.py: courses outside
the caller's scope are 404 (their existence is not revealed); visible but
read-only courses are 403 on writes.
"""

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit import services as audit
from common.permissions import HasPerm

from . import policies, resources, services
from .admin_serializers import (
    MANAGER_ONLY_FIELDS,
    AdminCategorySerializer,
    AdminCourseListSerializer,
    AdminCourseSerializer,
    AdminLessonSerializer,
    AdminModuleSerializer,
    ReorderSerializer,
    ResourceSerializer,
    ResourceUploadSerializer,
    StatusSerializer,
    TeamCandidateSerializer,
    TeamListInputSerializer,
    team_candidates,
)
from .models import Category, Course, CourseModule, Lesson, LessonResource

StaffPanel = HasPerm("accounts.access_admin_panel")


def annotated_courses(qs):
    return qs.select_related("category", "thumbnail", "og_image").annotate(
        lesson_count=Count("lessons", distinct=True),
        published_lesson_count=Count("lessons", filter=Q(lessons__is_published=True), distinct=True),
        enrollment_count=Count("enrollments", filter=Q(enrollments__status="active"), distinct=True),
    )


def course_for(request, pk, *, edit: bool = False) -> Course:
    course = get_object_or_404(policies.admin_courses(request.user), pk=pk)
    if edit and not policies.can_edit_content(request.user, course):
        raise PermissionDenied("You can view this course but not edit it.")
    return course


def _require(condition: bool, message: str = "You do not have permission to perform this action."):
    if not condition:
        raise PermissionDenied(message)


# --- Categories ----------------------------------------------------------------------


class AdminCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = AdminCategorySerializer
    pagination_class = None
    filter_backends: list = []

    def get_permissions(self):
        if self.action == "list":
            # Course authors pick categories; only catalog managers change them.
            return [HasPerm(policies.MANAGE_CATALOG, policies.AUTHOR_COURSES, any_of=True)()]
        return [HasPerm(policies.MANAGE_CATALOG)()]

    def get_queryset(self):
        return (
            Category.objects.select_related("parent")
            .annotate(course_count=Count("courses"))
            .order_by("parent__position", "parent__name", "position", "name")
        )

    def perform_create(self, serializer):
        category = serializer.save()
        audit.record("catalog.category_created", target=category, request=self.request)

    def perform_destroy(self, instance):
        services.delete_category(instance, actor=self.request.user, request=self.request)


# --- Courses -------------------------------------------------------------------------


@extend_schema(parameters=[OpenApiParameter("status", str), OpenApiParameter("search", str)])
class AdminCourseViewSet(viewsets.ModelViewSet):
    permission_classes = [StaffPanel]
    search_fields = ["title", "slug"]
    ordering_fields = ["title", "updated_at", "published_at"]
    ordering = ["-updated_at"]
    filterset_fields = ["status", "category"]

    def get_serializer_class(self):
        return AdminCourseListSerializer if self.action == "list" else AdminCourseSerializer

    def get_queryset(self):
        return annotated_courses(policies.admin_courses(self.request.user)).prefetch_related("instructor_links__user")

    def _check_manager_fields(self, data, course: Course | None):
        if policies.can_manage_catalog(self.request.user):
            return
        blocked = [f for f in MANAGER_ONLY_FIELDS if f in data]
        if (
            course is not None
            and course.status != Course.Status.DRAFT
            and "slug" in data
            and data["slug"] != course.slug
        ):
            blocked.append("slug")
        if blocked:
            raise PermissionDenied(f"Only catalog managers can change: {', '.join(blocked)}.")

    def _fresh(self, course: Course) -> dict:
        return AdminCourseSerializer(self.get_queryset().get(pk=course.pk), context=self.get_serializer_context()).data

    def create(self, request, *args, **kwargs):
        _require(policies.can_create_course(request.user))
        self._check_manager_fields(request.data, None)
        serializer = AdminCourseSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        try:
            course = services.create_course(data=serializer.validated_data, actor=request.user, request=request)
        except IntegrityError as exc:
            raise ValidationError({"slug": ["A course with this address already exists."]}) from exc
        return Response(self._fresh(course), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        course = course_for(request, kwargs["pk"], edit=True)
        self._check_manager_fields(request.data, course)
        serializer = AdminCourseSerializer(
            course, data=request.data, partial=True, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        services.update_course(course, data=serializer.validated_data, actor=request.user, request=request)
        return Response(self._fresh(course))

    def destroy(self, request, *args, **kwargs):
        course = course_for(request, kwargs["pk"])
        _require(policies.can_manage_catalog(request.user))
        services.delete_course(course, actor=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=StatusSerializer, responses=AdminCourseSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        course = course_for(request, pk)
        _require(policies.can_publish(request.user), "Publishing courses needs the publish permission.")
        serializer = StatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.set_status(course, serializer.validated_data["status"], actor=request.user, request=request)
        return Response(self._fresh(course))

    @extend_schema(request=TeamListInputSerializer, responses=AdminCourseSerializer)
    @action(detail=True, methods=["put"])
    def team(self, request, pk=None):
        course = course_for(request, pk)
        _require(policies.can_manage_catalog(request.user), "Only catalog managers can change the teaching team.")
        serializer = TeamListInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.set_team(course, serializer.validated_data["members"], actor=request.user, request=request)
        return Response(self._fresh(course))

    @extend_schema(responses=AdminModuleSerializer(many=True))
    @action(detail=True, methods=["get"])
    def curriculum(self, request, pk=None):
        course = course_for(request, pk)
        modules = course.modules.prefetch_related("lessons__resources")
        return Response(AdminModuleSerializer(modules, many=True).data)

    @extend_schema(request=ReorderSerializer, responses=AdminModuleSerializer(many=True))
    @action(detail=True, methods=["post"], url_path="curriculum/reorder")
    def reorder(self, request, pk=None):
        course = course_for(request, pk, edit=True)
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.reorder_curriculum(course, serializer.validated_data["modules"])
        return self.curriculum(request, pk)

    @extend_schema(request=AdminModuleSerializer, responses=AdminModuleSerializer)
    @action(detail=True, methods=["post"])
    def modules(self, request, pk=None):
        course = course_for(request, pk, edit=True)
        serializer = AdminModuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        module = services.create_module(course, **serializer.validated_data)
        return Response(AdminModuleSerializer(module).data, status=status.HTTP_201_CREATED)


class TeamCandidatesView(APIView):
    permission_classes = [HasPerm(policies.MANAGE_CATALOG)]

    @extend_schema(parameters=[OpenApiParameter("search", str)], responses=TeamCandidateSerializer(many=True))
    def get(self, request):
        qs = team_candidates().order_by("full_name")
        if search := request.query_params.get("search", "").strip():
            qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search))
        return Response(TeamCandidateSerializer(qs[:30], many=True).data)


# --- Curriculum ----------------------------------------------------------------------


class AdminModuleViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [StaffPanel]
    serializer_class = AdminModuleSerializer
    queryset = CourseModule.objects.select_related("course")

    def get_object(self):
        module = super().get_object()
        course_for(self.request, module.course_id, edit=True)
        return module

    def perform_destroy(self, instance):
        services.delete_module(instance)


class AdminLessonViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [StaffPanel]
    serializer_class = AdminLessonSerializer
    queryset = Lesson.objects.select_related("course", "module").prefetch_related("resources")

    def get_object(self):
        lesson = super().get_object()
        course_for(self.request, lesson.course_id, edit=self.action != "retrieve")
        return lesson

    def perform_create(self, serializer):
        module = serializer.validated_data.pop("module")
        course_for(self.request, module.course_id, edit=True)
        serializer.instance = services.create_lesson(module, data=serializer.validated_data)

    def perform_destroy(self, instance):
        services.delete_lesson(instance)

    @extend_schema(request=ResourceUploadSerializer, responses=ResourceSerializer)
    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser, JSONParser])
    def resources(self, request, pk=None):
        lesson = self.get_object()
        serializer = ResourceUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            if data.get("file"):
                resource = resources.add_file(
                    lesson, data["file"], title=data.get("title", ""), actor=request.user, request=request
                )
            else:
                resource = resources.add_link(
                    lesson, title=data["title"], url=data["url"], actor=request.user, request=request
                )
        return Response(ResourceSerializer(resource).data, status=status.HTTP_201_CREATED)


class AdminResourceViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [StaffPanel]
    serializer_class = ResourceSerializer
    queryset = LessonResource.objects.select_related("lesson")

    def get_object(self):
        resource = super().get_object()
        course_for(self.request, resource.lesson.course_id, edit=self.action != "download")
        return resource

    def perform_destroy(self, instance):
        resources.delete_resource(instance, actor=self.request.user, request=self.request)

    @extend_schema(responses={(200, "application/octet-stream"): bytes})
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        resource = self.get_object()
        if resource.kind != LessonResource.Kind.FILE:
            raise ValidationError("This resource is a link, not a file.")
        return resources.file_response(resource)
