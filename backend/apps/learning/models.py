"""Learner state: who may study which course, and how far they have got.

Access to lesson content is decided only by an active Enrollment (or a public
preview lesson); progress is recorded server-side so it follows the learner
across devices.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.catalog.models import Course, Lesson
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
