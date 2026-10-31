"""Question bank and exam configuration: permissions, validation, versions, import and export."""

from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.assessments.models import Exam, Question, QuestionVersion
from apps.catalog.models import CourseInstructor

pytestmark = pytest.mark.django_db

QUESTIONS = "/api/v1/admin/assessments/questions/"
EXAMS = "/api/v1/admin/assessments/exams/"


def payload(subject, **extra):
    return {
        "subject": subject.pk,
        "kind": "single",
        "prompt": '<p>Speed is <span data-type="inline-math" data-latex="v = d/t"></span><script>x()</script></p>',
        "options": [{"text": "<p>Yes</p>", "is_correct": True}, {"text": "<p>No</p>", "is_correct": False}],
        "status": "active",
        **extra,
    }


@pytest.mark.parametrize(
    "role", ["student", "finance_manager", "content_editor", "support_staff", "teaching_assistant"]
)
def test_bank_and_keys_are_closed_to_other_roles(client_for, make_question, role):
    question = make_question()
    client = client_for(role)
    assert client.get(QUESTIONS).status_code == 403
    assert client.get(f"{QUESTIONS}{question.pk}/").status_code == 403
    assert client.get(f"{QUESTIONS}export/").status_code == 403


def test_coordinator_creates_sanitised_question_with_version(client_for, subject):
    client = client_for("exam_coordinator")
    res = client.post(QUESTIONS, payload(subject), format="json")
    assert res.status_code == 201, res.content
    body = res.json()
    assert "<script>" not in body["prompt"] and 'data-type="inline-math"' in body["prompt"]
    assert [o["is_correct"] for o in body["options"]] == [True, False]
    assert QuestionVersion.objects.filter(question_id=body["id"], version=1).exists()


@pytest.mark.parametrize(
    "kind,options,code",
    [
        ("single", [{"text": "<p>A</p>", "is_correct": True}], "invalid_options"),
        (
            "single",
            [{"text": "<p>A</p>", "is_correct": True}, {"text": "<p>B</p>", "is_correct": True}],
            "invalid_options",
        ),
        ("multiple", [{"text": "<p>A</p>"}, {"text": "<p>B</p>"}], "invalid_options"),
        ("true_false", [{"text": "T", "is_correct": True}, {"text": "F"}, {"text": "X"}], "invalid_options"),
        ("single", [{"text": "<p> </p>", "is_correct": True}, {"text": "<p>B</p>"}], "invalid_options"),
    ],
)
def test_option_rules(client_for, subject, kind, options, code):
    res = client_for("exam_coordinator").post(QUESTIONS, payload(subject, kind=kind, options=options), format="json")
    assert res.status_code == 400 and res.json()["error"]["code"] == code


def test_edit_bumps_version_only_on_content_change(client_for, make_question):
    question = make_question()
    client = client_for("exam_coordinator")
    client.patch(f"{QUESTIONS}{question.pk}/", {"status": "retired"}, format="json")
    question.refresh_from_db()
    assert question.version == 1
    res = client.patch(f"{QUESTIONS}{question.pk}/", {"prompt": "<p>Changed</p>"}, format="json")
    assert res.json()["version"] == 2
    versions = client.get(f"{QUESTIONS}{question.pk}/versions/").json()
    assert [v["version"] for v in versions] == [2]  # the fixture wrote version 1 without history


def test_question_in_use_cannot_be_deleted(client_for, make_exam):
    exam = make_exam(questions=1)
    question = exam.exam_questions.get().question
    res = client_for("exam_coordinator").delete(f"{QUESTIONS}{question.pk}/")
    assert res.status_code == 409 and res.json()["error"]["code"] == "question_in_use"


def test_instructor_scope(client_for, make_course, make_question, subject):
    teacher = client_for("instructor")
    mine = make_course(instructor=teacher.user)
    theirs = make_course()
    shared = make_question()
    shared_draft = make_question(status="draft")
    other = make_question(course=theirs)

    # Create only for courses they teach.
    assert teacher.post(QUESTIONS, payload(subject, course=mine.pk), format="json").status_code == 201
    assert teacher.post(QUESTIONS, payload(subject, course=theirs.pk), format="json").status_code == 400
    assert teacher.post(QUESTIONS, payload(subject), format="json").status_code == 400

    ids = {q["id"] for q in teacher.get(QUESTIONS).json()["results"]}
    assert shared.pk in ids and other.pk not in ids and shared_draft.pk not in ids
    assert teacher.get(f"{QUESTIONS}{other.pk}/").status_code == 404
    # The shared bank is readable (to build exams) but not editable.
    assert teacher.get(f"{QUESTIONS}{shared.pk}/").json()["can_edit"] is False
    assert teacher.patch(f"{QUESTIONS}{shared.pk}/", {"prompt": "<p>x</p>"}, format="json").status_code == 403
    # Subjects are read-only for them.
    assert teacher.get("/api/v1/admin/assessments/subjects/").status_code == 200
    assert (
        teacher.post("/api/v1/admin/assessments/subjects/", {"name": "X", "slug": "x"}, format="json").status_code
        == 403
    )


def test_teaching_assistant_sees_course_exam_results_only(client_for, make_course, make_exam):
    ta = client_for("teaching_assistant")
    course = make_course(ta=ta.user)
    exam = make_exam(course=course)
    other = make_exam()
    assert ta.get(f"{EXAMS}{exam.pk}/").status_code == 200
    assert ta.get(f"{EXAMS}{exam.pk}/attempts/").status_code == 200
    assert ta.get(f"{EXAMS}{other.pk}/").status_code == 404
    assert ta.patch(f"{EXAMS}{exam.pk}/", {"title": "Mine now"}, format="json").status_code == 403


def test_exam_publish_validation(client_for, make_question):
    client = client_for("exam_coordinator")
    res = client.post(EXAMS, {"title": "Mock test", "slug": "mock-test", "duration_minutes": 20,
                              "instructions": "<p>Go.</p>"}, format="json")  # fmt: skip
    assert res.status_code == 201, res.content
    exam_id = res.json()["id"]
    assert res.json()["publish_problems"] == ["Add at least one question."]
    assert (
        client.post(f"{EXAMS}{exam_id}/status/", {"status": "published"}, format="json").json()["error"]["code"]
        == "exam_not_ready"
    )

    a, b, c = make_question(marks="1"), make_question(marks="2"), make_question(status="draft")
    items = [{"question": a.pk}, {"question": b.pk}, {"question": c.pk}]
    res = client.put(f"{EXAMS}{exam_id}/questions/", {"questions": items}, format="json")
    assert res.status_code == 200 and [q["marks"] for q in res.json()] == ["1.00", "2.00", "1.00"]
    client.patch(f"{EXAMS}{exam_id}/", {"question_count": 2, "pass_marks": "10"}, format="json")
    problems = client.get(f"{EXAMS}{exam_id}/").json()["publish_problems"]
    assert any("same marks" in p for p in problems)
    assert any("drafts or retired" in p for p in problems)
    assert any("pass mark" in p for p in problems)

    items = [{"question": a.pk, "marks": "2"}, {"question": b.pk}]
    client.put(f"{EXAMS}{exam_id}/questions/", {"questions": items}, format="json")
    client.patch(f"{EXAMS}{exam_id}/", {"question_count": None, "pass_marks": "2"}, format="json")
    res = client.post(f"{EXAMS}{exam_id}/status/", {"status": "published"}, format="json")
    assert res.status_code == 200 and res.json()["status"] == "published"
    assert res.json()["total_marks"] == "4.00"


def test_scoring_is_locked_after_publication(client_for, make_exam, make_question):
    exam = make_exam(questions=2)
    client = client_for("exam_coordinator")
    res = client.patch(f"{EXAMS}{exam.pk}/", {"negative_marking": True}, format="json")
    assert res.status_code == 400 and "negative_marking" in res.json()["error"]["details"]
    assert client.patch(f"{EXAMS}{exam.pk}/", {"title": "Renamed"}, format="json").status_code == 200
    res = client.put(f"{EXAMS}{exam.pk}/questions/", {"questions": [{"question": make_question().pk}]}, format="json")
    assert res.status_code == 409

    # Back to draft is only possible before anybody has taken it.
    learner = client_for()
    learner.post(f"/api/v1/exams/{exam.slug}/attempts/")
    res = client.post(f"{EXAMS}{exam.pk}/status/", {"status": "draft"}, format="json")
    assert res.status_code == 409 and res.json()["error"]["code"] == "has_attempts"
    assert client.delete(f"{EXAMS}{exam.pk}/").status_code == 409


def test_instructor_exam_scope(client_for, make_course, make_question):
    teacher = client_for("instructor")
    mine = make_course(instructor=teacher.user)
    assert CourseInstructor.objects.filter(course=mine, user=teacher.user).exists()
    body = {"title": "Unit test", "slug": "unit-test", "duration_minutes": 10}
    assert teacher.post(EXAMS, {**body, "course": mine.pk}, format="json").status_code == 201
    assert teacher.post(EXAMS, {**body, "slug": "unit-2", "course": make_course().pk}, format="json").status_code == 400
    assert teacher.post(EXAMS, {**body, "slug": "unit-3"}, format="json").status_code == 400
    exam = Exam.objects.get(slug="unit-test")
    # Questions of another course are not visible, so they cannot be attached.
    foreign = make_question(course=make_course())
    res = teacher.put(f"{EXAMS}{exam.pk}/questions/", {"questions": [{"question": foreign.pk}]}, format="json")
    assert res.status_code == 400
    options = teacher.get("/api/v1/admin/assessments/course-options/").json()
    assert [o["id"] for o in options] == [mine.pk]


CSV = (
    "subject,topic,kind,difficulty,question,option_a,option_b,option_c,correct,explanation,marks,negative_marks,tags,status\n"
    '{s},kinematics,single,easy,"What is \\(v = d/t\\)",Speed,Mass,Time,A,Distance by time,2,0.5,Motion;Basics,active\n'
    "{s},,true_false,medium,The Earth is flat,,,,false,,1,0,,draft\n"
    '{s},,multiple,hard,Pick primes,2,4,5,"A,C",,1,0,,active\n'
)


def upload(text, name="questions.csv"):
    return SimpleUploadedFile(name, text.encode(), content_type="text/csv")


def test_import_dry_run_then_commit(client_for, subject):
    client = client_for("exam_coordinator")
    text = CSV.format(s=subject.slug)
    report = client.post(f"{QUESTIONS}import/", {"file": upload(text), "dry_run": True}, format="multipart").json()
    assert report == {"rows": 3, "valid": 3, "created": 0, "dry_run": True, "errors": []}
    assert not Question.objects.exists()

    report = client.post(f"{QUESTIONS}import/", {"file": upload(text), "dry_run": False}, format="multipart").json()
    assert report["created"] == 3
    q = Question.objects.get(kind="single")
    assert 'data-type="inline-math" data-latex="v = d/t"' in q.prompt
    assert q.default_marks == Decimal("2") and q.tags == ["basics", "motion"]
    tf = Question.objects.get(kind="true_false")
    assert [o.is_correct for o in tf.options.all()] == [False, True]

    export = client.get(f"{QUESTIONS}export/").content.decode()
    assert "\\(v = d/t\\)" in export and ",A,C," not in export and '"A,C"' in export


def test_import_reports_every_error_and_saves_nothing(client_for, subject):
    client = client_for("exam_coordinator")
    text = (
        "subject,question,option_a,option_b,correct,marks\n"
        f"{subject.slug},Fine,Yes,No,A,1\n"
        "nope,Unknown subject,Yes,No,A,1\n"
        f"{subject.slug},Bad letter,Yes,No,C,1\n"
        f"{subject.slug},Bad marks,Yes,No,A,lots\n"
    )
    report = client.post(f"{QUESTIONS}import/", {"file": upload(text), "dry_run": False}, format="multipart").json()
    assert report["created"] == 0 and report["valid"] == 1
    assert [(e["row"], e["field"]) for e in report["errors"]] == [(3, "subject"), (4, "correct"), (5, "marks")]
    assert not Question.objects.exists()


def test_import_rejects_double_escaped_maths(client_for, subject):
    client = client_for("exam_coordinator")
    text = (
        "subject,question,option_a,option_b,correct,explanation\n"
        f"{subject.slug},Evaluate \\\\(\\\\int x\\\\,dx\\\\),Yes,No,A,\n"
        f"{subject.slug},Pick one,\\\\(x^2\\\\),No,A,\n"
        f"{subject.slug},Fine,Yes,No,A,Because \\\\(x\\\\)\n"
        f"{subject.slug},Matrix \\(\\begin{{pmatrix}} 1 \\\\ 2 \\end{{pmatrix}}\\),Yes,No,A,\n"
    )
    report = client.post(f"{QUESTIONS}import/", {"file": upload(text), "dry_run": True}, format="multipart").json()
    assert [(e["row"], e["field"]) for e in report["errors"]] == [(2, "question"), (3, "options"), (4, "explanation")]
    assert report["valid"] == 1  # a real \\ row break inside \( \) is still accepted


def test_import_rejects_other_file_types(client_for):
    client = client_for("exam_coordinator")
    res = client.post(f"{QUESTIONS}import/", {"file": upload("x", name="q.txt")}, format="multipart")
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_file"


def test_xlsx_import(client_for, subject):
    import io

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["Subject", "Question", "Option A", "Option B", "Correct"])
    ws.append([subject.name, "Two plus two?", "4", "5", "a"])
    buffer = io.BytesIO()
    wb.save(buffer)
    file = SimpleUploadedFile("bank.xlsx", buffer.getvalue())
    report = (
        client_for("exam_coordinator")
        .post(f"{QUESTIONS}import/", {"file": file, "dry_run": False}, format="multipart")
        .json()
    )
    assert report["created"] == 1, report


def test_instructor_import_needs_their_course(client_for, make_course, subject):
    teacher = client_for("instructor")
    mine = make_course(instructor=teacher.user)
    text = CSV.format(s=subject.slug)
    assert teacher.post(f"{QUESTIONS}import/", {"file": upload(text)}, format="multipart").status_code == 403
    res = teacher.post(
        f"{QUESTIONS}import/", {"file": upload(text), "course": mine.pk, "dry_run": False}, format="multipart"
    )
    assert res.json()["created"] == 3
    assert set(Question.objects.values_list("course_id", flat=True)) == {mine.pk}


def test_exam_manager_without_bank_rights_reads_active_questions_only(make_user, api_client, make_question):
    from django.contrib.auth.models import Permission

    user = make_user("support_staff")
    user.user_permissions.add(
        Permission.objects.get(codename="manage_exams"), Permission.objects.get(codename="access_admin_panel")
    )
    api_client.force_login(user)
    active, draft = make_question(), make_question(status="draft")
    ids = {q["id"] for q in api_client.get(QUESTIONS).json()["results"]}
    assert active.pk in ids and draft.pk not in ids
    assert api_client.patch(f"{QUESTIONS}{active.pk}/", {"prompt": "<p>x</p>"}, format="json").status_code == 403
