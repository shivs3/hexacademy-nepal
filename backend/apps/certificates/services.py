"""Certificate eligibility, issuing and revocation.

Eligibility is computed only from server records: the enrollment's
`completed_at` (set by `learning.services.record_progress`), finalised exam
attempts whose results are released, and graded submissions. `issue_if_eligible`
is idempotent: the unique (user, course) constraint and a row lock on the
enrollment make concurrent triggers issue at most one certificate.

Triggers: lesson completion, exam finalisation, manual result publication,
assignment grading (each via `transaction.on_commit`), the learner's claim
endpoint, and the staff "issue to eligible learners" action.
"""

import logging
import secrets
from dataclasses import dataclass, field

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.assessments.models import Exam, ExamAttempt
from apps.assessments.results import results_released
from apps.audit import services as audit
from apps.catalog.models import Course
from apps.learning.models import Assignment, Enrollment, Submission
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from common.exceptions import ConflictError, DomainError

from .models import Certificate, CertificateRule

logger = logging.getLogger(__name__)

# Crockford base32 without I, L, O, U: unambiguous when read aloud or typed.
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_number(now=None) -> str:
    year = timezone.localtime(now or timezone.now()).year
    return f"HXN-{year}-{''.join(secrets.choice(_ALPHABET) for _ in range(8))}"


@dataclass
class Requirement:
    key: str
    label: str
    met: bool


@dataclass
class Eligibility:
    offered: bool
    eligible: bool = False
    requirements: list[Requirement] = field(default_factory=list)
    certificate: Certificate | None = None


def _exam_passed(user, exam: Exam) -> bool:
    if not results_released(exam):
        return False
    return ExamAttempt.objects.filter(
        user=user,
        exam=exam,
        passed=True,
        graded_at__isnull=False,
        status__in=[ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.EXPIRED],
    ).exists()


def _assignments_graded(user, course: Course) -> bool:
    published = Assignment.objects.filter(course=course, is_published=True)
    graded = Submission.objects.filter(user=user, assignment__in=published, status=Submission.Status.GRADED).count()
    return graded == published.count()


def evaluate(user, course: Course) -> Eligibility:
    rule = CertificateRule.objects.select_related("required_exam").filter(course=course).first()
    certificate = Certificate.objects.filter(user=user, course=course).first()
    if rule is None or not rule.is_enabled:
        return Eligibility(offered=False, certificate=certificate)
    enrollment = Enrollment.objects.filter(user=user, course=course, status=Enrollment.Status.ACTIVE).first()
    reqs = [Requirement("enrolled", "Active enrollment in the course", enrollment is not None)]
    if rule.require_lessons:
        reqs.append(Requirement("lessons", "Complete every lesson", bool(enrollment and enrollment.completed_at)))
    if rule.required_exam_id:
        exam = rule.required_exam
        reqs.append(Requirement("exam", f"Pass the exam “{exam.title}”", _exam_passed(user, exam)))
    if rule.require_assignments:
        reqs.append(Requirement("assignments", "Every assignment graded", _assignments_graded(user, course)))
    return Eligibility(offered=True, eligible=all(r.met for r in reqs), requirements=reqs, certificate=certificate)


def issue_if_eligible(user, course: Course) -> Certificate | None:
    """Issue the certificate if the rule is met. Returns the new certificate,
    or None when the learner is not eligible or already has one."""
    with transaction.atomic():
        # Serialise triggers for the same learner and course.
        if not Enrollment.objects.select_for_update().filter(user=user, course=course).exists():
            return None
        if Certificate.objects.filter(user=user, course=course).exists():
            return None
        result = evaluate(user, course)
        if not result.eligible:
            return None
        rule = CertificateRule.objects.select_related("template").get(course=course)
        now = timezone.now()
        for _ in range(5):
            try:
                with transaction.atomic():
                    cert = Certificate.objects.create(
                        number=new_number(now),
                        user=user,
                        course=course,
                        template=rule.template,
                        recipient_name=(user.full_name or user.email)[:200],
                        course_title=course.title[:200],
                        issued_at=now,
                    )
                break
            except IntegrityError:
                if Certificate.objects.filter(user=user, course=course).exists():
                    return None
        else:  # pragma: no cover - 32^8 numbers per year
            raise DomainError("Could not allocate a certificate number.", code="number_exhausted")
        audit.record("certificates.issued", actor=None, target=cert, user=user.pk, course=course.pk)
        notifications.notify(
            [user],
            kind=Notification.Kind.CERTIFICATE_ISSUED,
            title=f"Certificate issued: {course.title}",
            body=f"Certificate number {cert.number}.",
            link="/dashboard/certificates",
            email=True,
        )
        return cert


def _safe_issue(user_id: int, course_id: int):
    try:
        user = get_user_model().objects.get(pk=user_id)
        course = Course.objects.get(pk=course_id)
        issue_if_eligible(user, course)
    except Exception:  # a failed check must never break the action that triggered it
        logger.exception("Certificate check failed for user %s, course %s", user_id, course_id)


def check_after_commit(user_id: int, course_id: int | None):
    """Schedule an eligibility check once the current transaction commits."""
    if course_id is None:
        return
    if not CertificateRule.objects.filter(course_id=course_id, is_enabled=True).exists():
        return
    transaction.on_commit(lambda: _safe_issue(user_id, course_id))


def issue_to_eligible(course: Course, *, actor, request=None) -> int:
    """Staff action: check every active learner of a course (for example after
    a rule change or after results are published)."""
    users = (
        get_user_model()
        .objects.filter(enrollments__course=course, enrollments__status=Enrollment.Status.ACTIVE)
        .exclude(certificates__course=course)
    )
    issued = sum(1 for user in users if issue_if_eligible(user, course))
    audit.record("certificates.bulk_check", actor=actor, target=course, request=request, issued=issued)
    return issued


def on_results_published(exam: Exam):
    """Results for a manual-release exam just became visible."""
    if exam.course_id is None:
        return
    if not CertificateRule.objects.filter(course_id=exam.course_id, required_exam=exam, is_enabled=True).exists():
        return
    user_ids = set(exam.attempts.filter(passed=True).values_list("user_id", flat=True))
    for uid in user_ids:
        check_after_commit(uid, exam.course_id)


@transaction.atomic
def revoke(cert: Certificate, *, reason: str, actor, request=None) -> Certificate:
    cert = Certificate.objects.select_for_update().get(pk=cert.pk)
    reason = (reason or "").replace("\x00", "").strip()
    if not reason:
        raise ValidationError({"reason": ["Give a reason. It is kept in the audit log."]})
    if cert.status == Certificate.Status.REVOKED:
        raise ConflictError("This certificate is already revoked.", code="already_revoked")
    cert.status = Certificate.Status.REVOKED
    cert.revoked_at, cert.revoked_reason, cert.revoked_by = timezone.now(), reason[:300], actor
    cert.save(update_fields=["status", "revoked_at", "revoked_reason", "revoked_by", "updated_at"])
    audit.record("certificates.revoked", actor=actor, target=cert, request=request, reason=cert.revoked_reason)
    return cert


@transaction.atomic
def reinstate(cert: Certificate, *, actor, request=None) -> Certificate:
    cert = Certificate.objects.select_for_update().get(pk=cert.pk)
    if cert.status != Certificate.Status.REVOKED:
        raise ConflictError("This certificate is not revoked.", code="not_revoked")
    cert.status = Certificate.Status.VALID
    cert.revoked_at, cert.revoked_reason, cert.revoked_by = None, "", None
    cert.save(update_fields=["status", "revoked_at", "revoked_reason", "revoked_by", "updated_at"])
    audit.record("certificates.reinstated", actor=actor, target=cert, request=request)
    return cert


def validate_rule(
    course: Course, *, required_exam: Exam | None, is_enabled: bool, require_lessons: bool, require_assignments: bool
):
    if required_exam is not None and required_exam.course_id != course.pk:
        raise ValidationError({"required_exam": ["Choose an exam that belongs to this course."]})
    if required_exam is not None and required_exam.pass_marks is None:
        raise ValidationError({"required_exam": ["This exam has no pass mark, so nobody can pass it."]})
    if is_enabled and not (require_lessons or required_exam or require_assignments):
        raise ValidationError({"is_enabled": ["Choose at least one requirement before enabling certificates."]})
