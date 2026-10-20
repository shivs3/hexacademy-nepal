import itertools
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.assessments.models import Exam, ExamQuestion, Question, QuestionOption, Subject, Topic

_seq = itertools.count(1)


@pytest.fixture
def subject(db):
    n = next(_seq)
    s = Subject.objects.create(name=f"Physics {n}", slug=f"physics-{n}")
    Topic.objects.create(subject=s, name="Kinematics", slug="kinematics")
    return s


@pytest.fixture
def make_question(subject):
    """A ready question; `correct` are option indexes that are right."""

    def _make(*, kind="single", options=("A", "B", "C", "D"), correct=(0,), marks="1", negative="0", status="active",
              course=None, topic=None):  # fmt: skip
        if kind == "true_false":
            options = ("True", "False")
        q = Question.objects.create(
            subject=subject,
            topic=topic or subject.topics.first(),
            kind=kind,
            status=status,
            prompt=f"<p>Question {next(_seq)}</p>",
            explanation="<p>Because.</p>",
            default_marks=Decimal(marks),
            default_negative_marks=Decimal(negative),
            course=course,
        )
        for i, text in enumerate(options):
            QuestionOption.objects.create(question=q, text=f"<p>{text}</p>", is_correct=i in correct, position=i)
        return q

    return _make


@pytest.fixture
def make_exam(make_question):
    def _make(*, questions=3, status="published", course=None, marks="1", negative="0", **config):
        n = next(_seq)
        config.setdefault("instructions", "<p>Answer every question.</p>")
        exam = Exam.objects.create(
            title=f"Exam {n}", slug=f"exam-{n}", duration_minutes=config.pop("duration_minutes", 30), status=status,
            course=course, published_at=timezone.now() if status != "draft" else None, **config,
        )  # fmt: skip
        for i in range(questions):
            q = make_question(marks=marks, negative=negative)
            ExamQuestion.objects.create(
                exam=exam, question=q, position=i, marks=Decimal(marks), negative_marks=Decimal(negative)
            )
        return exam

    return _make


def correct_ids(aq) -> list[int]:
    return list(aq.answer_key)


def wrong_id(aq) -> int:
    return next(o["id"] for o in aq.content["options"] if o["id"] not in aq.answer_key)
