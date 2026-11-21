"""Who may take a paid standalone exam. Only staff grant or revoke access
(directly, or by approving an access request); both are audited."""

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit import services as audit
from common.exceptions import ConflictError, DomainError

from .models import Exam, ExamAccess


@transaction.atomic
def grant(user, exam: Exam, *, actor, source=ExamAccess.Source.STAFF, request=None) -> tuple[ExamAccess, bool]:
    """Give `user` access to `exam`. Returns (access, changed). Granting a
    revoked access restores it; granting an active one changes nothing."""
    if exam.status == Exam.Status.DRAFT:
        raise DomainError("Publish the exam before giving learners access.")
    now = timezone.now()
    access = ExamAccess.objects.select_for_update().filter(user=user, exam=exam).first()
    if access is None:
        try:
            with transaction.atomic():
                access = ExamAccess.objects.create(
                    user=user, exam=exam, source=source, granted_by=actor, granted_at=now
                )
        except IntegrityError:  # a concurrent grant won
            return ExamAccess.objects.get(user=user, exam=exam), False
    elif access.status == ExamAccess.Status.ACTIVE:
        return access, False
    else:
        access.status, access.source, access.granted_by = ExamAccess.Status.ACTIVE, source, actor
        access.granted_at, access.revoked_at = now, None
        access.save(update_fields=["status", "source", "granted_by", "granted_at", "revoked_at", "updated_at"])
    audit.record("assessments.exam_access_granted", actor=actor, target=access, request=request, user=user.pk)
    return access, True


@transaction.atomic
def revoke(access: ExamAccess, *, actor, request=None) -> ExamAccess:
    """Attempts already made stay on record; the learner just can't start new ones."""
    access = ExamAccess.objects.select_for_update().get(pk=access.pk)
    if access.status != ExamAccess.Status.ACTIVE:
        raise ConflictError("This exam access is already removed.")
    access.status, access.revoked_at = ExamAccess.Status.REVOKED, timezone.now()
    access.save(update_fields=["status", "revoked_at", "updated_at"])
    audit.record("assessments.exam_access_revoked", actor=actor, target=access, request=request)
    return access
