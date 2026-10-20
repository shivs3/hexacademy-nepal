"""Learner serializers. Nothing here reads `Question`, `QuestionOption.is_correct`
or `AttemptQuestion.answer_key` except `ReviewItemSerializer`, which the result
view only uses after `results.attempt_released()`.
"""

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from . import attempts, results, services
from .models import AttemptAnswer, AttemptQuestion, Exam, ExamAttempt

OPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "integer"},
        "text": {"type": "string"},
        "image": {"type": "object", "nullable": True},
    },
}
CONTENT_SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["single", "multiple", "true_false"]},
        "prompt": {"type": "string"},
        "image": {"type": "object", "nullable": True},
        "options": {"type": "array", "items": OPTION_SCHEMA},
    },
}


class CourseRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    slug = serializers.CharField()


class AttemptSummarySerializer(serializers.ModelSerializer):
    results_released = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()
    passed = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = ["id", "number", "status", "started_at", "deadline", "ended_at", "max_score", "score", "passed",
                  "results_released"]  # fmt: skip

    def get_results_released(self, obj) -> bool:
        return results.attempt_released(obj)

    @extend_schema_field(serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True))
    def get_score(self, obj):
        return str(obj.score) if results.attempt_released(obj) and obj.score is not None else None

    def get_passed(self, obj) -> bool | None:
        return obj.passed if results.attempt_released(obj) else None


class LearnerExamSerializer(serializers.ModelSerializer):
    course = CourseRefSerializer(allow_null=True)
    total_marks = serializers.SerializerMethodField()
    question_total = serializers.SerializerMethodField()
    availability = serializers.SerializerMethodField()
    attempts_used = serializers.SerializerMethodField()
    open_attempt_id = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            "id", "slug", "title", "kind", "course", "duration_minutes", "opens_at", "closes_at", "max_attempts",
            "total_marks", "question_total", "availability", "attempts_used", "open_attempt_id",
        ]  # fmt: skip

    def _mine(self, obj):
        cache = self.context.setdefault("_attempts", {})
        if obj.pk not in cache:
            user = self.context["request"].user
            cache[obj.pk] = list(ExamAttempt.objects.filter(exam=obj, user=user).select_related("exam"))
        return cache[obj.pk]

    def get_total_marks(self, obj) -> str:
        return f"{services.total_marks(obj):.2f}"

    def get_question_total(self, obj) -> int:
        return services.drawn_count(obj, obj.exam_questions.count())

    @extend_schema_field(
        serializers.ChoiceField(
            choices=["available", "in_progress", "not_open", "closed", "not_enrolled", "no_attempts_left"]
        )
    )
    def get_availability(self, obj):
        if self.get_open_attempt_id(obj):
            return "in_progress"
        allowed, reason = attempts.eligibility(self.context["request"].user, obj)
        return "available" if allowed else reason

    def get_attempts_used(self, obj) -> int:
        return len(self._mine(obj))

    def get_open_attempt_id(self, obj) -> int | None:
        for attempt in self._mine(obj):
            if attempt.is_open and not attempts.is_overdue(attempt):
                return attempt.pk
        return None


class LearnerExamDetailSerializer(LearnerExamSerializer):
    my_attempts = serializers.SerializerMethodField()
    release_note = serializers.SerializerMethodField()

    class Meta(LearnerExamSerializer.Meta):
        fields = [
            *LearnerExamSerializer.Meta.fields,
            "instructions", "negative_marking", "pass_marks", "allow_revisit", "result_release", "release_note",
            "ranking_enabled", "my_attempts",
        ]  # fmt: skip

    @extend_schema_field(AttemptSummarySerializer(many=True))
    def get_my_attempts(self, obj):
        return AttemptSummarySerializer(self._mine(obj), many=True).data

    def get_release_note(self, obj) -> str:
        return results.release_note(obj)


class AttemptQuestionSerializer(serializers.ModelSerializer):
    content = serializers.SerializerMethodField()

    class Meta:
        model = AttemptQuestion
        fields = ["id", "position", "content", "marks", "negative_marks"]

    @extend_schema_field(CONTENT_SCHEMA)
    def get_content(self, obj):
        return obj.content  # built at start without the key


class SavedAnswerSerializer(serializers.Serializer):
    question = serializers.IntegerField()
    selected = serializers.ListField(child=serializers.IntegerField())
    flagged = serializers.BooleanField()
    saved_at = serializers.DateTimeField()


class AttemptSerializer(serializers.ModelSerializer):
    exam = serializers.SerializerMethodField()
    server_time = serializers.SerializerMethodField()
    questions = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    results_released = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            "id", "exam", "number", "status", "started_at", "deadline", "ended_at", "server_time",
            "furthest_position", "max_score", "results_released", "questions", "answers",
        ]  # fmt: skip

    @extend_schema_field(
        {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "slug": {"type": "string"},
                "title": {"type": "string"},
                "allow_revisit": {"type": "boolean"},
                "negative_marking": {"type": "boolean"},
            },
        }
    )
    def get_exam(self, obj):
        e = obj.exam
        return {"id": e.pk, "slug": e.slug, "title": e.title, "allow_revisit": e.allow_revisit,
                "negative_marking": e.negative_marking}  # fmt: skip

    def get_server_time(self, obj) -> str:
        return timezone.now().isoformat()

    @extend_schema_field(AttemptQuestionSerializer(many=True))
    def get_questions(self, obj):
        # Question content is only sent while the attempt is open; afterwards the
        # review (after release) is the only way to see it again.
        if not obj.is_open:
            return []
        return AttemptQuestionSerializer(obj.questions.all(), many=True).data

    @extend_schema_field(SavedAnswerSerializer(many=True))
    def get_answers(self, obj):
        if not obj.is_open:
            return []
        return [
            {"question": a.attempt_question_id, "selected": a.selected, "flagged": a.flagged, "saved_at": a.saved_at}
            for a in AttemptAnswer.objects.filter(attempt_question__attempt=obj)
        ]

    def get_results_released(self, obj) -> bool:
        return results.attempt_released(obj)


class AnswerInputSerializer(serializers.Serializer):
    selected = serializers.ListField(child=serializers.IntegerField(min_value=1), max_length=8)
    flagged = serializers.BooleanField(default=False)


class AnswerResultSerializer(serializers.Serializer):
    question = serializers.IntegerField()
    selected = serializers.ListField(child=serializers.IntegerField())
    flagged = serializers.BooleanField()
    saved_at = serializers.DateTimeField()


class AdvanceInputSerializer(serializers.Serializer):
    position = serializers.IntegerField(min_value=0)


class SummarySerializer(serializers.Serializer):
    score = serializers.DecimalField(max_digits=7, decimal_places=2)
    max_score = serializers.DecimalField(max_digits=7, decimal_places=2)
    percent = serializers.DecimalField(max_digits=6, decimal_places=1)
    passed = serializers.BooleanField(allow_null=True)
    pass_marks = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    correct = serializers.IntegerField()
    incorrect = serializers.IntegerField()
    unanswered = serializers.IntegerField()
    accuracy = serializers.DecimalField(max_digits=6, decimal_places=1)
    time_spent_seconds = serializers.IntegerField(allow_null=True)


class TopicRowSerializer(serializers.Serializer):
    topic = serializers.CharField()
    questions = serializers.IntegerField()
    correct = serializers.IntegerField()
    incorrect = serializers.IntegerField()
    unanswered = serializers.IntegerField()
    marks = serializers.DecimalField(max_digits=7, decimal_places=2)
    max_marks = serializers.DecimalField(max_digits=7, decimal_places=2)
    percent = serializers.DecimalField(max_digits=6, decimal_places=1)


class ReviewItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    position = serializers.IntegerField()
    topic = serializers.CharField()
    content = serializers.JSONField()
    selected = serializers.ListField(child=serializers.IntegerField())
    is_correct = serializers.BooleanField(allow_null=True)
    awarded_marks = serializers.DecimalField(max_digits=7, decimal_places=2)
    marks = serializers.DecimalField(max_digits=7, decimal_places=2)
    correct_options = serializers.ListField(child=serializers.IntegerField(), allow_null=True)
    explanation = serializers.CharField()


class RankRowSerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    name = serializers.CharField()
    is_you = serializers.BooleanField()
    score = serializers.DecimalField(max_digits=7, decimal_places=2)
    max_score = serializers.DecimalField(max_digits=7, decimal_places=2)
    time_spent_seconds = serializers.IntegerField(allow_null=True)


class RankingSerializer(serializers.Serializer):
    participants = serializers.IntegerField()
    top = RankRowSerializer(many=True)
    you = RankRowSerializer(allow_null=True)


class AttemptResultSerializer(serializers.Serializer):
    attempt = AttemptSummarySerializer()
    exam = serializers.DictField()
    released = serializers.BooleanField()
    release_note = serializers.CharField()
    summary = SummarySerializer(allow_null=True)
    topics = TopicRowSerializer(many=True)
    review = ReviewItemSerializer(many=True)
    ranking = RankingSerializer(allow_null=True)


class HistoryItemSerializer(AttemptSummarySerializer):
    exam = serializers.SerializerMethodField()
    percent = serializers.SerializerMethodField()

    class Meta(AttemptSummarySerializer.Meta):
        fields = [*AttemptSummarySerializer.Meta.fields, "exam", "percent"]

    @extend_schema_field(
        {
            "type": "object",
            "properties": {"id": {"type": "integer"}, "slug": {"type": "string"}, "title": {"type": "string"}},
        }
    )
    def get_exam(self, obj):
        return {"id": obj.exam_id, "slug": obj.exam.slug, "title": obj.exam.title}

    @extend_schema_field(serializers.DecimalField(max_digits=6, decimal_places=1, allow_null=True))
    def get_percent(self, obj):
        if not results.attempt_released(obj) or not obj.max_score:
            return None
        return str(results.percent(obj.score or 0, obj.max_score))
