"""Question bank and exam configuration rules.

Attempt lifecycle and grading live in attempts.py; results and analytics in
results.py. Every write is checked against policies.py by the caller (the
admin views) and validated here, so the rules cannot be bypassed by a
different client.
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from apps.audit import services as audit
from apps.catalog.models import Course
from apps.cms.media import media_payload
from apps.cms.sanitize import clean_rich_text, rich_text_is_empty
from common.exceptions import ConflictError, DomainError

from .models import Exam, ExamQuestion, Question, QuestionOption, QuestionVersion, Topic

MAX_OPTIONS = 8
MAX_EXAM_QUESTIONS = 300
CONTENT_FIELDS = ("kind", "prompt", "explanation", "image_id")


# --- Questions -----------------------------------------------------------------------


def validate_options(kind: str, options: list[dict]) -> list[dict]:
    """Return cleaned options or raise. Each option: {text, is_correct, image?}."""
    cleaned = []
    for i, option in enumerate(options):
        text = clean_rich_text(option.get("text") or "")
        if rich_text_is_empty(text) and not option.get("image"):
            raise DomainError(f"Option {i + 1} is empty.", code="invalid_options")
        cleaned.append({"text": text, "is_correct": bool(option.get("is_correct")), "image": option.get("image")})
    correct = sum(o["is_correct"] for o in cleaned)
    if kind == Question.Kind.TRUE_FALSE:
        if len(cleaned) != 2:
            raise DomainError("A true/false question has exactly two options.", code="invalid_options")
    elif not 2 <= len(cleaned) <= MAX_OPTIONS:
        raise DomainError(f"Give between 2 and {MAX_OPTIONS} options.", code="invalid_options")
    if kind == Question.Kind.MULTIPLE:
        if correct < 1:
            raise DomainError("Mark at least one option as correct.", code="invalid_options")
    elif correct != 1:
        raise DomainError("Mark exactly one option as correct.", code="invalid_options")
    return cleaned


def question_snapshot(question: Question) -> dict:
    """Full copy for the version history (staff only: includes the key)."""
    return {
        "kind": question.kind,
        "subject_id": question.subject_id,
        "topic_id": question.topic_id,
        "difficulty": question.difficulty,
        "prompt": question.prompt,
        "image_id": question.image_id,
        "explanation": question.explanation,
        "tags": list(question.tags),
        "default_marks": str(question.default_marks),
        "default_negative_marks": str(question.default_negative_marks),
        "options": [
            {"text": o.text, "image_id": o.image_id, "is_correct": o.is_correct} for o in question.options.all()
        ],
    }


def _check_topic(subject_id: int, topic: Topic | None):
    if topic is not None and topic.subject_id != subject_id:
        raise DomainError("The topic belongs to a different subject.", code="invalid_topic")


def _write_options(question: Question, options: list[dict]):
    question.options.all().delete()
    QuestionOption.objects.bulk_create(
        QuestionOption(question=question, text=o["text"], image=o["image"], is_correct=o["is_correct"], position=i)
        for i, o in enumerate(options)
    )


def _record_version(question: Question, user):
    QuestionVersion.objects.create(
        question=question, version=question.version, snapshot=question_snapshot(question), created_by=user
    )


@transaction.atomic
def create_question(user, data: dict, options: list[dict], *, request=None, audit_event=True) -> Question:
    _check_topic(data["subject"].pk, data.get("topic"))
    cleaned = validate_options(data.get("kind", Question.Kind.SINGLE), options)
    data = {
        **data,
        "prompt": clean_rich_text(data["prompt"]),
        "explanation": clean_rich_text(data.get("explanation", "")),
    }
    if rich_text_is_empty(data["prompt"]):
        raise DomainError("Write the question.", code="invalid_prompt")
    question = Question.objects.create(created_by=user, **data)
    _write_options(question, cleaned)
    _record_version(question, user)
    if audit_event:
        audit.record("assessments.question_created", actor=user, target=question, request=request)
    return question


@transaction.atomic
def update_question(user, question: Question, data: dict, options: list[dict] | None, *, request=None) -> Question:
    question = Question.objects.select_for_update().get(pk=question.pk)
    before = question_snapshot(question)
    for field, value in data.items():
        setattr(question, field, value)
    if "prompt" in data:
        question.prompt = clean_rich_text(question.prompt)
        if rich_text_is_empty(question.prompt):
            raise DomainError("Write the question.", code="invalid_prompt")
    if "explanation" in data:
        question.explanation = clean_rich_text(question.explanation)
    _check_topic(question.subject_id, question.topic)
    if options is not None:
        cleaned = validate_options(question.kind, options)
    elif "kind" in data and data["kind"] != before["kind"]:
        # Changing the kind re-validates the stored options against the new rules.
        cleaned = validate_options(
            question.kind,
            [{"text": o.text, "is_correct": o.is_correct, "image": o.image} for o in question.options.all()],
        )
    else:
        cleaned = None
    question.save()
    if cleaned is not None:
        _write_options(question, cleaned)
    after = question_snapshot(question)
    if after != before:
        question.version += 1
        question.save(update_fields=["version", "updated_at"])
        _record_version(question, user)
        audit.record(
            "assessments.question_updated", actor=user, target=question, request=request, version=question.version
        )
    return question


def delete_question(user, question: Question, *, request=None):
    if question.exam_links.exists():
        raise ConflictError("This question is used by an exam. Retire it instead.", code="question_in_use")
    audit.record("assessments.question_deleted", actor=user, target=question, request=request)
    question.delete()


# --- Exams ---------------------------------------------------------------------------

# Fields that decide what an attempt contains or how it is scored: fixed once published.
SCORING_FIELDS = (
    "course", "kind", "question_count", "negative_marking", "pass_marks", "duration_minutes",
    "shuffle_questions", "shuffle_options",
)  # fmt: skip


def pool_summary(exam: Exam) -> dict:
    agg = exam.exam_questions.aggregate(n=Count("pk"), total=Sum("marks"), distinct_marks=Count("marks", distinct=True))
    return {"pool_size": agg["n"], "pool_marks": agg["total"] or Decimal("0"), "distinct_marks": agg["distinct_marks"]}


def drawn_count(exam: Exam, pool_size: int) -> int:
    if exam.question_count and exam.question_count < pool_size:
        return exam.question_count
    return pool_size


def total_marks(exam: Exam) -> Decimal:
    """Marks available in one attempt. Random draws require equal marks, so this is fixed."""
    summary = pool_summary(exam)
    n = drawn_count(exam, summary["pool_size"])
    if n == summary["pool_size"]:
        return summary["pool_marks"]
    first = exam.exam_questions.values_list("marks", flat=True).first() or Decimal("0")
    return first * n


def publish_problems(exam: Exam) -> list[str]:
    problems = []
    summary = pool_summary(exam)
    if summary["pool_size"] == 0:
        problems.append("Add at least one question.")
    if exam.question_count and exam.question_count > summary["pool_size"]:
        problems.append(f"The exam draws {exam.question_count} questions but only {summary['pool_size']} are added.")
    random_draw = exam.question_count and exam.question_count < summary["pool_size"]
    if random_draw and summary["distinct_marks"] > 1:
        problems.append("When questions are drawn at random, every question must carry the same marks.")
    if exam.exam_questions.exclude(question__status=Question.Status.ACTIVE).exists():
        problems.append("Some questions are drafts or retired. Mark them ready or remove them.")
    total = total_marks(exam)
    if exam.pass_marks is not None and exam.pass_marks > total:
        problems.append(f"The pass mark ({exam.pass_marks}) is higher than the total ({total}).")
    now = timezone.now()
    if exam.closes_at and exam.closes_at <= now:
        problems.append("The closing time has already passed.")
    if exam.result_release == Exam.ResultRelease.AFTER_CLOSE and not exam.closes_at:
        problems.append("Set a closing time, or release results another way.")
    if exam.course_id and exam.course.status != Course.Status.PUBLISHED:
        problems.append("The course must be published so learners can enroll.")
    if rich_text_is_empty(exam.instructions):
        problems.append("Write instructions for learners.")
    return problems


def _locked(exam: Exam) -> Exam:
    return Exam.objects.select_for_update().get(pk=exam.pk)


def ensure_structure_editable(exam: Exam):
    if exam.status != Exam.Status.DRAFT:
        raise ConflictError("Questions and scoring can only change while the exam is a draft.", code="exam_not_draft")


@transaction.atomic
def set_exam_questions(user, exam: Exam, items: list[dict], *, request=None) -> Exam:
    """Replace the whole question list. Items: {question, marks?, negative_marks?} in order."""
    exam = _locked(exam)
    ensure_structure_editable(exam)
    if len(items) > MAX_EXAM_QUESTIONS:
        raise DomainError(f"An exam can hold at most {MAX_EXAM_QUESTIONS} questions.", code="too_many_questions")
    ids = [item["question"].pk for item in items]
    if len(ids) != len(set(ids)):
        raise DomainError("A question is listed twice.", code="duplicate_question")
    exam.exam_questions.all().delete()
    ExamQuestion.objects.bulk_create(
        ExamQuestion(
            exam=exam,
            question=item["question"],
            position=i,
            marks=item.get("marks") or item["question"].default_marks,
            negative_marks=item["negative_marks"]
            if item.get("negative_marks") is not None
            else item["question"].default_negative_marks,
        )
        for i, item in enumerate(items)
    )
    exam.save(update_fields=["updated_at"])
    audit.record("assessments.exam_questions_set", actor=user, target=exam, request=request, count=len(items))
    return exam


@transaction.atomic
def set_status(user, exam: Exam, status: str, *, request=None) -> Exam:
    exam = _locked(exam)
    if status == exam.status:
        return exam
    if status == Exam.Status.PUBLISHED:
        problems = publish_problems(exam)
        if problems:
            raise DomainError(" ".join(problems), code="exam_not_ready")
        exam.published_at = exam.published_at or timezone.now()
    elif status == Exam.Status.DRAFT and exam.attempts.exists():
        raise ConflictError(
            "Learners have taken this exam, so it cannot return to draft. Close it instead.", code="has_attempts"
        )
    exam.status = status
    exam.save(update_fields=["status", "published_at", "updated_at"])
    audit.record("assessments.exam_status_changed", actor=user, target=exam, request=request, status=status)
    return exam


@transaction.atomic
def publish_results(user, exam: Exam, *, request=None) -> Exam:
    exam = _locked(exam)
    if exam.result_release != Exam.ResultRelease.MANUAL:
        raise DomainError("This exam releases its results automatically.", code="not_manual")
    if exam.results_published_at is None:
        exam.results_published_at = timezone.now()
        exam.save(update_fields=["results_published_at", "updated_at"])
        audit.record("assessments.results_published", actor=user, target=exam, request=request)
        from apps.certificates.services import on_results_published

        on_results_published(exam)
    return exam


def delete_exam(user, exam: Exam, *, request=None):
    if exam.status != Exam.Status.DRAFT or exam.attempts.exists():
        raise ConflictError("Only draft exams that nobody has taken can be deleted.", code="exam_in_use")
    audit.record("assessments.exam_deleted", actor=user, target=exam, request=request)
    exam.delete()


def media_or_none(asset):
    return media_payload(asset) if asset else None
