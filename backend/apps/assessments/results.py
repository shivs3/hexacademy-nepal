"""When results are visible, what a learner may see, rankings and staff analytics.

Release rules (`Exam.result_release`):
- immediate: as soon as the attempt has ended;
- after_close: once the exam's closing time has passed (or staff close it);
- manual: once staff publish the results.

Before release a learner sees only that the attempt was received. After
release they see their score and breakdown; the review adds the correct
answers when `show_answers` is on and explanations when `show_explanations`
is on.
"""

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Avg, Count, Max, Min, Q
from django.utils import timezone

from .models import AttemptAnswer, AttemptQuestion, Exam, ExamAttempt

RANKING_SIZE = 20


def results_released(exam: Exam, now=None) -> bool:
    now = now or timezone.now()
    if exam.result_release == Exam.ResultRelease.IMMEDIATE:
        return True
    if exam.result_release == Exam.ResultRelease.AFTER_CLOSE:
        return exam.status == Exam.Status.CLOSED or bool(exam.closes_at and now >= exam.closes_at)
    return exam.results_published_at is not None


def release_note(exam: Exam) -> str:
    if exam.result_release == Exam.ResultRelease.AFTER_CLOSE:
        return "Results are published when the exam closes."
    if exam.result_release == Exam.ResultRelease.MANUAL:
        return "Results are published by your instructor."
    return ""


def attempt_released(attempt: ExamAttempt) -> bool:
    return not attempt.is_open and results_released(attempt.exam)


def percent(part, whole) -> Decimal:
    if not whole:
        return Decimal("0")
    return (Decimal(part) * 100 / Decimal(whole)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def time_spent_seconds(attempt: ExamAttempt) -> int | None:
    if attempt.ended_at is None:
        return None
    return max(0, int((attempt.ended_at - attempt.started_at).total_seconds()))


def summary(attempt: ExamAttempt) -> dict:
    answered = attempt.correct_count + attempt.incorrect_count
    return {
        "score": attempt.score,
        "max_score": attempt.max_score,
        "percent": percent(attempt.score or 0, attempt.max_score) if attempt.max_score else Decimal("0"),
        "passed": attempt.passed,
        "pass_marks": attempt.exam.pass_marks,
        "correct": attempt.correct_count,
        "incorrect": attempt.incorrect_count,
        "unanswered": attempt.unanswered_count,
        "accuracy": percent(attempt.correct_count, answered),
        "time_spent_seconds": time_spent_seconds(attempt),
    }


def topic_breakdown(attempt: ExamAttempt) -> list[dict]:
    rows = defaultdict(
        lambda: {"questions": 0, "correct": 0, "incorrect": 0, "marks": Decimal("0"), "max": Decimal("0")}
    )
    answers = {a.attempt_question_id: a for a in AttemptAnswer.objects.filter(attempt_question__attempt=attempt)}
    for aq in attempt.questions.all():
        row = rows[aq.topic_name or aq.subject_name or "General"]
        row["questions"] += 1
        row["max"] += aq.marks
        answer = answers.get(aq.pk)
        if answer and answer.is_correct is True:
            row["correct"] += 1
        elif answer and answer.is_correct is False:
            row["incorrect"] += 1
        if answer and answer.awarded_marks is not None:
            row["marks"] += answer.awarded_marks
    return [
        {
            "topic": name,
            "questions": r["questions"],
            "correct": r["correct"],
            "incorrect": r["incorrect"],
            "unanswered": r["questions"] - r["correct"] - r["incorrect"],
            "marks": r["marks"],
            "max_marks": r["max"],
            "percent": percent(r["correct"], r["questions"]),
        }
        for name, r in sorted(rows.items())
    ]


def review(attempt: ExamAttempt) -> list[dict]:
    """Per-question review. Only call after attempt_released()."""
    exam = attempt.exam
    answers = {a.attempt_question_id: a for a in AttemptAnswer.objects.filter(attempt_question__attempt=attempt)}
    items = []
    for aq in attempt.questions.all():
        answer = answers.get(aq.pk)
        items.append(
            {
                "id": aq.pk,
                "position": aq.position,
                "topic": aq.topic_name,
                "content": aq.content,
                "selected": answer.selected if answer else [],
                "is_correct": answer.is_correct if answer else None,
                "awarded_marks": answer.awarded_marks if answer and answer.awarded_marks is not None else Decimal("0"),
                "marks": aq.marks,
                "correct_options": aq.answer_key if exam.show_answers else None,
                "explanation": aq.explanation if exam.show_explanations else "",
            }
        )
    return items


def _initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    return " ".join(f"{p[0].upper()}." for p in parts[:3]) or "Learner"


def best_attempts(exam: Exam):
    """Each learner's best graded attempt: highest score, then fastest, then earliest."""
    return (
        ExamAttempt.objects.filter(exam=exam)
        .exclude(status=ExamAttempt.Status.IN_PROGRESS)
        .select_related("user")
        .order_by("user_id", "-score", "ended_at", "started_at")
        .distinct("user_id")
    )


def ranking(exam: Exam, viewer) -> dict:
    """Leaderboard with initials only; the viewer's own row is marked."""
    best = sorted(
        best_attempts(exam),
        key=lambda a: (-(a.score or 0), time_spent_seconds(a) or 0, a.ended_at),
    )
    rows, mine = [], None
    for i, attempt in enumerate(best, start=1):
        row = {
            "rank": i,
            "name": "You" if attempt.user_id == viewer.pk else _initials(attempt.user.full_name),
            "is_you": attempt.user_id == viewer.pk,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "time_spent_seconds": time_spent_seconds(attempt),
        }
        if i <= RANKING_SIZE:
            rows.append(row)
        if row["is_you"]:
            mine = row
    return {"participants": len(best), "top": rows, "you": mine}


def exam_analytics(exam: Exam) -> dict:
    """Staff view: attempt counts, score spread and per-question difficulty."""
    ended = ExamAttempt.objects.filter(exam=exam).exclude(status=ExamAttempt.Status.IN_PROGRESS)
    agg = ended.aggregate(
        attempts=Count("pk"),
        learners=Count("user", distinct=True),
        average=Avg("score"),
        highest=Max("score"),
        lowest=Min("score"),
        passed=Count("pk", filter=Q(passed=True)),
        expired=Count("pk", filter=Q(status=ExamAttempt.Status.EXPIRED)),
    )
    in_progress = ExamAttempt.objects.filter(exam=exam, status=ExamAttempt.Status.IN_PROGRESS).count()
    per_question = (
        AttemptQuestion.objects.filter(attempt__in=ended, question__isnull=False)
        .values("question_id")
        .annotate(
            seen=Count("pk"),
            correct=Count("pk", filter=Q(answer__is_correct=True)),
            incorrect=Count("pk", filter=Q(answer__is_correct=False)),
        )
        .order_by("question_id")
    )
    buckets = [0] * 10
    for score, max_score in ended.values_list("score", "max_score"):
        if max_score:
            pct = max(Decimal("0"), min(Decimal("99.999"), Decimal(score or 0) * 100 / max_score))
            buckets[int(pct // 10)] += 1
    average = agg["average"]
    return {
        "attempts": agg["attempts"],
        "learners": agg["learners"],
        "in_progress": in_progress,
        "expired": agg["expired"],
        "average_score": average.quantize(Decimal("0.01")) if average is not None else None,
        "highest_score": agg["highest"],
        "lowest_score": agg["lowest"],
        "pass_rate": percent(agg["passed"], agg["attempts"]) if exam.pass_marks is not None else None,
        "distribution": [{"range": f"{i * 10}–{i * 10 + 10}%", "count": n} for i, n in enumerate(buckets)],
        "questions": [
            {
                "question_id": row["question_id"],
                "seen": row["seen"],
                "correct": row["correct"],
                "incorrect": row["incorrect"],
                "unanswered": row["seen"] - row["correct"] - row["incorrect"],
                "correct_rate": percent(row["correct"], row["seen"]),
            }
            for row in per_question
        ],
    }
