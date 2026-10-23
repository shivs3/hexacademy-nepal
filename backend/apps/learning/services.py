"""Enrollment, lesson access and progress rules.

Access to a lesson is granted when, and only when, one of these holds:
1. the lesson is a published free preview of a published course;
2. the user has an active enrollment in the course and the lesson is
   published (and, for sequential courses, every earlier lesson is complete);
3. the user can open the course in the staff area (catalog policies), which
   includes unpublished lessons so authors can check their work.
"""

from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.catalog import policies
from apps.catalog.models import Course, Lesson
from apps.catalog.services import ordered_lessons
from common.exceptions import ConflictError, DomainError

from .models import Enrollment, LessonProgress


def active_enrollment(user, course: Course) -> Enrollment | None:
    if not (user and user.is_authenticated):
        return None
    return Enrollment.objects.filter(user=user, course=course, status=Enrollment.Status.ACTIVE).first()


@dataclass(frozen=True)
class LessonAccess:
    allowed: bool
    enrollment: Enrollment | None = None
    staff_preview: bool = False
    reason: str = ""  # not_enrolled | locked | unavailable


def completed_lesson_ids(enrollment: Enrollment | None) -> set[int]:
    if enrollment is None:
        return set()
    return set(
        LessonProgress.objects.filter(enrollment=enrollment, completed_at__isnull=False).values_list(
            "lesson_id", flat=True
        )
    )


def locked_lesson_ids(course: Course, lessons: list[Lesson], completed: set[int]) -> set[int]:
    """For sequential courses: lessons after the first incomplete one are locked."""
    if not course.sequential:
        return set()
    locked, blocked = set(), False
    for lesson in lessons:
        if blocked:
            locked.add(lesson.pk)
        elif lesson.pk not in completed:
            blocked = True  # this one is open; the rest wait for it
    return locked


def lesson_access(user, lesson: Lesson) -> LessonAccess:
    course = lesson.course
    if user and user.is_authenticated and policies.can_view_admin(user, course):
        return LessonAccess(True, enrollment=active_enrollment(user, course), staff_preview=True)
    if not lesson.is_published or course.status == Course.Status.DRAFT:
        return LessonAccess(False, reason="unavailable")
    enrollment = active_enrollment(user, course)
    if enrollment is None:
        if lesson.is_preview and course.is_published:
            return LessonAccess(True)
        return LessonAccess(False, reason="not_enrolled")
    if course.sequential:
        lessons = list(ordered_lessons(course))
        if lesson.pk in locked_lesson_ids(course, lessons, completed_lesson_ids(enrollment)):
            return LessonAccess(False, enrollment=enrollment, reason="locked")
    return LessonAccess(True, enrollment=enrollment)


# --- Enrollment ----------------------------------------------------------------------


def _create_or_reactivate(user, course: Course, *, source: str, granted_by=None) -> tuple[Enrollment, bool]:
    """Idempotent: an existing active enrollment is returned unchanged."""
    with transaction.atomic():
        existing = Enrollment.objects.select_for_update().filter(user=user, course=course).first()
        if existing:
            if existing.is_active:
                return existing, False
            existing.status, existing.revoked_at = Enrollment.Status.ACTIVE, None
            existing.source, existing.granted_by = source, granted_by
            existing.save(update_fields=["status", "revoked_at", "source", "granted_by", "updated_at"])
            return existing, True
        try:
            with transaction.atomic():
                enrollment = Enrollment.objects.create(user=user, course=course, source=source, granted_by=granted_by)
        except IntegrityError:
            # A concurrent request enrolled the same user first.
            return Enrollment.objects.get(user=user, course=course), False
        return enrollment, True


def enroll_free(user, course: Course, *, request=None) -> tuple[Enrollment, bool]:
    if not course.is_published:
        raise DomainError("This course is not open for enrollment.", code="not_available", status_code=404)
    if not course.is_free():
        raise DomainError("This course is paid. Purchase it to enroll.", code="payment_required", status_code=402)
    existing = Enrollment.objects.filter(user=user, course=course).first()
    if existing and existing.status == Enrollment.Status.REVOKED:
        # A revoked learner must be reinstated by staff, not by re-enrolling.
        raise DomainError("Your access to this course was removed. Contact support.", code="revoked", status_code=403)
    enrollment, created = _create_or_reactivate(user, course, source=Enrollment.Source.FREE)
    if created:
        audit.record("learning.enrolled_free", actor=user, target=enrollment, request=request, course=course.pk)
    return enrollment, created


def enroll_purchase(user, course: Course) -> tuple[Enrollment | None, bool]:
    """Called by commerce once a payment is verified (the caller audits it).
    Returns (None, False) for a learner whose access was revoked: staff decide
    whether to reinstate them rather than a payment doing it silently."""
    existing = Enrollment.objects.filter(user=user, course=course).first()
    if existing and existing.status == Enrollment.Status.REVOKED:
        return None, False
    return _create_or_reactivate(user, course, source=Enrollment.Source.PURCHASE)


def grant(user, course: Course, *, actor, request=None) -> tuple[Enrollment, bool]:
    if course.status == Course.Status.DRAFT:
        raise DomainError("Publish the course before enrolling learners.")
    enrollment, created = _create_or_reactivate(user, course, source=Enrollment.Source.ADMIN, granted_by=actor)
    if created:
        audit.record("learning.enrollment_granted", actor=actor, target=enrollment, request=request, user=user.pk)
    return enrollment, created


@transaction.atomic
def revoke(enrollment: Enrollment, *, actor, request=None) -> Enrollment:
    enrollment = Enrollment.objects.select_for_update().get(pk=enrollment.pk)
    if not enrollment.is_active:
        raise ConflictError("This enrollment is already revoked.")
    enrollment.status, enrollment.revoked_at = Enrollment.Status.REVOKED, timezone.now()
    enrollment.save(update_fields=["status", "revoked_at", "updated_at"])
    audit.record("learning.enrollment_revoked", actor=actor, target=enrollment, request=request)
    return enrollment


# --- Progress ------------------------------------------------------------------------


def published_lesson_count(course: Course) -> int:
    return Lesson.objects.filter(course=course, is_published=True).count()


@transaction.atomic
def record_progress(enrollment: Enrollment, lesson: Lesson, *, completed: bool | None) -> LessonProgress:
    """Record a visit, and optionally mark the lesson complete or incomplete.
    Course completion is derived here from server records only."""
    enrollment = Enrollment.objects.select_for_update().get(pk=enrollment.pk)
    now = timezone.now()
    progress, _ = LessonProgress.objects.get_or_create(enrollment=enrollment, lesson=lesson)
    if completed is True and progress.completed_at is None:
        progress.completed_at = now
        progress.save(update_fields=["completed_at", "updated_at"])
    elif completed is False and progress.completed_at is not None:
        progress.completed_at = None
        progress.save(update_fields=["completed_at", "updated_at"])

    enrollment.last_lesson, enrollment.last_accessed_at = lesson, now
    fields = ["last_lesson", "last_accessed_at", "updated_at"]
    if enrollment.completed_at is None and completed:
        published = set(
            Lesson.objects.filter(course_id=enrollment.course_id, is_published=True).values_list("pk", flat=True)
        )
        if published and published <= completed_lesson_ids(enrollment):
            enrollment.completed_at = now
            fields.append("completed_at")
    enrollment.save(update_fields=fields)
    if "completed_at" in fields:
        from apps.certificates.services import check_after_commit

        check_after_commit(enrollment.user_id, enrollment.course_id)
    return progress


def progress_summary(enrollment: Enrollment) -> dict:
    lessons = list(ordered_lessons(enrollment.course))
    completed = completed_lesson_ids(enrollment) & {lesson.pk for lesson in lessons}
    next_lesson = next((lesson for lesson in lessons if lesson.pk not in completed), None)
    total = len(lessons)
    return {
        "total_lessons": total,
        "completed_lessons": len(completed),
        "percent": round(100 * len(completed) / total) if total else 0,
        "next_lesson_id": next_lesson.pk if next_lesson else None,
    }
