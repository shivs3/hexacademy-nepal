"""In-app notices for a learner or staff member (class reminders, schedule
changes, graded work, certificates). Each row belongs to one user and is only
ever served to that user.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q


class Notification(models.Model):
    class Kind(models.TextChoices):
        CLASS_REMINDER = "class_reminder", "Class reminder"
        CLASS_RESCHEDULED = "class_rescheduled", "Class rescheduled"
        CLASS_CANCELLED = "class_cancelled", "Class cancelled"
        CLASS_RECORDING = "class_recording", "Recording available"
        SUBMISSION_GRADED = "submission_graded", "Assignment graded"
        SUBMISSION_RETURNED = "submission_returned", "Assignment returned for revision"
        CERTIFICATE_ISSUED = "certificate_issued", "Certificate issued"
        GENERAL = "general", "General"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=30, choices=Kind.choices)
    title = models.CharField(max_length=160)
    body = models.CharField(max_length=500, blank=True)
    # A path inside the site (e.g. /dashboard/classes); never an external URL.
    link = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    emailed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "read_at", "-created_at"])]
        constraints = [
            models.CheckConstraint(
                condition=Q(link="") | (Q(link__startswith="/") & ~Q(link__startswith="//")),
                name="notifications_link_is_internal",
            )
        ]

    def __str__(self):
        return f"{self.kind} for {self.user_id}"
