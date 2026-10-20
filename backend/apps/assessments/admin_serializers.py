"""Staff serializers. These include answer keys and are only used by the
admin views, which check policies.py first. Learner serializers live in
serializers.py and never import from here.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Course
from apps.cms import sanitize
from apps.cms.admin_serializers import ImageAssetField
from apps.cms.media import media_payload
from apps.cms.serializers import MediaRefSerializer

from . import policies, results, services
from .models import Exam, ExamAttempt, ExamQuestion, Question, QuestionOption, QuestionVersion, Subject, Topic

MAX_TAGS = 20
MARK_FIELD = {"max_digits": 7, "decimal_places": 2}


def _plain_required(value: str) -> str:
    value = " ".join(sanitize.clean_plain_text(value).split())
    if not value:
        raise serializers.ValidationError("This field may not be blank.")
    return value


def _slug(value: str) -> str:
    try:
        return sanitize.validate_slug_format(value)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages) from exc


# --- Subjects and topics -------------------------------------------------------------


class TopicSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Topic
        fields = ["id", "subject", "parent", "name", "slug", "position", "question_count"]

    def validate_name(self, value):
        return _plain_required(value)

    def validate_slug(self, value):
        return _slug(value)

    def validate(self, attrs):
        subject = attrs.get("subject", self.instance.subject if self.instance else None)
        parent = attrs.get("parent", self.instance.parent if self.instance else None)
        if parent is not None:
            if parent.subject_id != subject.pk:
                raise serializers.ValidationError({"parent": ["Choose a topic of the same subject."]})
            if parent.parent_id is not None:
                raise serializers.ValidationError({"parent": ["Subtopics cannot have subtopics of their own."]})
            if self.instance and parent.pk == self.instance.pk:
                raise serializers.ValidationError({"parent": ["A topic cannot be its own parent."]})
        if self.instance and "subject" in attrs and attrs["subject"].pk != self.instance.subject_id:
            raise serializers.ValidationError({"subject": ["A topic cannot move to another subject."]})
        slug = attrs.get("slug", self.instance.slug if self.instance else None)
        clash = Topic.objects.filter(subject=subject, slug=slug)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"slug": ["This subject already has a topic with this address."]})
        return attrs


class SubjectSerializer(serializers.ModelSerializer):
    topics = TopicSerializer(many=True, read_only=True)
    question_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Subject
        fields = ["id", "name", "slug", "description", "position", "topics", "question_count"]

    def validate_name(self, value):
        return _plain_required(value)

    def validate_slug(self, value):
        return _slug(value)

    def validate_description(self, value):
        return " ".join(sanitize.clean_plain_text(value).split())


# --- Questions -----------------------------------------------------------------------


class OptionSerializer(serializers.ModelSerializer):
    image = ImageAssetField()
    image_detail = serializers.SerializerMethodField()

    class Meta:
        model = QuestionOption
        fields = ["id", "text", "image", "image_detail", "is_correct"]
        read_only_fields = ["id"]

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_image_detail(self, obj):
        return media_payload(obj.image) if obj.image_id else None

    def validate_text(self, value):
        if len(value) > 5000:
            raise serializers.ValidationError("The option is too long.")
        return value


class QuestionListSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    topic_name = serializers.CharField(source="topic.name", read_only=True, default="")
    course_title = serializers.CharField(source="course.title", read_only=True, default="")
    option_count = serializers.IntegerField(read_only=True, default=0)
    used_in_exams = serializers.IntegerField(read_only=True, default=0)
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id", "subject", "subject_name", "topic", "topic_name", "course", "course_title", "kind", "status",
            "difficulty", "prompt", "tags", "default_marks", "default_negative_marks", "version", "option_count",
            "used_in_exams", "can_edit", "updated_at",
        ]  # fmt: skip

    def get_can_edit(self, obj) -> bool:
        return policies.can_edit_question(self.context["request"].user, obj)


class QuestionSerializer(QuestionListSerializer):
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    topic = serializers.PrimaryKeyRelatedField(queryset=Topic.objects.all(), allow_null=True, required=False)
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all(), allow_null=True, required=False)
    image = ImageAssetField()
    image_detail = serializers.SerializerMethodField()
    options = OptionSerializer(many=True)
    default_marks = serializers.DecimalField(**MARK_FIELD, min_value=Decimal("0.25"), max_value=Decimal("1000"),
                                             required=False)  # fmt: skip
    default_negative_marks = serializers.DecimalField(**MARK_FIELD, min_value=Decimal("0"), max_value=Decimal("1000"),
                                                      required=False)  # fmt: skip

    class Meta(QuestionListSerializer.Meta):
        fields = [*QuestionListSerializer.Meta.fields, "image", "image_detail", "explanation", "options", "created_at"]
        read_only_fields = ["version", "updated_at", "created_at"]

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_image_detail(self, obj):
        return media_payload(obj.image) if obj.image_id else None

    def validate_prompt(self, value):
        if len(value) > 50_000:
            raise serializers.ValidationError("The question is too long.")
        return value

    def validate_explanation(self, value):
        if len(value) > 50_000:
            raise serializers.ValidationError("The explanation is too long.")
        return value

    def validate_tags(self, value):
        tags = sorted({" ".join(sanitize.clean_plain_text(t).split()).lower()[:40] for t in value} - {""})
        if len(tags) > MAX_TAGS:
            raise serializers.ValidationError(f"Use at most {MAX_TAGS} tags.")
        return tags

    def validate_course(self, value):
        user = self.context["request"].user
        current = self.instance.course_id if self.instance else None
        new = value.pk if value else None
        if (self.instance is None or new != current) and not policies.can_create_question_for(user, new):
            raise serializers.ValidationError(
                "You can only write questions for courses you teach."
                if new
                else "Only question-bank managers can add shared questions."
            )
        return value

    def validate(self, attrs):
        if self.instance is None and "course" not in attrs:
            attrs["course"] = self.validate_course(None)
        return attrs


class QuestionVersionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")

    class Meta:
        model = QuestionVersion
        fields = ["id", "version", "snapshot", "created_by_name", "created_at"]


class ImportSerializer(serializers.Serializer):
    file = serializers.FileField()
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all(), allow_null=True, required=False)
    dry_run = serializers.BooleanField(default=True)


class ImportReportSerializer(serializers.Serializer):
    rows = serializers.IntegerField()
    valid = serializers.IntegerField()
    created = serializers.IntegerField()
    dry_run = serializers.BooleanField()
    errors = serializers.ListField(
        child=serializers.DictField(), help_text="Each error: {row, field, message}. Row 1 is the header."
    )


# --- Exams ---------------------------------------------------------------------------


class ExamQuestionSerializer(serializers.ModelSerializer):
    question = QuestionListSerializer(read_only=True)

    class Meta:
        model = ExamQuestion
        fields = ["id", "question", "position", "marks", "negative_marks"]


class VisibleQuestionField(serializers.PrimaryKeyRelatedField):
    """Only questions the requesting user may see can be attached to an exam."""

    def get_queryset(self):
        request = self.context.get("request")
        return policies.visible_questions(request.user) if request else Question.objects.none()


class ExamQuestionInputSerializer(serializers.Serializer):
    question = VisibleQuestionField(queryset=Question.objects.none())
    marks = serializers.DecimalField(**MARK_FIELD, min_value=Decimal("0.25"), max_value=Decimal("1000"), required=False,
                                     allow_null=True)  # fmt: skip
    negative_marks = serializers.DecimalField(**MARK_FIELD, min_value=Decimal("0"), max_value=Decimal("1000"),
                                              required=False, allow_null=True)  # fmt: skip


class ExamQuestionListInputSerializer(serializers.Serializer):
    questions = ExamQuestionInputSerializer(many=True)


class AdminExamListSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True, default="")
    question_total = serializers.IntegerField(read_only=True, default=0)
    attempt_total = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Exam
        fields = [
            "id", "title", "slug", "course", "course_title", "kind", "status", "duration_minutes", "opens_at",
            "closes_at", "question_total", "attempt_total", "result_release", "results_published_at", "updated_at",
        ]  # fmt: skip


class AdminExamSerializer(AdminExamListSerializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all(), allow_null=True, required=False)
    pass_marks = serializers.DecimalField(**MARK_FIELD, min_value=Decimal("0"), allow_null=True, required=False)
    total_marks = serializers.SerializerMethodField()
    drawn_questions = serializers.SerializerMethodField()
    abilities = serializers.SerializerMethodField()
    publish_problems = serializers.SerializerMethodField()
    results_released = serializers.SerializerMethodField()

    class Meta(AdminExamListSerializer.Meta):
        fields = [
            *AdminExamListSerializer.Meta.fields,
            "instructions", "question_count", "shuffle_questions", "shuffle_options", "negative_marking",
            "pass_marks", "max_attempts", "allow_revisit", "show_answers", "show_explanations", "ranking_enabled",
            "published_at", "total_marks", "drawn_questions", "abilities", "publish_problems", "results_released",
            "created_at",
        ]  # fmt: skip
        read_only_fields = ["status", "published_at", "results_published_at", "updated_at", "created_at"]

    @extend_schema_field(serializers.DecimalField(max_digits=9, decimal_places=2))
    def get_total_marks(self, obj) -> str:
        return f"{services.total_marks(obj):.2f}"

    def get_drawn_questions(self, obj) -> int:
        return services.drawn_count(obj, obj.exam_questions.count())

    @extend_schema_field(
        {"type": "object", "properties": {k: {"type": "boolean"} for k in ("edit", "structure", "delete")}}
    )
    def get_abilities(self, obj):
        user = self.context["request"].user
        edit = policies.can_edit_exam(user, obj)
        return {
            "edit": edit,
            "structure": edit and obj.status == Exam.Status.DRAFT,
            "delete": edit and obj.status == Exam.Status.DRAFT and not obj.attempts.exists(),
        }

    def get_publish_problems(self, obj) -> list[str]:
        return services.publish_problems(obj) if obj.status == Exam.Status.DRAFT else []

    def get_results_released(self, obj) -> bool:
        return results.results_released(obj)

    def validate_title(self, value):
        return _plain_required(value)

    def validate_slug(self, value):
        return _slug(value)

    def validate_instructions(self, value):
        if len(value) > 50_000:
            raise serializers.ValidationError("The instructions are too long.")
        return sanitize.clean_rich_text(value)

    def validate_duration_minutes(self, value):
        if not 1 <= value <= 600:
            raise serializers.ValidationError("Choose between 1 and 600 minutes.")
        return value

    def validate_course(self, value):
        user = self.context["request"].user
        current = self.instance.course_id if self.instance else None
        new = value.pk if value else None
        if (self.instance is None or new != current) and not policies.can_create_exam_for(user, new):
            raise serializers.ValidationError(
                "You can only create exams for courses you teach."
                if new
                else "Only exam managers can create exams without a course."
            )
        return value

    def validate(self, attrs):
        instance = self.instance
        if instance is None and "course" not in attrs:
            attrs["course"] = self.validate_course(None)
        if instance and instance.status != Exam.Status.DRAFT:
            locked = [f for f in services.SCORING_FIELDS if f in attrs and attrs[f] != getattr(instance, f)]
            if locked:
                raise serializers.ValidationError(
                    {f: ["This can only change while the exam is a draft."] for f in sorted(locked)}
                )
        get = lambda f: attrs.get(f, getattr(instance, f) if instance else None)  # noqa: E731
        opens_at, closes_at = get("opens_at"), get("closes_at")
        if opens_at and closes_at and closes_at <= opens_at:
            raise serializers.ValidationError({"closes_at": ["The exam must close after it opens."]})
        if get("question_count") == 0:
            raise serializers.ValidationError({"question_count": ["Draw at least one question, or leave it empty."]})
        if get("max_attempts") == 0:
            raise serializers.ValidationError({"max_attempts": ["Allow at least one attempt, or leave it empty."]})
        return attrs


class ExamStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Exam.Status.choices)


class AdminAttemptSerializer(serializers.ModelSerializer):
    learner = serializers.SerializerMethodField()
    time_spent_seconds = serializers.SerializerMethodField()

    class Meta:
        model = ExamAttempt
        fields = [
            "id", "learner", "number", "status", "started_at", "deadline", "ended_at", "score", "max_score",
            "correct_count", "incorrect_count", "unanswered_count", "passed", "time_spent_seconds",
        ]  # fmt: skip

    @extend_schema_field(
        {
            "type": "object",
            "properties": {"id": {"type": "integer"}, "full_name": {"type": "string"}, "email": {"type": "string"}},
        }
    )
    def get_learner(self, obj):
        return {"id": obj.user_id, "full_name": obj.user.full_name, "email": obj.user.email}

    def get_time_spent_seconds(self, obj) -> int | None:
        return results.time_spent_seconds(obj)


class DistributionBucketSerializer(serializers.Serializer):
    range = serializers.CharField()
    count = serializers.IntegerField()


class QuestionStatSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    seen = serializers.IntegerField()
    correct = serializers.IntegerField()
    incorrect = serializers.IntegerField()
    unanswered = serializers.IntegerField()
    correct_rate = serializers.DecimalField(max_digits=6, decimal_places=1)


class ExamAnalyticsSerializer(serializers.Serializer):
    attempts = serializers.IntegerField()
    learners = serializers.IntegerField()
    in_progress = serializers.IntegerField()
    expired = serializers.IntegerField()
    average_score = serializers.DecimalField(max_digits=9, decimal_places=2, allow_null=True)
    highest_score = serializers.DecimalField(max_digits=9, decimal_places=2, allow_null=True)
    lowest_score = serializers.DecimalField(max_digits=9, decimal_places=2, allow_null=True)
    pass_rate = serializers.DecimalField(max_digits=6, decimal_places=1, allow_null=True)
    distribution = DistributionBucketSerializer(many=True)
    questions = QuestionStatSerializer(many=True)
