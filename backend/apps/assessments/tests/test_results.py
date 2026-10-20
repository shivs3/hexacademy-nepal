"""Result release rules, review content, topic breakdown, rankings and history."""

import json
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.assessments.models import AttemptQuestion, Exam

from .conftest import correct_ids, wrong_id

pytestmark = pytest.mark.django_db


def take(client, exam, *, right=1, wrong=0):
    attempt_id = client.post(f"/api/v1/exams/{exam.slug}/attempts/").json()["id"]
    qs = list(AttemptQuestion.objects.filter(attempt_id=attempt_id).order_by("position"))
    for q in qs[:right]:
        client.put(f"/api/v1/attempts/{attempt_id}/answers/{q.pk}/", {"selected": correct_ids(q)}, format="json")
    for q in qs[right : right + wrong]:
        client.put(f"/api/v1/attempts/{attempt_id}/answers/{q.pk}/", {"selected": [wrong_id(q)]}, format="json")
    client.post(f"/api/v1/attempts/{attempt_id}/submit/")
    return attempt_id


def test_immediate_results_with_review(client_for, make_exam):
    exam = make_exam(questions=3)
    client = client_for()
    attempt_id = take(client, exam, right=2, wrong=1)
    body = client.get(f"/api/v1/attempts/{attempt_id}/result/").json()
    assert body["released"] is True
    s = body["summary"]
    assert (s["correct"], s["incorrect"], s["unanswered"]) == (2, 1, 0)
    assert s["score"] == "2.00" and s["percent"] == "66.7" and s["accuracy"] == "66.7"
    assert body["topics"][0]["topic"] == "Kinematics" and body["topics"][0]["questions"] == 3
    review = body["review"]
    assert len(review) == 3
    assert all(item["correct_options"] for item in review)
    assert review[0]["explanation"] == "<p>Because.</p>"


def test_review_hides_answers_and_explanations_when_configured(client_for, make_exam):
    exam = make_exam(questions=1, show_answers=False, show_explanations=False)
    client = client_for()
    body = client.get(f"/api/v1/attempts/{take(client, exam)}/result/").json()
    assert body["review"][0]["correct_options"] is None
    assert body["review"][0]["explanation"] == ""


def test_manual_release_withholds_score_and_key(client_for, make_exam):
    exam = make_exam(questions=2, result_release="manual")
    client = client_for()
    attempt_id = take(client, exam)
    body = client.get(f"/api/v1/attempts/{attempt_id}/result/").json()
    assert body["released"] is False and body["summary"] is None and body["review"] == []
    assert body["attempt"]["score"] is None
    raw = json.dumps(body)
    assert 'correct_options": [' not in raw
    history = client.get("/api/v1/me/exam-attempts/").json()["results"]
    assert history[0]["score"] is None and history[0]["percent"] is None

    staff = client_for("exam_coordinator")
    assert staff.post(f"/api/v1/admin/assessments/exams/{exam.pk}/publish-results/").status_code == 200
    body = client.get(f"/api/v1/attempts/{attempt_id}/result/").json()
    assert body["released"] is True and body["summary"]["score"] == "1.00"


def test_after_close_release(client_for, make_exam):
    exam = make_exam(questions=1, result_release="after_close", closes_at=timezone.now() + timedelta(hours=1))
    client = client_for()
    attempt_id = take(client, exam)
    assert client.get(f"/api/v1/attempts/{attempt_id}/result/").json()["released"] is False
    Exam.objects.filter(pk=exam.pk).update(status="closed")
    assert client.get(f"/api/v1/attempts/{attempt_id}/result/").json()["released"] is True


def test_in_progress_attempt_has_no_result(client_for, make_exam):
    client = client_for()
    attempt_id = client.post(f"/api/v1/exams/{make_exam().slug}/attempts/").json()["id"]
    body = client.get(f"/api/v1/attempts/{attempt_id}/result/").json()
    assert body["released"] is False and body["review"] == []


def test_ranking_uses_best_attempt_and_initials(client_for, make_exam):
    exam = make_exam(questions=3, ranking_enabled=True)
    me = client_for(full_name="Sita Sharma")
    rival = client_for(full_name="Ram Bahadur Thapa")
    take(rival, exam, right=2)
    take(me, exam, right=1)
    attempt_id = take(me, exam, right=3)
    ranking = me.get(f"/api/v1/attempts/{attempt_id}/result/").json()["ranking"]
    assert ranking["participants"] == 2
    assert [r["name"] for r in ranking["top"]] == ["You", "R. B. T."]
    assert ranking["you"]["rank"] == 1
    assert "Ram" not in json.dumps(ranking)


def test_ranking_absent_unless_enabled(client_for, make_exam):
    client = client_for()
    exam = make_exam(questions=1)
    assert client.get(f"/api/v1/attempts/{take(client, exam)}/result/").json()["ranking"] is None


def test_history_and_exam_list(client_for, make_exam):
    exam = make_exam(questions=2, max_attempts=3)
    client = client_for()
    take(client, exam, right=1)
    take(client, exam, right=2)
    history = client.get("/api/v1/me/exam-attempts/").json()["results"]
    assert [h["percent"] for h in history] == ["100.0", "50.0"]
    listing = client.get("/api/v1/exams/").json()["results"]
    row = next(r for r in listing if r["slug"] == exam.slug)
    assert row["attempts_used"] == 2 and row["availability"] == "available"
    detail = client.get(f"/api/v1/exams/{exam.slug}/").json()
    assert len(detail["my_attempts"]) == 2
    assert "is_correct" not in json.dumps(detail)


def test_staff_analytics_and_export(client_for, make_exam):
    exam = make_exam(questions=2, pass_marks=1)
    learner = client_for()
    take(learner, exam, right=2)
    take(client_for(), exam, right=0, wrong=2)
    staff = client_for("exam_coordinator")
    data = staff.get(f"/api/v1/admin/assessments/exams/{exam.pk}/analytics/").json()
    assert data["attempts"] == 2 and data["pass_rate"] == "50.0"
    assert sum(b["count"] for b in data["distribution"]) == 2
    assert {q["correct_rate"] for q in data["questions"]} == {"50.0"}
    res = staff.get(f"/api/v1/admin/assessments/exams/{exam.pk}/results-export/")
    assert res.status_code == 200 and res["Content-Type"].startswith("text/csv")
    assert learner.user.email in res.content.decode()
    attempts = staff.get(f"/api/v1/admin/assessments/exams/{exam.pk}/attempts/").json()
    assert attempts["count"] == 2
