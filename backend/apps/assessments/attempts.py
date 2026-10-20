"""Exam attempt lifecycle. The server is the only authority on time and marks.

    start ──> in_progress ──submit──> submitted ─┐
                   │                             ├─> graded in the same transaction
                   └──deadline passes──> expired ┘

Concurrency: every state change and every answer save locks the attempt row
(`SELECT ... FOR UPDATE`), so a save and a submit for the same attempt run one
after the other. If the save wins, its answer is graded; if the submit wins,
the save is refused with 409 `attempt_closed`. Finalisation is idempotent:
ending an attempt that has already ended returns it unchanged, so a double
submit, a retry after a network error and the expiry task can never grade
twice.

Deadlines are `min(start + duration, exam closes_at)`, computed once at start.
Saves arriving up to ANSWER_GRACE_SECONDS after the deadline are still
accepted, to absorb requests that left the browser in time but arrived late;
after that the attempt is finalised with whatever was saved.
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.learning.services import active_enrollment
from common.exceptions import ConflictError, DomainError

from .models import AttemptAnswer, AttemptQuestion, Exam, ExamAttempt, Question
from .services import media_or_none

_rng = random.SystemRandom()


def grace() -> timedelta:
    return timedelta(seconds=getattr(settings, "ASSESSMENTS_ANSWER_GRACE_SECONDS", 5))


# --- Eligibility ---------------------------------------------------------------------


def attempts_used(user, exam: Exam) -> int:
    return ExamAttempt.objects.filter(exam=exam, user=user).count()


def eligibility(user, exam: Exam, *, now=None) -> tuple[bool, str]:
    """(allowed, reason). Reasons: unavailable, not_open, closed, not_enrolled, no_attempts_left."""
    now = now or timezone.now()
    if exam.status == Exam.Status.DRAFT:
        return False, "unavailable"
    if exam.status == Exam.Status.CLOSED or (exam.closes_at and now >= exam.closes_at):
        return False, "closed"
    if exam.opens_at and now < exam.opens_at:
        return False, "not_open"
    if exam.course_id and active_enrollment(user, exam.course) is None:
        return False, "not_enrolled"
    if exam.max_attempts is not None and attempts_used(user, exam) >= exam.max_attempts:
        return False, "no_attempts_left"
    return True, ""


DENIALS = {
    "unavailable": (404, "This exam is not available."),
    "not_open": (403, "This exam has not opened yet."),
    "closed": (403, "This exam has closed."),
    "not_enrolled": (403, "Enroll in the course to take this exam."),
    "no_attempts_left": (403, "You have used all your attempts for this exam."),
}


# --- Starting ------------------------------------------------------------------------


def _content(question: Question, shuffle_options: bool) -> tuple[dict, list[int]]:
    options = list(question.options.all())
    if shuffle_options and question.kind != Question.Kind.TRUE_FALSE:
        _rng.shuffle(options)
    content = {
        "kind": question.kind,
        "prompt": question.prompt,
        "image": media_or_none(question.image),
        "options": [{"id": o.pk, "text": o.text, "image": media_or_none(o.image)} for o in options],
    }
    return content, sorted(o.pk for o in options if o.is_correct)


def _draw(exam: Exam):
    pool = list(
        exam.exam_questions.select_related("question__topic", "question__subject", "question__image").prefetch_related(
            "question__options__image"
        )
    )
    if exam.question_count and exam.question_count < len(pool):
        chosen = set(_rng.sample(range(len(pool)), exam.question_count))
        pool = [link for i, link in enumerate(pool) if i in chosen]
    if exam.shuffle_questions:
        _rng.shuffle(pool)
    return pool


def _create_attempt(user, exam: Exam, now) -> ExamAttempt:
    deadline = now + timedelta(minutes=exam.duration_minutes)
    if exam.closes_at and exam.closes_at < deadline:
        deadline = exam.closes_at
    links = _draw(exam)
    attempt = ExamAttempt.objects.create(
        exam=exam,
        user=user,
        number=attempts_used(user, exam) + 1,
        started_at=now,
        deadline=deadline,
        max_score=sum((link.marks for link in links), Decimal("0")),
    )
    rows = []
    for position, link in enumerate(links):
        q = link.question
        content, key = _content(q, exam.shuffle_options)
        rows.append(
            AttemptQuestion(
                attempt=attempt,
                position=position,
                question=q,
                question_version=q.version,
                kind=q.kind,
                topic_name=q.topic.name if q.topic else "",
                subject_name=q.subject.name,
                content=content,
                answer_key=key,
                explanation=q.explanation,
                marks=link.marks,
                negative_marks=link.negative_marks if exam.negative_marking else Decimal("0"),
            )
        )
    AttemptQuestion.objects.bulk_create(rows)
    return attempt


def start(user, exam: Exam, *, request=None) -> tuple[ExamAttempt, bool]:
    """Resume the open attempt or start a new one. Returns (attempt, created)."""
    expire_if_overdue(ExamAttempt.objects.filter(exam=exam, user=user, status=ExamAttempt.Status.IN_PROGRESS).first())
    with transaction.atomic():
        # Lock the learner's row so two simultaneous starts cannot both create an attempt.
        get_user_model().objects.select_for_update().get(pk=user.pk)
        current = ExamAttempt.objects.filter(exam=exam, user=user, status=ExamAttempt.Status.IN_PROGRESS).first()
        if current is not None:
            return current, False
        exam = Exam.objects.get(pk=exam.pk)
        now = timezone.now()
        allowed, reason = eligibility(user, exam, now=now)
        if not allowed:
            status_code, message = DENIALS[reason]
            raise DomainError(message, code=reason, status_code=status_code)
        attempt = _create_attempt(user, exam, now)
    audit.record("assessments.attempt_started", actor=user, target=attempt, request=request, exam=exam.pk)
    return attempt, True


# --- Answering -----------------------------------------------------------------------


def _locked(attempt_id: int) -> ExamAttempt:
    return ExamAttempt.objects.select_for_update().select_related("exam").get(pk=attempt_id)


def is_overdue(attempt: ExamAttempt, now=None) -> bool:
    return (now or timezone.now()) > attempt.deadline + grace()


def expire_if_overdue(attempt: ExamAttempt | None) -> ExamAttempt | None:
    if attempt is not None and attempt.is_open and is_overdue(attempt):
        return finalize(attempt.pk, ExamAttempt.Status.EXPIRED)
    return attempt


def validate_selection(aq: AttemptQuestion, selected: list[int]) -> list[int]:
    valid = {o["id"] for o in aq.content["options"]}
    chosen = sorted(set(selected))
    if any(s not in valid for s in chosen):
        raise DomainError("That option is not part of this question.", code="invalid_option")
    if aq.kind != Question.Kind.MULTIPLE and len(chosen) > 1:
        raise DomainError("Choose one option.", code="invalid_option")
    return chosen


def save_answer(
    user, attempt_id: int, attempt_question_id: int, selected: list[int], flagged: bool = False
) -> AttemptAnswer:
    closed = False
    with transaction.atomic():
        attempt = _locked(attempt_id)
        if attempt.user_id != user.pk:
            raise ExamAttempt.DoesNotExist
        aq = AttemptQuestion.objects.filter(attempt=attempt, pk=attempt_question_id).first()
        if aq is None:
            raise AttemptQuestion.DoesNotExist
        if not attempt.is_open:
            raise ConflictError("This attempt has ended.", code="attempt_closed")
        if is_overdue(attempt):
            closed = True
        else:
            if not attempt.exam.allow_revisit and aq.position < attempt.furthest_position:
                raise ConflictError("This exam does not allow going back to earlier questions.", code="no_revisit")
            chosen = validate_selection(aq, selected)
            answer, _ = AttemptAnswer.objects.update_or_create(
                attempt_question=aq, defaults={"selected": chosen, "flagged": flagged, "saved_at": timezone.now()}
            )
            if aq.position > attempt.furthest_position:
                attempt.furthest_position = aq.position
                attempt.save(update_fields=["furthest_position", "updated_at"])
            return answer
    if closed:
        # Finalised outside the refused request's transaction so the grading is kept.
        finalize(attempt_id, ExamAttempt.Status.EXPIRED)
        raise ConflictError("Time is up. Your saved answers have been submitted.", code="attempt_closed")
    raise AssertionError("unreachable")


def advance(user, attempt_id: int, position: int) -> ExamAttempt:
    """Record that the learner moved on (used when going back is not allowed)."""
    with transaction.atomic():
        attempt = _locked(attempt_id)
        if attempt.user_id != user.pk:
            raise ExamAttempt.DoesNotExist
        if not attempt.is_open:
            raise ConflictError("This attempt has ended.", code="attempt_closed")
        last = attempt.questions.count() - 1
        target = min(max(position, 0), last)
        if target > attempt.furthest_position:
            attempt.furthest_position = target
            attempt.save(update_fields=["furthest_position", "updated_at"])
        return attempt


# --- Ending and grading --------------------------------------------------------------


def grade_question(aq: AttemptQuestion, selected: list[int] | None) -> tuple[bool | None, Decimal]:
    """(is_correct, awarded). Unanswered scores 0; a multiple-select must match exactly (no partial credit)."""
    if not selected:
        return None, Decimal("0")
    if sorted(selected) == sorted(aq.answer_key):
        return True, aq.marks
    return False, -aq.negative_marks


def submit(user, attempt_id: int, *, request=None) -> ExamAttempt:
    attempt = ExamAttempt.objects.get(pk=attempt_id, user=user)
    status = ExamAttempt.Status.EXPIRED if is_overdue(attempt) else ExamAttempt.Status.SUBMITTED
    result = finalize(attempt_id, status)
    audit.record("assessments.attempt_submitted", actor=user, target=result, request=request, status=result.status)
    return result


@transaction.atomic
def finalize(attempt_id: int, status: str) -> ExamAttempt:
    """End and grade an attempt exactly once."""
    attempt = _locked(attempt_id)
    if not attempt.is_open:
        return attempt
    now = timezone.now()
    answers = {a.attempt_question_id: a for a in AttemptAnswer.objects.filter(attempt_question__attempt=attempt)}
    score = Decimal("0")
    correct = incorrect = unanswered = 0
    for aq in attempt.questions.all():
        answer = answers.get(aq.pk)
        is_correct, awarded = grade_question(aq, answer.selected if answer else None)
        if is_correct is None:
            unanswered += 1
        elif is_correct:
            correct += 1
        else:
            incorrect += 1
        score += awarded
        if answer is not None:
            answer.is_correct, answer.awarded_marks = is_correct, awarded
            answer.save(update_fields=["is_correct", "awarded_marks"])
    attempt.status = status
    attempt.ended_at = min(now, attempt.deadline) if status == ExamAttempt.Status.EXPIRED else now
    attempt.graded_at = now
    attempt.score = score
    attempt.correct_count, attempt.incorrect_count, attempt.unanswered_count = correct, incorrect, unanswered
    pass_marks = attempt.exam.pass_marks
    attempt.passed = None if pass_marks is None else score >= pass_marks
    attempt.save()
    return attempt


def expire_overdue_for(user) -> None:
    """Finalise this learner's overdue attempts so lists never show a stale in-progress state."""
    cutoff = timezone.now() - grace()
    for pk in ExamAttempt.objects.filter(
        user=user, status=ExamAttempt.Status.IN_PROGRESS, deadline__lt=cutoff
    ).values_list("pk", flat=True):
        finalize(pk, ExamAttempt.Status.EXPIRED)


def expire_overdue_attempts(limit: int = 500) -> int:
    """Finalise attempts whose deadline has passed (run every minute by Celery beat)."""
    cutoff = timezone.now() - grace()
    ids = list(
        ExamAttempt.objects.filter(status=ExamAttempt.Status.IN_PROGRESS, deadline__lt=cutoff).values_list(
            "pk", flat=True
        )[:limit]
    )
    for pk in ids:
        finalize(pk, ExamAttempt.Status.EXPIRED)
    return len(ids)
