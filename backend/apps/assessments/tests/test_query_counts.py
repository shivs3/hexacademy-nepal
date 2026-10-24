import pytest

from apps.accounts import roles
from apps.assessments import attempts
from apps.learning import services as learning

pytestmark = pytest.mark.django_db


def test_exam_catalog(assert_constant_queries, client_for, make_exam, make_course):
    me = client_for()

    def build(n):
        for _ in range(n):
            make_exam()
            course = make_course()
            learning.enroll_free(me.user, course)
            # Course-bound, attempt-limited and partly attempted: every eligibility branch.
            attempts.start(me.user, make_exam(course=course, max_attempts=2))

    assert_constant_queries(build, me, "/api/v1/exams/")
    exams = me.get("/api/v1/exams/").json()["results"]
    assert {e["availability"] for e in exams} == {"available", "in_progress"}


def test_my_attempt_history(assert_constant_queries, client_for, make_exam):
    me = client_for()

    def build(n):
        for _ in range(n):
            attempt, _ = attempts.start(me.user, make_exam())
            attempts.submit(me.user, attempt.pk)

    assert_constant_queries(build, me, "/api/v1/me/exam-attempts/")


def test_staff_question_bank_and_exams(assert_constant_queries, client_for, make_exam, make_question):
    coordinator = client_for(roles.EXAM_COORDINATOR)
    assert_constant_queries(
        lambda n: [make_question() for _ in range(n)], coordinator, "/api/v1/admin/assessments/questions/"
    )
    assert_constant_queries(lambda n: [make_exam() for _ in range(n)], coordinator, "/api/v1/admin/assessments/exams/")
