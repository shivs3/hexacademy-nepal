from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Course, Lesson, LessonResource
from apps.cms import sanitize
from apps.cms.media import media_payload
from apps.cms.serializers import MediaRefSerializer

from .models import Enrollment


class ProgressSerializer(serializers.Serializer):
    total_lessons = serializers.IntegerField()
    completed_lessons = serializers.IntegerField()
    percent = serializers.IntegerField()
    next_lesson_id = serializers.IntegerField(allow_null=True)


class CourseBriefSerializer(serializers.ModelSerializer):
    thumbnail = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ["id", "slug", "title", "subtitle", "status", "thumbnail"]

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_thumbnail(self, obj):
        return media_payload(obj.thumbnail) if obj.thumbnail_id else None


class MyEnrollmentSerializer(serializers.ModelSerializer):
    course = CourseBriefSerializer()
    progress = serializers.SerializerMethodField()
    last_lesson_id = serializers.IntegerField(allow_null=True)

    class Meta:
        model = Enrollment
        fields = ["id", "status", "source", "enrolled_at", "completed_at", "last_accessed_at", "last_lesson_id",
                  "course", "progress"]  # fmt: skip

    @extend_schema_field(ProgressSerializer)
    def get_progress(self, obj):
        from .services import progress_summary

        # List views pass every row's summary in one batch (progress_summaries).
        batch = self.context.get("progress")
        return batch[obj.pk] if batch and obj.pk in batch else progress_summary(obj)


class PlayerLessonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    duration_minutes = serializers.IntegerField()
    is_preview = serializers.BooleanField()
    is_published = serializers.BooleanField()
    completed = serializers.BooleanField()
    locked = serializers.BooleanField()


class PlayerModuleSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    lessons = PlayerLessonSerializer(many=True)


class PlayerOutlineSerializer(serializers.Serializer):
    course = CourseBriefSerializer()
    sequential = serializers.BooleanField()
    staff_preview = serializers.BooleanField()
    enrollment_id = serializers.IntegerField(allow_null=True)
    progress = ProgressSerializer(allow_null=True)
    modules = PlayerModuleSerializer(many=True)


class LessonResourcePublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonResource
        fields = ["id", "title", "kind", "url", "original_name", "mime_type", "size_bytes"]


class LessonContentSerializer(serializers.ModelSerializer):
    """Full lesson content. Only serialised after `lesson_access` allowed it."""

    resources = LessonResourcePublicSerializer(many=True)
    video_embed_url = serializers.SerializerMethodField()
    module_title = serializers.CharField(source="module.title")
    course = CourseBriefSerializer()

    class Meta:
        model = Lesson
        fields = ["id", "title", "summary", "body", "video_embed_url", "duration_minutes", "is_preview",
                  "is_published", "module_id", "module_title", "course", "resources"]  # fmt: skip

    def get_video_embed_url(self, obj) -> str:
        try:
            return sanitize.video_embed_url(obj.video_url) if obj.video_url else ""
        except DjangoValidationError:
            return ""


class LessonViewSerializer(serializers.Serializer):
    lesson = LessonContentSerializer()
    completed = serializers.BooleanField()
    previous_lesson_id = serializers.IntegerField(allow_null=True)
    next_lesson_id = serializers.IntegerField(allow_null=True)
    staff_preview = serializers.BooleanField()
    enrolled = serializers.BooleanField()


class ProgressInputSerializer(serializers.Serializer):
    completed = serializers.BooleanField(required=False, allow_null=True, default=None)


class ProgressResultSerializer(serializers.Serializer):
    completed = serializers.BooleanField()
    course_completed = serializers.BooleanField()
    progress = ProgressSerializer()
