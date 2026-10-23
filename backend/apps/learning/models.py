"""Learner state: who may study which course, and how far they have got.

Access to lesson content is decided only by an active Enrollment (or a public
preview lesson); progress is recorded server-side so it follows the learner
across devices.
"""

import uuid
from pathlib import PurePosixPath

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.catalog.models import Course, Lesson, private_storage
from common.models import TimeStampedModel


class Enrollment(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        REVOKED = "revoked", "Revoked"

    class Source(models.TextChoices):
        FREE = "free", "Free enrollment"
        PURCHASE = "purchase", "Purchase"
        ADMIN = "admin", "Granted by staff"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments")
    # PROTECT: a course with learners is archived, never deleted.
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="enrollments")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    source = models.CharField(max_length=20, choices=Source.choices)
    enrolled_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    last_lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-enrolled_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "course"], name="learning_enrollment_unique"),
            models.CheckConstraint(
                condition=~Q(status="revoked") | Q(revoked_at__isnull=False),
                name="learning_enrollment_revoked_has_date",
            ),
        ]
        permissions = [
            ("manage_enrollments", "Can grant and revoke course enrollments"),
            ("view_learner_progress", "Can view enrollments and progress for every course"),
        ]

    def __str__(self):
        return f"{self.user_id} in {self.course_id}"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE


class LessonProgress(models.Model):
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="progress")
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="progress")
    first_viewed_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["enrollment", "lesson"], name="learning_progress_unique")]
        verbose_name_plural = "lesson progress"

    def __str__(self):
        return f"{self.enrollment_id}:{self.lesson_id}"


class Assignment(TimeStampedModel):
    """Work a learner hands in for a course, graded by its teaching team."""

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="assignments")
    # Optional: the lesson it belongs to. Removing the lesson keeps the assignment and its submissions.
    lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL, related_name="assignments")
    title = models.CharField(max_length=160)
    instructions = models.TextField(blank=True)  # sanitised rich text
    due_at = models.DateTimeField(null=True, blank=True)
    allow_late = models.BooleanField(default=True, help_text="Accept submissions after the due time (marked late).")
    accepts_text = models.BooleanField(default=True)
    accepts_file = models.BooleanField(default=True)
    max_points = models.PositiveSmallIntegerField(default=100)
    is_published = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = [F("due_at").asc(nulls_last=True), "id"]
        indexes = [models.Index(fields=["course", "is_published"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(accepts_text=True) | Q(accepts_file=True), name="learning_assignment_accepts_something"
            ),
            models.CheckConstraint(
                condition=Q(max_points__gte=1) & Q(max_points__lte=1000), name="learning_assignment_points_range"
            ),
        ]
        permissions = [("grade_all_submissions", "Can read and grade submissions in every course")]

    def __str__(self):
        return self.title


def submission_upload_to(instance: "Submission", filename: str) -> str:
    ext = PurePosixPath(filename).suffix.lower()[:10]
    return f"submissions/{instance.assignment.course_id}/{instance.assignment_id}/{uuid.uuid4().hex}{ext}"


class Submission(TimeStampedModel):
    """One per learner per assignment; a resubmission replaces the work and bumps `attempt`."""

    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        RETURNED = "returned", "Returned for revision"
        GRADED = "graded", "Graded"

    # PROTECT: an assignment with learner work is unpublished, not deleted.
    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name="submissions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="submissions")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED, db_index=True)
    text = models.TextField(blank=True)  # plain text, shown as-is
    # Private storage: served only through the authorised download endpoints.
    file = models.FileField(upload_to=submission_upload_to, storage=private_storage, max_length=255, blank=True)
    original_name = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    attempt = models.PositiveSmallIntegerField(default=1)
    submitted_at = models.DateTimeField(default=timezone.now)
    is_late = models.BooleanField(default=False)
    points = models.PositiveSmallIntegerField(null=True, blank=True)
    feedback = models.TextField(blank=True)  # plain text
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-submitted_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["assignment", "user"], name="learning_submission_unique"),
            models.CheckConstraint(condition=~Q(text="") | ~Q(file=""), name="learning_submission_not_empty"),
            models.CheckConstraint(
                condition=~Q(status="graded") | (Q(points__isnull=False) & Q(graded_at__isnull=False)),
                name="learning_submission_graded_has_points",
            ),
        ]
        indexes = [models.Index(fields=["assignment", "status"])]

    def __str__(self):
        return f"{self.user_id} on {self.assignment_id}"
