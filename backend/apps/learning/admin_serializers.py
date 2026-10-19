from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Course
from apps.catalog.services import ordered_lessons

from .models import Enrollment


class EnrollmentUserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()


class EnrollmentCourseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    slug = serializers.CharField()


class EnrollmentCourseOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "title", "slug", "status"]


class AdminEnrollmentSerializer(serializers.ModelSerializer):
    """Relies on `completed_count` and `lesson_total` annotations (see admin_views)."""

    user = EnrollmentUserSerializer()
    course = EnrollmentCourseSerializer()
    granted_by_name = serializers.CharField(source="granted_by.full_name", default="", read_only=True)
    completed_lessons = serializers.IntegerField(source="completed_count")
    total_lessons = serializers.IntegerField(source="lesson_total")
    percent = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = ["id", "user", "course", "status", "source", "enrolled_at", "completed_at", "revoked_at",
                  "last_accessed_at", "granted_by_name", "completed_lessons", "total_lessons", "percent"]  # fmt: skip

    def get_percent(self, obj) -> int:
        return round(100 * obj.completed_count / obj.lesson_total) if obj.lesson_total else 0


class LessonProgressRowSerializer(serializers.Serializer):
    lesson_id = serializers.IntegerField()
    title = serializers.CharField()
    module_title = serializers.CharField()
    first_viewed_at = serializers.DateTimeField(allow_null=True)
    completed_at = serializers.DateTimeField(allow_null=True)


class AdminEnrollmentDetailSerializer(AdminEnrollmentSerializer):
    lessons = serializers.SerializerMethodField()

    class Meta(AdminEnrollmentSerializer.Meta):
        fields = [*AdminEnrollmentSerializer.Meta.fields, "lessons"]

    @extend_schema_field(LessonProgressRowSerializer(many=True))
    def get_lessons(self, obj):
        progress = {p.lesson_id: p for p in obj.progress.all()}
        rows = []
        for lesson in ordered_lessons(obj.course):
            record = progress.get(lesson.pk)
            rows.append(
                {
                    "lesson_id": lesson.pk,
                    "title": lesson.title,
                    "module_title": lesson.module.title,
                    "first_viewed_at": record.first_viewed_at if record else None,
                    "completed_at": record.completed_at if record else None,
                }
            )
        return rows


class GrantSerializer(serializers.Serializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.exclude(status=Course.Status.DRAFT))
    email = serializers.EmailField()

    def validate_email(self, value):
        user = get_user_model().objects.filter(email__iexact=value.strip()).first()
        if user is None:
            raise serializers.ValidationError("No account uses this email address.")
        if not user.is_active:
            raise serializers.ValidationError("This account is deactivated.")
        return user
