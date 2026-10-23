"""Assignment authoring, submission and grading rules.

A learner has one Submission row per assignment. Submitting again (allowed
until it is graded, and again after it is returned for revision) replaces the
work and increments `attempt`. Points are only set by the teaching team, and
only learners' own rows are ever exposed to them.
"""

from dataclasses import dataclass
from datetime import datetime

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.catalog import resources
from apps.catalog.models import Course, Lesson
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from common.exceptions import ConflictError

from .models import Assignment, Enrollment, Submission

MAX_TEXT = 20_000


@dataclass(frozen=True)
class Window:
    open: bool
    late: bool
    reason: str = ""


def window(assignment: Assignment, now: datetime | None = None) -> Window:
    """Whether new work is accepted right now, and whether it would be late."""
    now = now or timezone.now()
    if not assignment.is_published:
        return Window(False, False, "This assignment is not open.")
    late = assignment.due_at is not None and now > assignment.due_at
    if late and not assignment.allow_late:
        return Window(False, True, "The due date has passed.")
    return Window(True, late)


def _check_lesson(course: Course, lesson: Lesson | None):
    if lesson is not None and lesson.course_id != course.pk:
        raise ValidationError({"lesson": ["Choose a lesson from this course."]})


def _check_accepts(accepts_text: bool, accepts_file: bool):
    if not (accepts_text or accepts_file):
        raise ValidationError({"accepts_text": ["Accept a written answer, a file, or both."]})


@transaction.atomic
def create_assignment(course: Course, *, actor, request=None, **fields) -> Assignment:
    _check_lesson(course, fields.get("lesson"))
    _check_accepts(fields.get("accepts_text", True), fields.get("accepts_file", True))
    assignment = Assignment.objects.create(course=course, created_by=actor, **fields)
    audit.record("learning.assignment_created", actor=actor, target=assignment, request=request, course=course.pk)
    return assignment


@transaction.atomic
def update_assignment(assignment: Assignment, *, actor, request=None, **fields) -> Assignment:
    assignment = Assignment.objects.select_for_update().get(pk=assignment.pk)
    if "lesson" in fields:
        _check_lesson(assignment.course, fields["lesson"])
    _check_accepts(
        fields.get("accepts_text", assignment.accepts_text), fields.get("accepts_file", assignment.accepts_file)
    )
    if "max_points" in fields and fields["max_points"] != assignment.max_points:
        top = assignment.submissions.filter(points__isnull=False).order_by("-points").values_list("points", flat=True)
        if (highest := top.first()) is not None and fields["max_points"] < highest:
            raise ValidationError({"max_points": [f"A submission already has {highest} points."]})
    for name, value in fields.items():
        setattr(assignment, name, value)
    assignment.save()
    audit.record("learning.assignment_updated", actor=actor, target=assignment, request=request, fields=sorted(fields))
    return assignment


@transaction.atomic
def delete_assignment(assignment: Assignment, *, actor, request=None):
    if assignment.submissions.exists():
        raise ConflictError("Learners have submitted work. Unpublish it instead.", code="has_submissions")
    audit.record("learning.assignment_deleted", actor=actor, target=assignment, request=request)
    assignment.delete()


def _read_upload(uploaded) -> tuple[bytes, str, str, str]:
    size = uploaded.size or 0
    if size == 0:
        raise ValidationError({"file": ["The file is empty."]})
    if size > resources.max_bytes():
        raise ValidationError({"file": [f"Files must be at most {resources.max_bytes() // (1024 * 1024)} MB."]})
    data = uploaded.read()
    original = resources.safe_filename(getattr(uploaded, "name", ""))
    ext, mime = resources.detect(data, original)
    return data, original, ext, mime


@transaction.atomic
def submit(
    assignment: Assignment, user, *, text: str = "", uploaded=None, remove_file: bool = False, request=None
) -> Submission:
    """Create or replace the learner's submission."""
    if not Enrollment.objects.filter(
        user=user, course_id=assignment.course_id, status=Enrollment.Status.ACTIVE
    ).exists():
        raise ConflictError("You are not enrolled in this course.", code="not_enrolled")
    now = timezone.now()
    win = window(assignment, now)
    if not win.open:
        raise ConflictError(win.reason, code="closed")
    text = (text or "").replace("\x00", "").strip()
    if text and not assignment.accepts_text:
        raise ValidationError({"text": ["This assignment takes a file only."]})
    if uploaded is not None and not assignment.accepts_file:
        raise ValidationError({"file": ["This assignment takes a written answer only."]})
    if len(text) > MAX_TEXT:
        raise ValidationError({"text": [f"At most {MAX_TEXT:,} characters."]})

    existing = Submission.objects.select_for_update().filter(assignment=assignment, user=user).first()
    if existing and existing.status == Submission.Status.GRADED:
        raise ConflictError("This work has been graded and can no longer change.", code="graded")

    sub = existing or Submission(assignment=assignment, user=user, attempt=0)
    old_file = (sub.file.storage, sub.file.name) if sub.file else None
    if uploaded is not None:
        data, original, ext, mime = _read_upload(uploaded)
        sub.file.save(f"upload{ext}", ContentFile(data), save=False)
        sub.original_name, sub.mime_type, sub.size_bytes = original, mime, len(data)
    elif remove_file and sub.file:
        sub.file = ""
        sub.original_name, sub.mime_type, sub.size_bytes = "", "", 0
    sub.text = text
    if not sub.text and not sub.file:
        raise ValidationError({"text": ["Write an answer or attach a file."]})

    sub.status = Submission.Status.SUBMITTED
    sub.attempt += 1
    sub.submitted_at = now
    sub.is_late = win.late
    sub.points = None
    sub.save()
    if old_file and old_file[1] != sub.file.name:
        storage, name = old_file
        transaction.on_commit(lambda: storage.delete(name))
    audit.record(
        "learning.submission_submitted",
        actor=user,
        target=sub,
        request=request,
        assignment=assignment.pk,
        attempt=sub.attempt,
        late=sub.is_late,
    )
    return sub


@transaction.atomic
def grade(
    submission: Submission, *, outcome: str, points: int | None, feedback: str, actor, request=None
) -> Submission:
    """`outcome` is "graded" (points required) or "returned" (learner may resubmit)."""
    sub = Submission.objects.select_for_update(of=("self",)).select_related("assignment").get(pk=submission.pk)
    assignment = sub.assignment
    feedback = (feedback or "").replace("\x00", "").strip()
    if outcome == Submission.Status.GRADED:
        if points is None:
            raise ValidationError({"points": ["Enter the points awarded."]})
        if points > assignment.max_points:
            raise ValidationError({"points": [f"At most {assignment.max_points}."]})
        sub.points = points
    elif outcome == Submission.Status.RETURNED:
        if not feedback:
            raise ValidationError({"feedback": ["Tell the learner what to change."]})
        sub.points = None
    else:
        raise ValidationError({"outcome": ["Choose graded or returned."]})
    regrade = sub.status == Submission.Status.GRADED
    sub.status = outcome
    sub.feedback = feedback
    sub.graded_by = actor
    sub.graded_at = timezone.now()
    sub.save()
    audit.record(
        "learning.submission_graded" if outcome == Submission.Status.GRADED else "learning.submission_returned",
        actor=actor,
        target=sub,
        request=request,
        assignment=assignment.pk,
        points=sub.points,
        regrade=regrade,
    )
    link = f"/dashboard/assignments/{assignment.pk}"
    if outcome == Submission.Status.GRADED:
        from apps.certificates.services import check_after_commit

        check_after_commit(sub.user_id, assignment.course_id)
        notifications.notify(
            [sub.user],
            kind=Notification.Kind.SUBMISSION_GRADED,
            title=f"Graded: {assignment.title}",
            body=f"{sub.points} / {assignment.max_points} points.",
            link=link,
            email=True,
        )
    else:
        notifications.notify(
            [sub.user],
            kind=Notification.Kind.SUBMISSION_RETURNED,
            title=f"Revision requested: {assignment.title}",
            body="Your instructor returned your work with feedback. You can submit again.",
            link=link,
            email=True,
        )
    return sub
