"""Staff assessment endpoints under /api/v1/admin/assessments/.

Records outside the caller's scope are 404 (their existence is not revealed);
visible but read-only records are 403 on writes. Answer keys are only
serialised here, behind policies.py.
"""

from django.db import IntegrityError
from django.db.models import Count, ProtectedError, Q
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit import services as audit
from apps.catalog.models import Course
from common.exceptions import ConflictError
from common.pagination import StandardPagination
from common.permissions import HasPerm
from common.spreadsheet import csv_text

from . import importer, policies, results, services
from .admin_serializers import (
    AdminAttemptSerializer,
    AdminExamListSerializer,
    AdminExamSerializer,
    ExamAnalyticsSerializer,
    ExamQuestionListInputSerializer,
    ExamQuestionSerializer,
    ExamStatusSerializer,
    ImportReportSerializer,
    ImportSerializer,
    QuestionListSerializer,
    QuestionSerializer,
    QuestionVersionSerializer,
    SubjectSerializer,
    TopicSerializer,
)
from .models import Exam, ExamAttempt, Question, Subject, Topic

StaffPanel = HasPerm("accounts.access_admin_panel")


def _policy(check, message: str) -> type[BasePermission]:
    """Runs an assessments policy before any lookup or validation, so other roles get a plain 403."""

    class _Policy(BasePermission):
        def has_permission(self, request, view):
            if not check(request.user):
                raise PermissionDenied(message)
            return True

    return _Policy


OpensBank = _policy(policies.can_open_bank, "You cannot open the question bank.")
ManagesBank = _policy(policies.can_manage_bank, "Only question-bank managers can change topics.")
OpensExams = _policy(policies.can_open_exams, "You cannot open exams.")


def _require(allowed: bool, message="You do not have permission to change this."):
    if not allowed:
        raise PermissionDenied(message)


# --- Subjects and topics -------------------------------------------------------------


class SubjectViewSet(viewsets.ModelViewSet):
    """Readable by everyone who can open the question bank; changed by bank managers."""

    serializer_class = SubjectSerializer
    permission_classes = [StaffPanel, OpensBank]
    pagination_class = None
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Subject.objects.none()
        _require(policies.can_open_bank(self.request.user), "You cannot open the question bank.")
        return Subject.objects.annotate(question_count=Count("questions")).prefetch_related("topics")

    def check_write(self):
        _require(policies.can_manage_bank(self.request.user), "Only question-bank managers can change subjects.")

    def perform_create(self, serializer):
        self.check_write()
        subject = serializer.save()
        audit.record("assessments.subject_created", actor=self.request.user, target=subject, request=self.request)

    def perform_update(self, serializer):
        self.check_write()
        serializer.save()

    def perform_destroy(self, instance):
        self.check_write()
        try:
            instance.delete()
        except ProtectedError as exc:
            raise ConflictError("This subject still has questions.", code="subject_in_use") from exc
        audit.record("assessments.subject_deleted", actor=self.request.user, request=self.request, name=instance.name)


class TopicViewSet(mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = TopicSerializer
    permission_classes = [StaffPanel, ManagesBank]
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Topic.objects.none()
        _require(policies.can_manage_bank(self.request.user), "Only question-bank managers can change topics.")
        return Topic.objects.all()

    def perform_destroy(self, instance):
        audit.record("assessments.topic_deleted", actor=self.request.user, request=self.request, name=instance.name)
        instance.delete()  # questions keep their subject; their topic is cleared


# --- Questions -----------------------------------------------------------------------

BANK_FILTERS = [
    OpenApiParameter("subject", int),
    OpenApiParameter("topic", int, description="Includes the topic's subtopics"),
    OpenApiParameter("kind", str, enum=Question.Kind.values),
    OpenApiParameter("status", str, enum=Question.Status.values),
    OpenApiParameter("difficulty", str, enum=["easy", "medium", "hard"]),
    OpenApiParameter("course", str, description='Course id, or "shared" for the shared bank'),
    OpenApiParameter("tag", str),
    OpenApiParameter("search", str),
]


@extend_schema(parameters=BANK_FILTERS)
class QuestionViewSet(viewsets.ModelViewSet):
    permission_classes = [StaffPanel, OpensBank]
    filter_backends: list = []
    http_method_names = ["get", "post", "patch", "delete"]

    def get_serializer_class(self):
        return QuestionListSerializer if self.action == "list" else QuestionSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Question.objects.none()
        user = self.request.user
        _require(policies.can_open_bank(user), "You cannot open the question bank.")
        qs = policies.visible_questions(user).select_related("subject", "topic", "course", "image")
        if self.action == "list":
            qs = importer.bank_filter(qs, self.request.query_params).annotate(
                option_count=Count("options", distinct=True), used_in_exams=Count("exam_links", distinct=True)
            )
        else:
            qs = qs.prefetch_related("options__image")
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        options = data.pop("options")
        question = services.create_question(request.user, data, options, request=request)
        return Response(QuestionSerializer(question, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        question = self.get_object()
        _require(policies.can_edit_question(request.user, question), "You can view this question but not change it.")
        serializer = self.get_serializer(question, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        options = data.pop("options", None)
        question = services.update_question(request.user, question, data, options, request=request)
        question = self.get_queryset().get(pk=question.pk)
        return Response(QuestionSerializer(question, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        question = self.get_object()
        _require(policies.can_edit_question(request.user, question))
        services.delete_question(request.user, question, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses=QuestionVersionSerializer(many=True))
    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        question = self.get_object()
        _require(policies.can_edit_question(request.user, question), "You can view this question but not its history.")
        return Response(QuestionVersionSerializer(question.versions.select_related("created_by")[:50], many=True).data)

    @extend_schema(request={"multipart/form-data": ImportSerializer}, responses=ImportReportSerializer)
    @action(detail=False, methods=["post"], url_path="import", parser_classes=[MultiPartParser])
    def import_file(self, request):
        _require(policies.can_open_bank(request.user))
        serializer = ImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = serializer.validated_data.get("course")
        _require(
            policies.can_create_question_for(request.user, course.pk if course else None),
            "Choose a course you teach." if not policies.can_manage_bank(request.user) else "Not allowed.",
        )
        report = importer.import_questions(
            request.user, serializer.validated_data["file"], course=course,
            dry_run=serializer.validated_data["dry_run"], request=request,
        )  # fmt: skip
        return Response(ImportReportSerializer(report).data)

    @extend_schema(parameters=BANK_FILTERS, responses={(200, "text/csv"): OpenApiTypes.STR})
    @action(detail=False, methods=["get"])
    def export(self, request):
        """CSV of the filtered questions the caller may edit, including answers."""
        user = request.user
        _require(policies.can_open_bank(user))
        qs = importer.bank_filter(policies.visible_questions(user), request.query_params)
        if not policies.can_manage_bank(user):
            qs = qs.filter(course_id__in=policies.authored_course_ids(user))
        qs = qs.order_by("subject__position", "pk")[:5000]
        audit.record("assessments.questions_exported", actor=user, request=request, count=len(qs))
        response = HttpResponse(importer.export_csv(qs), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="questions-{timezone.now():%Y%m%d}.csv"'
        return response


# --- Exams ---------------------------------------------------------------------------


def annotated_exams(qs):
    return qs.select_related("course").annotate(
        question_total=Count("exam_questions", distinct=True), attempt_total=Count("attempts", distinct=True)
    )


@extend_schema(
    parameters=[
        OpenApiParameter("status", str, enum=Exam.Status.values),
        OpenApiParameter("course", int),
        OpenApiParameter("search", str),
    ]
)
class ExamViewSet(viewsets.ModelViewSet):
    permission_classes = [StaffPanel, OpensExams]
    filter_backends: list = []
    http_method_names = ["get", "post", "patch", "put", "delete"]

    def get_serializer_class(self):
        return AdminExamListSerializer if self.action == "list" else AdminExamSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Exam.objects.none()
        user = self.request.user
        _require(policies.can_open_exams(user), "You cannot open exams.")
        qs = annotated_exams(policies.visible_exams(user))
        params = self.request.query_params
        if self.action == "list":
            if value := params.get("status"):
                qs = qs.filter(status=value)
            if (value := params.get("course")) and value.isdigit():
                qs = qs.filter(course_id=value)
            if value := (params.get("search") or "").strip():
                qs = qs.filter(Q(title__icontains=value) | Q(slug__icontains=value))
        return qs

    def editable(self) -> Exam:
        exam = self.get_object()
        _require(policies.can_edit_exam(self.request.user, exam), "You can view this exam but not change it.")
        return exam

    def perform_create(self, serializer):
        try:
            exam = serializer.save(created_by=self.request.user)
        except IntegrityError as exc:
            raise ConflictError("That address is already used by another exam.", code="slug_taken") from exc
        audit.record("assessments.exam_created", actor=self.request.user, target=exam, request=self.request)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        exam = annotated_exams(Exam.objects.all()).get(pk=response.data["id"])
        response.data = AdminExamSerializer(exam, context={"request": request}).data
        return response

    def update(self, request, *args, **kwargs):
        if not kwargs.get("partial"):
            return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)
        exam = self.editable()
        serializer = self.get_serializer(exam, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except IntegrityError as exc:
            raise ConflictError("That address is already used by another exam.", code="slug_taken") from exc
        audit.record("assessments.exam_updated", actor=request.user, target=exam, request=request,
                     fields=sorted(serializer.validated_data))  # fmt: skip
        return Response(AdminExamSerializer(self.get_queryset().get(pk=exam.pk), context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        services.delete_exam(request.user, self.editable(), request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(methods=["get"], responses=ExamQuestionSerializer(many=True))
    @extend_schema(
        methods=["put"], request=ExamQuestionListInputSerializer, responses=ExamQuestionSerializer(many=True)
    )
    @action(detail=True, methods=["get", "put"])
    def questions(self, request, pk=None):
        exam = self.get_object()
        if request.method == "PUT":
            _require(policies.can_edit_exam(request.user, exam), "You can view this exam but not change it.")
            serializer = ExamQuestionListInputSerializer(data=request.data, context={"request": request})
            serializer.is_valid(raise_exception=True)
            services.set_exam_questions(request.user, exam, serializer.validated_data["questions"], request=request)
        links = exam.exam_questions.select_related("question__subject", "question__topic", "question__course")
        return Response(ExamQuestionSerializer(links, many=True, context={"request": request}).data)

    @extend_schema(request=ExamStatusSerializer, responses=AdminExamSerializer)
    @action(detail=True, methods=["post"], url_path="status")
    def set_status(self, request, pk=None):
        exam = self.editable()
        serializer = ExamStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.set_status(request.user, exam, serializer.validated_data["status"], request=request)
        return Response(AdminExamSerializer(self.get_queryset().get(pk=exam.pk), context={"request": request}).data)

    @extend_schema(request=None, responses=AdminExamSerializer)
    @action(detail=True, methods=["post"], url_path="publish-results")
    def publish_results(self, request, pk=None):
        exam = self.editable()
        services.publish_results(request.user, exam, request=request)
        return Response(AdminExamSerializer(self.get_queryset().get(pk=exam.pk), context={"request": request}).data)

    @extend_schema(
        parameters=[OpenApiParameter("status", str, enum=ExamAttempt.Status.values), OpenApiParameter("search", str)],
        responses=AdminAttemptSerializer(many=True),
    )
    @action(detail=True, methods=["get"])
    def attempts(self, request, pk=None):
        exam = self.get_object()
        qs = exam.attempts.select_related("user").order_by("-started_at")
        if value := request.query_params.get("status"):
            qs = qs.filter(status=value)
        if value := (request.query_params.get("search") or "").strip():
            qs = qs.filter(Q(user__email__icontains=value) | Q(user__full_name__icontains=value))
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AdminAttemptSerializer(page, many=True).data)

    @extend_schema(responses=ExamAnalyticsSerializer)
    @action(detail=True, methods=["get"])
    def analytics(self, request, pk=None):
        return Response(ExamAnalyticsSerializer(results.exam_analytics(self.get_object())).data)

    @extend_schema(responses={(200, "text/csv"): OpenApiTypes.STR})
    @action(detail=True, methods=["get"], url_path="results-export")
    def results_export(self, request, pk=None):
        exam = self.get_object()
        header = ["learner", "email", "attempt", "status", "started_at", "ended_at", "score", "max_score",
                  "correct", "incorrect", "unanswered", "passed", "time_spent_seconds"]  # fmt: skip
        rows = (
            [
                a.user.full_name,
                a.user.email,
                a.number,
                a.status,
                a.started_at.isoformat(),
                a.ended_at.isoformat() if a.ended_at else "",
                a.score,
                a.max_score,
                a.correct_count,
                a.incorrect_count,
                a.unanswered_count,
                "" if a.passed is None else ("yes" if a.passed else "no"),
                results.time_spent_seconds(a),
            ]  # fmt: skip
            for a in exam.attempts.select_related("user")
            .exclude(status=ExamAttempt.Status.IN_PROGRESS)
            .order_by("user__email", "number")
        )
        body = csv_text(header, rows)
        audit.record("assessments.results_exported", actor=request.user, target=exam, request=request)
        response = HttpResponse(body, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{exam.slug}-results.csv"'
        return response


class ExamCourseOptionsView(APIView):
    """Courses an exam can be attached to by this user (all for exam managers)."""

    permission_classes = [StaffPanel, OpensExams]

    @extend_schema(
        responses={
            200: {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "title": {"type": "string"},
                        "status": {"type": "string"},
                    },
                },  # fmt: skip
            }
        }
    )
    def get(self, request):
        user = request.user
        qs = Course.objects.exclude(status=Course.Status.ARCHIVED)
        if not (policies.can_manage_exams(user) or policies.can_manage_bank(user)):
            qs = qs.filter(pk__in=policies.authored_course_ids(user))
        return Response(list(qs.order_by("title").values("id", "title", "status")[:500]))
