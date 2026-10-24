"""Learner exam endpoints.

Attempts are only ever visible to the learner who owns them (others get 404).
Question content is read from the attempt snapshot, never from the bank, and
answer keys only appear in the result review after release.
"""

from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.learning.models import Enrollment

from . import attempts, results, services
from .models import AttemptQuestion, Exam, ExamAttempt
from .serializers import (
    AdvanceInputSerializer,
    AnswerInputSerializer,
    AnswerResultSerializer,
    AttemptResultSerializer,
    AttemptSerializer,
    AttemptSummarySerializer,
    HistoryItemSerializer,
    LearnerExamDetailSerializer,
    LearnerExamSerializer,
)


def learner_exams(user):
    enrolled = Enrollment.objects.filter(user=user, status=Enrollment.Status.ACTIVE).values("course_id")
    attempted = ExamAttempt.objects.filter(user=user).values("exam_id")
    return (
        Exam.objects.exclude(status=Exam.Status.DRAFT)
        .filter(Q(course__isnull=True) | Q(course_id__in=enrolled) | Q(pk__in=attempted))
        .select_related("course")
    )


def _own_attempt(request, pk) -> ExamAttempt:
    attempt = get_object_or_404(ExamAttempt.objects.select_related("exam", "exam__course"), pk=pk, user=request.user)
    return attempts.expire_if_overdue(attempt)


@extend_schema(
    parameters=[
        OpenApiParameter("course", str, description="Course slug"),
        OpenApiParameter("kind", str, enum=[c for c, _ in Exam.Kind.choices]),
    ]
)
class ExamListView(generics.ListAPIView):
    serializer_class = LearnerExamSerializer
    filter_backends: list = []

    def get_queryset(self):
        qs = learner_exams(self.request.user)
        if course := self.request.query_params.get("course"):
            qs = qs.filter(course__slug=course)
        if kind := self.request.query_params.get("kind"):
            qs = qs.filter(kind=kind)
        mine = ExamAttempt.objects.filter(user=self.request.user)
        qs = services.with_pool_totals(qs).prefetch_related(Prefetch("attempts", queryset=mine, to_attr="my_attempts"))
        # Open exams first (by closing time), then closed ones.
        return qs.order_by("status", "closes_at", "-published_at")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.user.is_authenticated:
            enrolled = Enrollment.objects.filter(user=self.request.user, status=Enrollment.Status.ACTIVE)
            context["enrolled_course_ids"] = set(enrolled.values_list("course_id", flat=True))
        return context


class ExamDetailView(generics.RetrieveAPIView):
    serializer_class = LearnerExamDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return learner_exams(self.request.user)


class StartAttemptView(APIView):
    @extend_schema(request=None, responses={200: AttemptSerializer, 201: AttemptSerializer})
    def post(self, request, slug):
        exam = get_object_or_404(learner_exams(request.user), slug=slug)
        attempt, created = attempts.start(request.user, exam, request=request)
        data = AttemptSerializer(attempt, context={"request": request}).data
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AttemptView(APIView):
    @extend_schema(responses=AttemptSerializer)
    def get(self, request, pk):
        return Response(AttemptSerializer(_own_attempt(request, pk), context={"request": request}).data)


class AnswerView(APIView):
    throttle_classes = [UserRateThrottle, ScopedRateThrottle]
    throttle_scope = "exam_answer"

    @extend_schema(request=AnswerInputSerializer, responses=AnswerResultSerializer)
    def put(self, request, pk, question_id):
        get_object_or_404(ExamAttempt, pk=pk, user=request.user)
        get_object_or_404(AttemptQuestion, pk=question_id, attempt_id=pk)
        data = AnswerInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        answer = attempts.save_answer(
            request.user, int(pk), int(question_id), data.validated_data["selected"], data.validated_data["flagged"]
        )
        return Response(
            {
                "question": answer.attempt_question_id,
                "selected": answer.selected,
                "flagged": answer.flagged,
                "saved_at": answer.saved_at,
            }  # fmt: skip
        )


class AdvanceView(APIView):
    throttle_classes = [UserRateThrottle, ScopedRateThrottle]
    throttle_scope = "exam_answer"

    @extend_schema(request=AdvanceInputSerializer, responses=AttemptSummarySerializer)
    def post(self, request, pk):
        get_object_or_404(ExamAttempt, pk=pk, user=request.user)
        data = AdvanceInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attempt = attempts.advance(request.user, int(pk), data.validated_data["position"])
        return Response(AttemptSummarySerializer(attempt).data)


class SubmitView(APIView):
    @extend_schema(request=None, responses=AttemptSummarySerializer)
    def post(self, request, pk):
        get_object_or_404(ExamAttempt, pk=pk, user=request.user)
        attempt = attempts.submit(request.user, int(pk), request=request)
        return Response(AttemptSummarySerializer(attempt).data)


class AttemptResultView(APIView):
    @extend_schema(responses=AttemptResultSerializer)
    def get(self, request, pk):
        attempt = _own_attempt(request, pk)
        exam = attempt.exam
        released = results.attempt_released(attempt)
        payload = {
            "attempt": attempt,
            "exam": {
                "id": exam.pk,
                "slug": exam.slug,
                "title": exam.title,
                "kind": exam.kind,
                "show_answers": exam.show_answers,
                "show_explanations": exam.show_explanations,
            },  # fmt: skip
            "released": released,
            "release_note": "" if released else results.release_note(exam),
            "summary": None,
            "topics": [],
            "review": [],
            "ranking": None,
        }
        if released:
            payload["summary"] = results.summary(attempt)
            payload["topics"] = results.topic_breakdown(attempt)
            payload["review"] = results.review(attempt)
            if exam.ranking_enabled:
                payload["ranking"] = results.ranking(exam, request.user)
        return Response(AttemptResultSerializer(payload).data)


@extend_schema(parameters=[OpenApiParameter("exam", str, description="Exam slug")])
class MyAttemptsView(generics.ListAPIView):
    """Every attempt of the signed-in learner, newest first (history and trends)."""

    serializer_class = HistoryItemSerializer
    filter_backends: list = []

    def get_queryset(self):
        attempts.expire_overdue_for(self.request.user)
        qs = ExamAttempt.objects.filter(user=self.request.user).select_related("exam")
        if exam := self.request.query_params.get("exam"):
            qs = qs.filter(exam__slug=exam)
        return qs.order_by("-started_at")
