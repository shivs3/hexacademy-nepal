"""Assignment serializers. Learner and staff shapes are separate: a learner
never receives another learner's work, and points/feedback appear only once
the teaching team has reviewed the submission."""

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Course, Lesson
from apps.cms import sanitize

from . import assignment_policies as policies
from . import assignment_services as services
from .admin_serializers import EnrollmentCourseSerializer, EnrollmentUserSerializer
from .models import Assignment, Submission


class LessonRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()


# --- Learner ---------------------------------------------------------------------


class MySubmissionSerializer(serializers.ModelSerializer):
    has_file = serializers.SerializerMethodField()
    points = serializers.SerializerMethodField()
    feedback = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = [
            "status",
            "text",
            "has_file",
            "original_name",
            "size_bytes",
            "attempt",
            "submitted_at",
            "is_late",
            "points",
            "feedback",
            "graded_at",
        ]

    def get_has_file(self, obj) -> bool:
        return bool(obj.file)

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_points(self, obj):
        return obj.points if obj.status == Submission.Status.GRADED else None

    def get_feedback(self, obj) -> str:
        # Only reviewers write feedback; it stays visible after a resubmission.
        return obj.feedback if obj.graded_at else ""


class LearnerAssignmentSerializer(serializers.ModelSerializer):
    """Expects `my_submission` (Submission or None) on the instance."""

    course = EnrollmentCourseSerializer()
    lesson = LessonRefSerializer(allow_null=True)
    submission = serializers.SerializerMethodField()
    can_submit = serializers.SerializerMethodField()
    closed_reason = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "title",
            "course",
            "lesson",
            "due_at",
            "allow_late",
            "accepts_text",
            "accepts_file",
            "max_points",
            "submission",
            "can_submit",
            "closed_reason",
        ]

    @extend_schema_field(MySubmissionSerializer(allow_null=True))
    def get_submission(self, obj):
        sub = getattr(obj, "my_submission", None)
        return MySubmissionSerializer(sub).data if sub else None

    def get_can_submit(self, obj) -> bool:
        sub = getattr(obj, "my_submission", None)
        return services.window(obj).open and not (sub and sub.status == Submission.Status.GRADED)

    def get_closed_reason(self, obj) -> str:
        sub = getattr(obj, "my_submission", None)
        if sub and sub.status == Submission.Status.GRADED:
            return "Graded."
        return services.window(obj).reason


class LearnerAssignmentDetailSerializer(LearnerAssignmentSerializer):
    class Meta(LearnerAssignmentSerializer.Meta):
        fields = [*LearnerAssignmentSerializer.Meta.fields, "instructions"]


class SubmitSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True, default="", max_length=services.MAX_TEXT)
    file = serializers.FileField(required=False, allow_null=True, default=None)
    remove_file = serializers.BooleanField(required=False, default=False)


# --- Staff -----------------------------------------------------------------------


class AdminAssignmentSerializer(serializers.ModelSerializer):
    """Expects `submitted_count`, `graded_count`, `returned_count` annotations."""

    course = EnrollmentCourseSerializer()
    lesson = LessonRefSerializer(allow_null=True)
    submitted_count = serializers.IntegerField(read_only=True)
    graded_count = serializers.IntegerField(read_only=True)
    returned_count = serializers.IntegerField(read_only=True)
    can_edit = serializers.SerializerMethodField()
    can_grade = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "course",
            "lesson",
            "title",
            "instructions",
            "due_at",
            "allow_late",
            "accepts_text",
            "accepts_file",
            "max_points",
            "is_published",
            "submitted_count",
            "graded_count",
            "returned_count",
            "can_edit",
            "can_grade",
            "created_at",
            "updated_at",
        ]

    def get_can_edit(self, obj) -> bool:
        return policies.can_author(self.context["request"].user, obj.course)

    def get_can_grade(self, obj) -> bool:
        return policies.can_grade(self.context["request"].user, obj.course)


class AssignmentWriteSerializer(serializers.Serializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all(), required=False)
    lesson = serializers.PrimaryKeyRelatedField(queryset=Lesson.objects.all(), allow_null=True, required=False)
    title = serializers.CharField(max_length=160, required=False)
    instructions = serializers.CharField(required=False, allow_blank=True, max_length=50_000)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    allow_late = serializers.BooleanField(required=False)
    accepts_text = serializers.BooleanField(required=False)
    accepts_file = serializers.BooleanField(required=False)
    max_points = serializers.IntegerField(min_value=1, max_value=1000, required=False)
    is_published = serializers.BooleanField(required=False)

    def validate_title(self, value):
        value = " ".join(sanitize.clean_plain_text(value).split())
        if not value:
            raise serializers.ValidationError("Enter a title.")
        return value

    def validate_instructions(self, value):
        cleaned = sanitize.clean_rich_text(value)
        return "" if sanitize.rich_text_is_empty(cleaned) else cleaned

    def validate(self, attrs):
        creating = self.instance is None and self.context.get("creating", False)
        if creating:
            for name in ("course", "title"):
                if name not in attrs:
                    raise serializers.ValidationError({name: ["This field is required."]})
        elif "course" in attrs:
            raise serializers.ValidationError({"course": ["An assignment cannot move to another course."]})
        due = attrs.get("due_at")
        if creating and due is not None and due < timezone.now():
            raise serializers.ValidationError({"due_at": ["The due time is in the past."]})
        return attrs


class AdminSubmissionSerializer(serializers.ModelSerializer):
    user = EnrollmentUserSerializer()
    has_file = serializers.SerializerMethodField()
    graded_by_name = serializers.CharField(source="graded_by.full_name", default="", read_only=True)

    class Meta:
        model = Submission
        fields = [
            "id",
            "user",
            "status",
            "text",
            "has_file",
            "original_name",
            "mime_type",
            "size_bytes",
            "attempt",
            "submitted_at",
            "is_late",
            "points",
            "feedback",
            "graded_by_name",
            "graded_at",
        ]

    def get_has_file(self, obj) -> bool:
        return bool(obj.file)


class GradeSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=[Submission.Status.GRADED, Submission.Status.RETURNED])
    points = serializers.IntegerField(min_value=0, max_value=1000, required=False, allow_null=True, default=None)
    feedback = serializers.CharField(required=False, allow_blank=True, default="", max_length=5000)


class AssignmentCourseOptionSerializer(serializers.ModelSerializer):
    lessons = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ["id", "title", "slug", "status", "lessons"]

    @extend_schema_field(LessonRefSerializer(many=True))
    def get_lessons(self, obj):
        # The view prefetches `lessons` in curriculum order.
        return [{"id": lesson.pk, "title": lesson.title} for lesson in obj.lessons.all()]
