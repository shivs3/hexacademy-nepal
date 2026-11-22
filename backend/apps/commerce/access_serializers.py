from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.assessments.models import Exam, ExamAccess
from apps.catalog.models import Course
from apps.learning.models import Enrollment
from apps.live_classes.models import BatchMembership

from .models import AccessRequest
from .serializers import MONEY


def _plain(value: str, limit: int) -> str:
    value = (value or "").replace("\x00", "").strip()
    if len(value) > limit:
        raise serializers.ValidationError(f"Keep this under {limit} characters.")
    return value


# --- Learner -------------------------------------------------------------------------


class AccessRequestInputSerializer(serializers.Serializer):
    course = serializers.SlugField(required=False, allow_blank=True)
    exam = serializers.SlugField(required=False, allow_blank=True)
    full_name = serializers.CharField(max_length=150)
    phone = serializers.RegexField(r"^\+?[0-9 ()-]{7,20}$", max_length=30, error_messages={
        "invalid": "Enter a phone number, digits only (a leading + is fine)."
    })  # fmt: skip
    payment_reference = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    message = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate_full_name(self, value):
        value = _plain(value, 150)
        if not value:
            raise serializers.ValidationError("Enter your full name.")
        return value

    def validate_payment_reference(self, value):
        return _plain(value, 120)

    def validate_message(self, value):
        return _plain(value, 2000)

    def validate(self, attrs):
        course, exam = attrs.get("course") or "", attrs.get("exam") or ""
        if bool(course) == bool(exam):
            raise serializers.ValidationError("Choose one course or one exam.")
        if course:
            attrs["course"] = Course.objects.filter(slug=course).first()
            attrs.pop("exam", None)
            if attrs["course"] is None:
                raise serializers.ValidationError({"course": "This course is not available."})
        else:
            attrs["exam"] = Exam.objects.filter(slug=exam).first()
            attrs.pop("course", None)
            if attrs["exam"] is None:
                raise serializers.ValidationError({"exam": "This exam is not available."})
        return attrs


class MyAccessRequestSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    item_slug = serializers.SerializerMethodField()

    class Meta:
        model = AccessRequest
        fields = [
            "number", "kind", "item_title", "item_slug", "price", "full_name", "phone", "payment_reference",
            "message", "status", "status_label", "staff_note", "created_at", "handled_at",
        ]  # fmt: skip

    def get_item_slug(self, obj) -> str:
        item = obj.course if obj.kind == AccessRequest.Kind.COURSE else obj.exam
        return item.slug if item else ""


class CheckoutItemSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=AccessRequest.Kind.choices)
    slug = serializers.CharField()
    title = serializers.CharField()
    price = serializers.DecimalField(**MONEY, help_text="What the learner pays now (the offer price while it lasts).")
    list_price = serializers.DecimalField(**MONEY, help_text="The actual price, before any offer.")
    pending_request = MyAccessRequestSerializer(allow_null=True)
    instructions = serializers.CharField(help_text="Sanitised rich text: how to pay.")


# --- Staff ---------------------------------------------------------------------------


class RequestUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()


class AdminAccessRequestSerializer(serializers.ModelSerializer):
    user = RequestUserSerializer()
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    handled_by_name = serializers.CharField(source="handled_by.full_name", default="", read_only=True)
    item_id = serializers.SerializerMethodField()

    class Meta:
        model = AccessRequest
        fields = [
            "id", "number", "user", "kind", "item_id", "item_title", "price", "full_name", "phone",
            "payment_reference", "message", "status", "status_label", "staff_note", "handled_by_name",
            "handled_at", "created_at",
        ]  # fmt: skip

    def get_item_id(self, obj) -> int | None:
        return obj.course_id if obj.kind == AccessRequest.Kind.COURSE else obj.exam_id


class DecisionSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")

    def validate_note(self, value):
        return _plain(value, 1000)


class AccessUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ["id", "full_name", "email", "is_active", "email_verified", "date_joined"]


class AccessEnrollmentSerializer(serializers.ModelSerializer):
    course_id = serializers.IntegerField(source="course.id")
    course_title = serializers.CharField(source="course.title")
    course_slug = serializers.CharField(source="course.slug")
    granted_by_name = serializers.CharField(source="granted_by.full_name", default="")

    class Meta:
        model = Enrollment
        fields = [
            "id", "course_id", "course_title", "course_slug", "status", "source", "enrolled_at", "revoked_at",
            "completed_at", "granted_by_name",
        ]  # fmt: skip


class AccessExamSerializer(serializers.ModelSerializer):
    exam_id = serializers.IntegerField(source="exam.id")
    exam_title = serializers.CharField(source="exam.title")
    exam_price = serializers.DecimalField(source="exam.price", **MONEY)
    granted_by_name = serializers.CharField(source="granted_by.full_name", default="")

    class Meta:
        model = ExamAccess
        fields = ["id", "exam_id", "exam_title", "exam_price", "status", "source", "granted_at", "revoked_at",
                  "granted_by_name"]  # fmt: skip


class AccessBatchSerializer(serializers.ModelSerializer):
    batch_id = serializers.IntegerField(source="batch.id")
    batch_name = serializers.CharField(source="batch.name")
    course_title = serializers.CharField(source="batch.course.title")

    class Meta:
        model = BatchMembership
        fields = ["id", "batch_id", "batch_name", "course_title", "created_at"]


class UserAccessSerializer(serializers.Serializer):
    user = AccessUserSerializer()
    enrollments = AccessEnrollmentSerializer(many=True)
    exam_access = AccessExamSerializer(many=True)
    batches = AccessBatchSerializer(many=True)
    requests = AdminAccessRequestSerializer(many=True)


class GrantExamSerializer(serializers.Serializer):
    # Staff may grant any published exam, course-only ones included.
    exam = serializers.PrimaryKeyRelatedField(queryset=Exam.objects.filter(status=Exam.Status.PUBLISHED))


MAX_ASSIGN_USERS = 100


class AssignAccessSerializer(serializers.Serializer):
    users = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.filter(is_active=True), many=True, allow_empty=False
    )
    courses = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.exclude(status=Course.Status.DRAFT), many=True, required=False, default=list
    )
    exams = serializers.PrimaryKeyRelatedField(
        queryset=Exam.objects.filter(status=Exam.Status.PUBLISHED), many=True, required=False, default=list
    )

    def validate_users(self, users):
        if len(users) > MAX_ASSIGN_USERS:
            raise serializers.ValidationError(f"Assign to at most {MAX_ASSIGN_USERS} people at a time.")
        return list({u.pk: u for u in users}.values())

    def validate(self, attrs):
        attrs["courses"] = list({c.pk: c for c in attrs["courses"]}.values())
        attrs["exams"] = list({e.pk: e for e in attrs["exams"]}.values())
        if not attrs["courses"] and not attrs["exams"]:
            raise serializers.ValidationError({"courses": "Choose at least one course or exam."})
        return attrs


class AccessPersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()


class AssignResultSerializer(serializers.Serializer):
    user = serializers.IntegerField()
    user_name = serializers.CharField()
    kind = serializers.ChoiceField(choices=["course", "exam"])
    item = serializers.IntegerField()
    title = serializers.CharField()
    added = serializers.BooleanField(help_text="False when the person already had it.")


class AssignAccessResultSerializer(serializers.Serializer):
    added = serializers.IntegerField()
    already_had = serializers.IntegerField()
    results = AssignResultSerializer(many=True)


class AccessOptionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    price = serializers.DecimalField(**MONEY)
    detail = serializers.CharField(allow_blank=True)


class AccessOptionsSerializer(serializers.Serializer):
    courses = AccessOptionSerializer(many=True)
    exams = AccessOptionSerializer(many=True)
    batches = AccessOptionSerializer(many=True)
