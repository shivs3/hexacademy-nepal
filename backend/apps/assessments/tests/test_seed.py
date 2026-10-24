import json
from decimal import Decimal

import pytest
from django.core.management import call_command

from apps.assessments import demo_ioe, services
from apps.assessments.models import AttemptQuestion, Exam, ExamAttempt, Question

from .conftest import correct_ids, wrong_id

pytestmark = pytest.mark.django_db


def test_seed_exams_builds_the_section_a_paper_and_is_idempotent():
    call_command("seed_exams")
    call_command("seed_exams")
    exam = Exam.objects.get(slug=demo_ioe.EXAM["slug"])
    assert exam.status == Exam.Status.PUBLISHED and exam.negative_marking and exam.course is None
    assert Question.objects.filter(tags__contains=[demo_ioe.SOURCE_TAG]).count() == 45
    assert exam.exam_questions.count() == 45
    assert services.total_marks(exam) == Decimal("50")
    marks = sorted((eq.marks, eq.negative_marks) for eq in exam.exam_questions.all())
    assert marks.count((Decimal("1"), Decimal("0.1"))) == 40
    assert marks.count((Decimal("2"), Decimal("0.2"))) == 5
    # Every question has exactly one key, and every formula survived sanitising.
    for question in Question.objects.filter(tags__contains=[demo_ioe.SOURCE_TAG]).prefetch_related("options"):
        assert sum(o.is_correct for o in question.options.all()) == 1
    assert Question.objects.filter(prompt__contains='data-type="inline-math"').count() > 30


def test_mathematics_follows_the_published_topic_weights():
    weights = {}
    for _key, _subject, topic, *_ in demo_ioe.MATHEMATICS:
        weights[topic] = weights.get(topic, 0) + 1
    assert weights == {
        "basic-mathematics": 3, "algebra": 8, "vector-analysis": 6, "calculus": 12,
        "statistics-probability": 3, "trigonometry-logarithm": 4, "transforms": 4,
    }  # fmt: skip
    assert len({spec[0] for spec in demo_ioe.REASONING + demo_ioe.MATHEMATICS}) == 45


def test_a_learner_can_take_the_demo_exam(client_for):
    call_command("seed_exams")
    exam = Exam.objects.get(slug=demo_ioe.EXAM["slug"])
    client = client_for()
    body = client.post(f"/api/v1/exams/{exam.slug}/attempts/").json()
    assert "is_correct" not in json.dumps(body) and len(body["questions"]) == 45

    aqs = list(AttemptQuestion.objects.filter(attempt_id=body["id"]).order_by("position"))
    first, *rest = aqs  # questions keep their order: the first is a 2-mark reasoning question
    assert first.marks == Decimal("2")
    client.put(f"/api/v1/attempts/{body['id']}/answers/{first.pk}/", {"selected": [wrong_id(first)]}, format="json")
    for aq in rest:
        res = client.put(
            f"/api/v1/attempts/{body['id']}/answers/{aq.pk}/", {"selected": correct_ids(aq)}, format="json"
        )
        assert res.status_code == 200
    assert client.post(f"/api/v1/attempts/{body['id']}/submit/").status_code == 200

    attempt = ExamAttempt.objects.get(pk=body["id"])
    assert attempt.max_score == Decimal("50")
    assert attempt.score == Decimal("47.80")  # 48 correct marks - 10% of 2 for the wrong answer
