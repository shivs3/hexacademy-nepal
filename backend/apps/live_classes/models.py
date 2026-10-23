"""Live classes: cohorts (batches) of a course, their scheduled sessions on
Google Meet or Zoom, and attendance.

Hexacademy does not host video. A session stores the provider and the meeting
link the instructor created in their Meet or Zoom account (ADR-033). The link
and passcode are private: they are only returned by the join endpoint, to
eligible learners, close to the start time.

All timestamps are timezone-aware (UTC in the database) and shown in Nepal
time by the clients.
"""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.catalog.models import Course
from common.models import TimeStampedModel


class Batch(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    # PROTECT: a course with cohorts is archived, never deleted.
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="batches")
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=500, blank=True)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True, help_text="Empty for no limit.")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "batches"
        constraints = [
            models.UniqueConstraint(fields=["course", "name"], name="live_classes_batch_unique_name"),
            models.CheckConstraint(
                condition=Q(starts_on__isnull=True) | Q(ends_on__isnull=True) | Q(ends_on__gte=F("starts_on")),
                name="live_classes_batch_dates_ordered",
            ),
            models.CheckConstraint(
                condition=Q(capacity__isnull=True) | Q(capacity__gte=1), name="live_classes_batch_capacity_positive"
            ),
        ]
        permissions = [
            ("manage_all_classes", "Can manage every batch, live session and attendance record"),
            ("view_all_classes", "Can view every batch and live session (not meeting links)"),
            ("teach_assigned_classes", "Can schedule live classes for the courses they teach"),
        ]

    def __str__(self):
        return self.name


class BatchMembership(TimeStampedModel):
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="batch_memberships")
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [models.UniqueConstraint(fields=["batch", "user"], name="live_classes_membership_unique")]

    def __str__(self):
        return f"{self.user_id} in batch {self.batch_id}"


class ClassSession(TimeStampedModel):
    class Provider(models.TextChoices):
        GOOGLE_MEET = "google_meet", "Google Meet"
        ZOOM = "zoom", "Zoom"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        CANCELLED = "cancelled", "Cancelled"

    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name="sessions")
    title = models.CharField(max_length=160)
    description = models.CharField(max_length=1000, blank=True)
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField()
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="taught_sessions"
    )
    provider = models.CharField(max_length=20, choices=Provider.choices)
    # Private meeting details: only served by the join endpoint.
    join_url = models.URLField(max_length=500)
    external_meeting_id = models.CharField(max_length=100, blank=True)
    passcode = models.CharField(max_length=50, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    # Sessions created together as a weekly series share an id.
    series_id = models.UUIDField(null=True, blank=True, db_index=True)
    original_starts_at = models.DateTimeField(null=True, blank=True, help_text="Set on the first reschedule.")
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    recording_url = models.URLField(max_length=500, blank=True)
    notes = models.CharField(max_length=2000, blank=True, help_text="Shown to learners after the class.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["starts_at", "id"]
        indexes = [models.Index(fields=["batch", "starts_at"]), models.Index(fields=["status", "starts_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")), name="live_classes_session_ends_after_start"
            ),
            models.CheckConstraint(
                condition=~Q(status="cancelled") | Q(cancelled_at__isnull=False),
                name="live_classes_session_cancelled_has_date",
            ),
        ]

    def __str__(self):
        return self.title

    @staticmethod
    def new_series_id():
        return uuid.uuid4()


class AttendanceRecord(models.Model):
    """One row per learner per session. `joined_at` is when the learner used
    the join button here; it is evidence, not attendance. Attendance is what
    the instructor or teaching assistant marks (`status`)."""

    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        LATE = "late", "Late"
        ABSENT = "absent", "Absent"
        EXCUSED = "excused", "Excused"

    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name="attendance")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendance_records")
    joined_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, blank=True)
    note = models.CharField(max_length=300, blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    marked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session", "user"], name="live_classes_attendance_unique"),
            models.CheckConstraint(
                condition=Q(status="") | Q(marked_at__isnull=False), name="live_classes_attendance_marked_has_date"
            ),
        ]

    def __str__(self):
        return f"{self.user_id} at {self.session_id}: {self.status or 'unmarked'}"
