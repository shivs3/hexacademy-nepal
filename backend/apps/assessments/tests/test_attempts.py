"""Exam attempt lifecycle: eligibility, snapshots, answer privacy, deadlines, grading and idempotency."""

import json
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.assessments import attempts
from apps.assessments.models import AttemptQuestion, ExamAttempt
from apps.learning.models import Enrollment

from .conftest import correct_ids, wrong_id

pytestmark = pytest.mark.django_db

SECRET_KEYS = ("is_correct", "answer_key", "correct_options", "explanation")


def start(client, exam, expect=201):
    res = client.post(f"/api/v1/exams/{exam.slug}/attempts/")
    assert res.status_code == expect, res.content
    return res


def put(client, attempt_id, aq_id, selected, **extra):
    return client.put(f"/api/v1/attempts/{attempt_id}/answers/{aq_id}/", {"selected": selected, **extra}, format="json")


def questions(attempt_id):
    return list(AttemptQuestion.objects.filter(attempt_id=attempt_id).order_by("position"))


def test_start_snapshots_questions_without_answer_keys(client_for, make_exam):
    exam = make_exam(questions=3)
    client = client_for()
    body = start(client, exam).json()
    raw = json.dumps(body)
    for key in SECRET_KEYS:
        assert key not in raw
    assert body["status"] == "in_progress"
    assert len(body["questions"]) == 3
    assert {len(q["content"]["options"]) for q in body["questions"]} == {4}
    # The authoritative deadline comes from the server, not the browser.
    started = timezone.datetime.fromisoformat(body["started_at"])
    deadline = timezone.datetime.fromisoformat(body["deadline"])
    assert deadline - started == timedelta(minutes=30)

    # Reloading the attempt (e.g. after a refresh) is just as safe.
    raw = json.dumps(client.get(f"/api/v1/attempts/{body['id']}/").json())
    for key in SECRET_KEYS:
        assert key not in raw


def test_starting_again_resumes_the_open_attempt(client_for, make_exam):
    exam = make_exam()
    client = client_for()
    first = start(client, exam).json()
    second = start(client, exam, expect=200).json()
    assert first["id"] == second["id"]
    assert ExamAttempt.objects.filter(exam=exam).count() == 1


def test_deadline_is_capped_by_the_closing_time(client_for, make_exam):
    closes = timezone.now() + timedelta(minutes=10)
    exam = make_exam(duration_minutes=60, closes_at=closes)
    body = start(client_for(), exam).json()
    assert timezone.datetime.fromisoformat(body["deadline"]) == closes


def test_eligibility_rules(client_for, make_exam, make_course):
    client = client_for()
    assert client.post(f"/api/v1/exams/{make_exam(status='draft').slug}/attempts/").status_code == 404
    later = make_exam(opens_at=timezone.now() + timedelta(hours=1))
    res = client.post(f"/api/v1/exams/{later.slug}/attempts/")
    assert res.status_code == 403 and res.json()["error"]["code"] == "not_open"
    closed = make_exam(status="closed")
    assert client.post(f"/api/v1/exams/{closed.slug}/attempts/").json()["error"]["code"] == "closed"

    course = make_course()
    course_exam = make_exam(course=course)
    # Course exams are invisible to learners who are not enrolled.
    assert client.post(f"/api/v1/exams/{course_exam.slug}/attempts/").status_code == 404
    assert course_exam.slug not in json.dumps(client.get("/api/v1/exams/").json())
    Enrollment.objects.create(user=client.user, course=course, source="admin")
    start(client, course_exam)


def test_attempt_limit(client_for, make_exam):
    exam = make_exam(max_attempts=1)
    client = client_for()
    attempt_id = start(client, exam).json()["id"]
    assert client.post(f"/api/v1/attempts/{attempt_id}/submit/").status_code == 200
    res = client.post(f"/api/v1/exams/{exam.slug}/attempts/")
    assert res.status_code == 403 and res.json()["error"]["code"] == "no_attempts_left"


def test_grading_with_negative_marking(client_for, make_exam):
    exam = make_exam(questions=4, marks="2", negative="0.5", negative_marking=True, pass_marks=Decimal("3"))
    client = client_for()
    attempt_id = start(client, exam).json()["id"]
    q1, q2, q3, _unanswered = questions(attempt_id)
    assert put(client, attempt_id, q1.pk, correct_ids(q1)).status_code == 200
    assert put(client, attempt_id, q2.pk, correct_ids(q2)).status_code == 200
    assert put(client, attempt_id, q3.pk, [wrong_id(q3)]).status_code == 200

    body = client.post(f"/api/v1/attempts/{attempt_id}/submit/").json()
    assert body["status"] == "submitted"
    attempt = ExamAttempt.objects.get(pk=attempt_id)
    assert attempt.score == Decimal("3.50")  # 2 + 2 - 0.5 + 0
    assert (attempt.correct_count, attempt.incorrect_count, attempt.unanswered_count) == (2, 1, 1)
    assert attempt.max_score == Decimal("8")
    assert attempt.passed is True


def test_negative_marks_ignored_when_disabled(client_for, make_exam):
    exam = make_exam(questions=1, negative="1", negative_marking=False)
    client = client_for()
    attempt_id = start(client, exam).json()["id"]
    (q,) = questions(attempt_id)
    put(client, attempt_id, q.pk, [wrong_id(q)])
    client.post(f"/api/v1/attempts/{attempt_id}/submit/")
    assert ExamAttempt.objects.get(pk=attempt_id).score == 0


def test_multiple_select_needs_an_exact_match(client_for, make_exam, make_question):
    from apps.assessments.models import ExamQuestion

    exam = make_exam(questions=0)
    for i in range(2):
        q = make_question(kind="multiple", correct=(0, 2))
        ExamQuestion.objects.create(exam=exam, question=q, position=i, marks=Decimal("1"))
    client = client_for()
    attempt_id = start(client, exam).json()["id"]
    full, partial = questions(attempt_id)
    put(client, attempt_id, full.pk, correct_ids(full))
    put(client, attempt_id, partial.pk, correct_ids(partial)[:1])
    client.post(f"/api/v1/attempts/{attempt_id}/submit/")
    attempt = ExamAttempt.objects.get(pk=attempt_id)
    assert attempt.score == 1
    assert attempt.correct_count == 1 and attempt.incorrect_count == 1


def test_answer_validation(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam(questions=1)).json()["id"]
    (q,) = questions(attempt_id)
    ids = [o["id"] for o in q.content["options"]]
    assert put(client, attempt_id, q.pk, [999999]).json()["error"]["code"] == "invalid_option"
    assert put(client, attempt_id, q.pk, ids[:2]).json()["error"]["code"] == "invalid_option"
    # Clearing an answer is allowed and counts as unanswered.
    assert put(client, attempt_id, q.pk, []).status_code == 200


def test_submit_is_idempotent(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam(questions=2)).json()["id"]
    q = questions(attempt_id)[0]
    put(client, attempt_id, q.pk, correct_ids(q))
    first = client.post(f"/api/v1/attempts/{attempt_id}/submit/")
    graded_at = ExamAttempt.objects.get(pk=attempt_id).graded_at
    second = client.post(f"/api/v1/attempts/{attempt_id}/submit/")
    assert first.status_code == second.status_code == 200
    attempt = ExamAttempt.objects.get(pk=attempt_id)
    assert attempt.graded_at == graded_at and attempt.score == 1
    # And the attempt no longer accepts answers.
    res = put(client, attempt_id, q.pk, [wrong_id(q)])
    assert res.status_code == 409 and res.json()["error"]["code"] == "attempt_closed"
    assert ExamAttempt.objects.get(pk=attempt_id).score == 1


def test_finalize_twice_grades_once(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam(questions=1)).json()["id"]
    a = attempts.finalize(attempt_id, ExamAttempt.Status.SUBMITTED)
    b = attempts.finalize(attempt_id, ExamAttempt.Status.EXPIRED)
    assert a.graded_at == b.graded_at and b.status == "submitted"


def test_save_after_the_deadline_finalises_with_saved_answers(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam(questions=2)).json()["id"]
    q1, q2 = questions(attempt_id)
    put(client, attempt_id, q1.pk, correct_ids(q1))
    deadline = timezone.now() - timedelta(minutes=1)
    ExamAttempt.objects.filter(pk=attempt_id).update(deadline=deadline)

    res = put(client, attempt_id, q2.pk, correct_ids(q2))
    assert res.status_code == 409 and res.json()["error"]["code"] == "attempt_closed"
    attempt = ExamAttempt.objects.get(pk=attempt_id)
    assert attempt.status == "expired"
    assert attempt.score == 1  # only the answer saved in time counts
    assert attempt.ended_at == deadline


def test_grace_period_accepts_requests_just_after_the_deadline(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam(questions=1)).json()["id"]
    (q,) = questions(attempt_id)
    ExamAttempt.objects.filter(pk=attempt_id).update(deadline=timezone.now() - timedelta(seconds=1))
    assert put(client, attempt_id, q.pk, correct_ids(q)).status_code == 200


def test_reading_an_overdue_attempt_expires_it(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam()).json()["id"]
    ExamAttempt.objects.filter(pk=attempt_id).update(deadline=timezone.now() - timedelta(minutes=5))
    body = client.get(f"/api/v1/attempts/{attempt_id}/").json()
    assert body["status"] == "expired"
    assert body["questions"] == []


def test_submit_after_the_deadline_is_recorded_as_expired(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam()).json()["id"]
    ExamAttempt.objects.filter(pk=attempt_id).update(deadline=timezone.now() - timedelta(minutes=5))
    assert client.post(f"/api/v1/attempts/{attempt_id}/submit/").json()["status"] == "expired"


def test_expiry_task(client_for, make_exam):
    client = client_for()
    overdue = start(client, make_exam()).json()["id"]
    current = start(client, make_exam()).json()["id"]
    ExamAttempt.objects.filter(pk=overdue).update(deadline=timezone.now() - timedelta(minutes=5))
    assert attempts.expire_overdue_attempts() == 1
    assert ExamAttempt.objects.get(pk=overdue).status == "expired"
    assert ExamAttempt.objects.get(pk=current).status == "in_progress"


def test_attempts_are_private(client_for, make_exam):
    owner = client_for()
    attempt_id = start(owner, make_exam(questions=1)).json()["id"]
    (q,) = questions(attempt_id)
    other = client_for()
    assert other.get(f"/api/v1/attempts/{attempt_id}/").status_code == 404
    assert put(other, attempt_id, q.pk, correct_ids(q)).status_code == 404
    assert other.post(f"/api/v1/attempts/{attempt_id}/submit/").status_code == 404
    assert other.get(f"/api/v1/attempts/{attempt_id}/result/").status_code == 404
    staff = client_for("instructor")
    assert staff.get(f"/api/v1/attempts/{attempt_id}/").status_code == 404


def test_anonymous_cannot_start(api_client, make_exam):
    assert api_client.post(f"/api/v1/exams/{make_exam().slug}/attempts/").status_code in (401, 403)


def test_no_revisit_blocks_earlier_questions(client_for, make_exam):
    client = client_for()
    attempt_id = start(client, make_exam(questions=3, allow_revisit=False)).json()["id"]
    q1, q2, _ = questions(attempt_id)
    assert put(client, attempt_id, q1.pk, correct_ids(q1)).status_code == 200
    assert client.post(f"/api/v1/attempts/{attempt_id}/advance/", {"position": 1}, format="json").status_code == 200
    res = put(client, attempt_id, q1.pk, [wrong_id(q1)])
    assert res.status_code == 409 and res.json()["error"]["code"] == "no_revisit"
    assert put(client, attempt_id, q2.pk, correct_ids(q2)).status_code == 200


def test_snapshot_is_immune_to_later_bank_edits(client_for, make_exam):
    exam = make_exam(questions=1)
    client = client_for()
    attempt_id = start(client, exam).json()["id"]
    (aq,) = questions(attempt_id)
    question = exam.exam_questions.get().question
    # Staff flip the answer key after the attempt started.
    for option in question.options.all():
        option.is_correct = not option.is_correct
        option.save()
    put(client, attempt_id, aq.pk, correct_ids(aq))
    client.post(f"/api/v1/attempts/{attempt_id}/submit/")
    assert ExamAttempt.objects.get(pk=attempt_id).score == 1


def test_random_draw_and_shuffle(client_for, make_exam):
    exam = make_exam(questions=6, question_count=3, shuffle_questions=True, shuffle_options=True)
    body = start(client_for(), exam).json()
    assert len(body["questions"]) == 3
    assert ExamAttempt.objects.get(pk=body["id"]).max_score == 3


def test_concurrent_start_is_prevented_by_the_database(client_for, make_exam):
    """Even if the lock were bypassed, one open attempt per learner and exam is a DB constraint."""
    from django.db import IntegrityError, transaction

    client = client_for()
    exam = make_exam()
    attempt = ExamAttempt.objects.get(pk=start(client, exam).json()["id"])
    with pytest.raises(IntegrityError), transaction.atomic():
        ExamAttempt.objects.create(exam=exam, user=client.user, number=2, started_at=timezone.now(),
                                   deadline=attempt.deadline, max_score=1)  # fmt: skip
