"""Learner-facing serializers. They never carry the meeting link or passcode;
those come only from the join endpoint (JoinSerializer)."""

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from . import services
from .models import AttendanceRecord, ClassSession

STATES = ["cancelled", "upcoming", "live", "ended"]


def session_state(session: ClassSession, now=None) -> str:
    now = now or timezone.now()
    if session.status == ClassSession.Status.CANCELLED:
        return "cancelled"
    if now < session.starts_at:
        return "upcoming"
    return "live" if now <= session.ends_at else "ended"


class SessionCourseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    slug = serializers.CharField()


class LearnerSessionSerializer(serializers.ModelSerializer):
    """Expects `my_attendance` in context: {session_id: AttendanceRecord}."""

    course = SessionCourseSerializer(source="batch.course")
    batch_name = serializers.CharField(source="batch.name")
    provider_label = serializers.CharField(source="get_provider_display")
    instructor_name = serializers.CharField(source="instructor.full_name", default="")
    state = serializers.SerializerMethodField()
    join_opens_at = serializers.SerializerMethodField()
    recording_url = serializers.SerializerMethodField()
    notes = serializers.SerializerMethodField()
    attendance = serializers.SerializerMethodField()
    joined_at = serializers.SerializerMethodField()

    class Meta:
        model = ClassSession
        fields = ["id", "title", "description", "course", "batch_name", "starts_at", "ends_at", "provider",
                  "provider_label", "instructor_name", "status", "state", "cancel_reason", "original_starts_at",
                  "join_opens_at", "recording_url", "notes", "attendance", "joined_at"]  # fmt: skip

    def _record(self, obj) -> AttendanceRecord | None:
        return self.context.get("my_attendance", {}).get(obj.pk)

    @extend_schema_field(serializers.ChoiceField(choices=STATES))
    def get_state(self, obj) -> str:
        return session_state(obj, self.context.get("now"))

    def get_join_opens_at(self, obj) -> str:
        return services.join_window(obj)[0].isoformat()

    # Recordings and notes are for after the class.
    def get_recording_url(self, obj) -> str:
        return obj.recording_url if session_state(obj, self.context.get("now")) == "ended" else ""

    def get_notes(self, obj) -> str:
        return obj.notes if session_state(obj, self.context.get("now")) == "ended" else ""

    @extend_schema_field(serializers.ChoiceField(choices=[*AttendanceRecord.Status.values, ""]))
    def get_attendance(self, obj) -> str:
        record = self._record(obj)
        return record.status if record else ""

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_joined_at(self, obj):
        record = self._record(obj)
        return record.joined_at.isoformat() if record and record.joined_at else None


class JoinSerializer(serializers.Serializer):
    provider = serializers.CharField()
    join_url = serializers.URLField()
    passcode = serializers.CharField(allow_blank=True)
