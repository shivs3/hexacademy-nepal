from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.catalog.models import Course

from . import policies
from .models import AttendanceRecord, Batch, BatchMembership, ClassSession
from .serializers import STATES, SessionCourseSerializer, session_state

User = get_user_model()


class PersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField()


class BatchSerializer(serializers.ModelSerializer):
    """Expects `member_count`, `upcoming_count` and `next_session_at` annotations."""

    course = SessionCourseSerializer()
    member_count = serializers.IntegerField(read_only=True)
    upcoming_count = serializers.IntegerField(read_only=True)
    next_session_at = serializers.DateTimeField(read_only=True, allow_null=True)
    can_schedule = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = ["id", "course", "name", "description", "starts_on", "ends_on", "capacity", "status",
                  "member_count", "upcoming_count", "next_session_at", "can_schedule", "created_at"]  # fmt: skip

    def get_can_schedule(self, obj) -> bool:
        return policies.can_schedule(self.context["request"].user, obj.course)


class BatchWriteSerializer(serializers.ModelSerializer):
    course = serializers.PrimaryKeyRelatedField(queryset=Course.objects.all())

    class Meta:
        model = Batch
        fields = ["course", "name", "description", "starts_on", "ends_on", "capacity", "status"]
        extra_kwargs = {"status": {"required": False}}
        validators: list = []  # the service reports a duplicate name on the `name` field

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the batch a name.")
        return value

    def validate(self, attrs):
        starts = attrs.get("starts_on", getattr(self.instance, "starts_on", None))
        ends = attrs.get("ends_on", getattr(self.instance, "ends_on", None))
        if starts and ends and ends < starts:
            raise serializers.ValidationError({"ends_on": "The batch must end on or after its start date."})
        if self.instance is not None and "course" in attrs and attrs["course"] != self.instance.course:
            raise serializers.ValidationError({"course": "A batch cannot move to another course."})
        return attrs


class MemberSerializer(serializers.ModelSerializer):
    """Expects an `enrolled` annotation (active enrollment in the batch's course)."""

    user = PersonSerializer()
    enrolled = serializers.BooleanField(read_only=True)
    added_at = serializers.DateTimeField(source="created_at")

    class Meta:
        model = BatchMembership
        fields = ["id", "user", "enrolled", "added_at"]


class AddMembersSerializer(serializers.Serializer):
    emails = serializers.ListField(
        child=serializers.EmailField(), min_length=1, max_length=200, required=False, default=list
    )
    all_enrolled = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if not attrs["all_enrolled"] and not attrs["emails"]:
            raise serializers.ValidationError({"emails": "Enter at least one email address."})
        return attrs


class AddMembersResultSerializer(serializers.Serializer):
    added = serializers.IntegerField()
    already_members = serializers.IntegerField()
    not_enrolled = serializers.ListField(child=serializers.EmailField())
    unknown = serializers.ListField(child=serializers.EmailField())


class AttendanceSummarySerializer(serializers.Serializer):
    present = serializers.IntegerField()
    late = serializers.IntegerField()
    absent = serializers.IntegerField()
    excused = serializers.IntegerField()
    joined = serializers.IntegerField()


class BatchRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class AdminSessionSerializer(serializers.ModelSerializer):
    """The meeting link, passcode and meeting ID are blank for staff who may
    not see them (support staff, other read-only roles)."""

    batch = BatchRefSerializer()
    course = SessionCourseSerializer(source="batch.course")
    instructor = PersonSerializer(allow_null=True)
    provider_label = serializers.CharField(source="get_provider_display")
    state = serializers.SerializerMethodField()
    join_url = serializers.SerializerMethodField()
    passcode = serializers.SerializerMethodField()
    external_meeting_id = serializers.SerializerMethodField()
    can_schedule = serializers.SerializerMethodField()
    can_take_attendance = serializers.SerializerMethodField()

    class Meta:
        model = ClassSession
        fields = ["id", "batch", "course", "title", "description", "starts_at", "ends_at", "instructor", "provider",
                  "provider_label", "status", "state", "cancelled_at", "cancel_reason", "series_id",
                  "original_starts_at", "reminder_sent_at", "recording_url", "notes", "join_url", "passcode",
                  "external_meeting_id", "can_schedule", "can_take_attendance", "created_at"]  # fmt: skip

    def _user(self):
        return self.context["request"].user

    def _show(self, obj) -> bool:
        return policies.can_see_meeting_details(self._user(), obj.batch.course)

    @extend_schema_field(serializers.ChoiceField(choices=STATES))
    def get_state(self, obj) -> str:
        return session_state(obj)

    def get_join_url(self, obj) -> str:
        return obj.join_url if self._show(obj) else ""

    def get_passcode(self, obj) -> str:
        return obj.passcode if self._show(obj) else ""

    def get_external_meeting_id(self, obj) -> str:
        return obj.external_meeting_id if self._show(obj) else ""

    def get_can_schedule(self, obj) -> bool:
        return policies.can_schedule(self._user(), obj.batch.course)

    def get_can_take_attendance(self, obj) -> bool:
        return policies.can_take_attendance(self._user(), obj.batch.course)


class SessionCreateSerializer(serializers.Serializer):
    batch = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.select_related("course"))
    title = serializers.CharField(max_length=140)
    description = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    instructor = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True), allow_null=True)
    provider = serializers.ChoiceField(choices=ClassSession.Provider.choices)
    join_url = serializers.CharField(max_length=500)
    passcode = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    repeat_weeks = serializers.IntegerField(min_value=1, max_value=26, default=1)


class SessionUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160, required=False)
    description = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    starts_at = serializers.DateTimeField(required=False)
    ends_at = serializers.DateTimeField(required=False)
    instructor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), allow_null=True, required=False
    )
    provider = serializers.ChoiceField(choices=ClassSession.Provider.choices, required=False)
    join_url = serializers.CharField(max_length=500, required=False)
    passcode = serializers.CharField(max_length=50, required=False, allow_blank=True)
    recording_url = serializers.URLField(max_length=500, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    def validate_recording_url(self, value):
        if value and not value.startswith("https://"):
            raise serializers.ValidationError("Use an https:// link.")
        return value


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AttendanceEntrySerializer(serializers.Serializer):
    user = serializers.IntegerField(min_value=1)
    status = serializers.ChoiceField(choices=[*AttendanceRecord.Status.choices, ("", "Not marked")])
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AttendanceUpdateSerializer(serializers.Serializer):
    entries = AttendanceEntrySerializer(many=True, max_length=500)


class RosterRowSerializer(serializers.Serializer):
    user = PersonSerializer()
    is_member = serializers.BooleanField()
    joined_at = serializers.DateTimeField(source="record.joined_at", default=None, allow_null=True)
    status = serializers.CharField(source="record.status", default="")
    note = serializers.CharField(source="record.note", default="")
    marked_by_name = serializers.CharField(source="record.marked_by.full_name", default="")
    marked_at = serializers.DateTimeField(source="record.marked_at", default=None, allow_null=True)


class ClassTeamMemberSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="user.id")
    full_name = serializers.CharField(source="user.full_name")
    email = serializers.EmailField(source="user.email")
    role = serializers.CharField()


class ScheduleCourseOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "title", "slug", "status"]
