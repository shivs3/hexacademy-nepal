"""Certificates of completion.

Each course may have one `CertificateRule` that says which template to use and
what a learner must achieve: complete every published lesson, pass a chosen
exam (finalised attempt, released result), and/or have every published
assignment graded. The server evaluates these from its own records and issues
the certificate (ADR-040). Nothing a browser reports is trusted.

A certificate snapshots the recipient's name and the course title at issue
time, so later renames do not alter an issued document. The PDF is rendered on
request from these fields, so no binary is stored.
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.assessments.models import Exam
from apps.catalog.models import Course
from common.models import TimeStampedModel


class CertificateTemplate(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True, help_text="Internal name shown to staff.")
    heading = models.CharField(max_length=120, default="Certificate of Completion")
    statement = models.CharField(
        max_length=300,
        default="has successfully completed the course",
        help_text="Printed between the learner's name and the course title.",
    )
    signatory_name = models.CharField(max_length=120, blank=True)
    signatory_title = models.CharField(max_length=120, blank=True)
    footer_note = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["name"]
        permissions = [
            ("manage_certificates", "Can manage certificate templates and rules, and revoke certificates"),
            ("view_certificates", "Can view every issued certificate"),
        ]

    def __str__(self):
        return self.name


class CertificateRule(TimeStampedModel):
    course = models.OneToOneField(Course, on_delete=models.CASCADE, related_name="certificate_rule")
    is_enabled = models.BooleanField(default=False)
    # PROTECT: a template in use is replaced on the rule before it is deleted.
    template = models.ForeignKey(CertificateTemplate, on_delete=models.PROTECT, related_name="rules")
    require_lessons = models.BooleanField(default=True, help_text="Every published lesson completed.")
    required_exam = models.ForeignKey(
        Exam, null=True, blank=True, on_delete=models.PROTECT, related_name="certificate_rules"
    )
    require_assignments = models.BooleanField(default=False, help_text="Every published assignment graded.")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["course__title"]

    def __str__(self):
        return f"Certificate rule for {self.course_id}"


class Certificate(TimeStampedModel):
    class Status(models.TextChoices):
        VALID = "valid", "Valid"
        REVOKED = "revoked", "Revoked"

    number = models.CharField(max_length=32, unique=True)
    # PROTECT: issued certificates are revoked, never deleted with their owner or course.
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="certificates")
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="certificates")
    template = models.ForeignKey(CertificateTemplate, on_delete=models.PROTECT, related_name="certificates")
    recipient_name = models.CharField(max_length=200)
    course_title = models.CharField(max_length=200)
    issued_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.VALID, db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=300, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-issued_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["user", "course"], name="certificates_one_per_course"),
            models.CheckConstraint(
                condition=~Q(status="revoked") | Q(revoked_at__isnull=False),
                name="certificates_revoked_has_date",
            ),
        ]

    def __str__(self):
        return self.number
