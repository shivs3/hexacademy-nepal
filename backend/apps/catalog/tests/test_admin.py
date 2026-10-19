import pytest

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.catalog.models import Course, CourseModule, Lesson

pytestmark = pytest.mark.django_db
COURSES = "/api/v1/admin/catalog/courses/"


def _create(client, **payload):
    return client.post(COURSES, {"title": "Python Basics", "slug": "python-basics", **payload}, format="json")


def test_editor_creates_and_publishes_course_after_validation(client_for, make_user):
    editor = client_for(roles.CONTENT_EDITOR)
    res = _create(editor, subtitle="Start programming", price="2500.00")
    assert res.status_code == 201, res.json()
    course = res.json()
    assert course["status"] == "draft" and course["abilities"]["publish"] is True
    assert course["publish_problems"]

    # Not publishable yet: no lessons, no instructor.
    res = editor.post(f"{COURSES}{course['id']}/status/", {"status": "published"}, format="json")
    assert res.status_code == 400

    res = editor.post(f"{COURSES}{course['id']}/modules/", {"title": "Getting started"}, format="json")
    assert res.status_code == 201
    res = editor.post(
        "/api/v1/admin/catalog/lessons/",
        {"module": res.json()["id"], "title": "Hello", "body": "<p>Hi</p><script>x()</script>", "is_published": True},
        format="json",
    )
    assert res.status_code == 201, res.json()
    assert "<script" not in Lesson.objects.get().body

    teacher = make_user(roles.INSTRUCTOR)
    res = editor.put(
        f"{COURSES}{course['id']}/team/", {"members": [{"user": teacher.pk, "role": "instructor"}]}, format="json"
    )
    assert res.status_code == 200, res.json()

    res = editor.post(f"{COURSES}{course['id']}/status/", {"status": "published"}, format="json")
    assert res.status_code == 200, res.json()
    assert res.json()["status"] == "published" and res.json()["published_at"]
    assert AuditLog.objects.filter(action="catalog.course_published").exists()


def test_instructor_creates_course_and_becomes_its_instructor(client_for):
    teacher = client_for(roles.INSTRUCTOR)
    res = _create(teacher)
    assert res.status_code == 201, res.json()
    body = res.json()
    assert [m["user_id"] for m in body["team"]] == [teacher.user.pk]
    assert body["abilities"] == {"edit": True, "manage": False, "publish": False, "delete": False}


def test_instructor_cannot_set_price_featured_or_publish(client_for):
    teacher = client_for(roles.INSTRUCTOR)
    assert _create(teacher, price="999.00").status_code == 403
    course = _create(teacher).json()
    assert teacher.patch(f"{COURSES}{course['id']}/", {"is_featured": True}, format="json").status_code == 403
    assert teacher.post(f"{COURSES}{course['id']}/status/", {"status": "published"}, format="json").status_code == 403
    assert teacher.patch(f"{COURSES}{course['id']}/", {"subtitle": "Updated"}, format="json").status_code == 200


def test_instructor_cannot_see_or_edit_other_courses(client_for, make_user, make_course):
    teacher = client_for(roles.INSTRUCTOR)
    other = make_course(instructor=make_user(roles.INSTRUCTOR))
    assert teacher.get(COURSES).json()["count"] == 0
    assert teacher.get(f"{COURSES}{other.pk}/").status_code == 404
    assert teacher.patch(f"{COURSES}{other.pk}/", {"title": "Mine now"}, format="json").status_code == 404
    lesson = other.lessons.first()
    assert (
        teacher.patch(f"/api/v1/admin/catalog/lessons/{lesson.pk}/", {"title": "x"}, format="json").status_code == 404
    )


def test_instructor_cannot_rename_slug_of_live_course(client_for, make_course):
    teacher = client_for(roles.INSTRUCTOR)
    course = make_course(instructor=teacher.user)
    res = teacher.patch(f"{COURSES}{course.pk}/", {"slug": "new-address"}, format="json")
    assert res.status_code == 403


def test_teaching_assistant_reads_but_cannot_edit(client_for, make_course):
    ta = client_for(roles.TEACHING_ASSISTANT)
    course = make_course(ta=ta.user)
    assert ta.get(f"{COURSES}{course.pk}/").status_code == 200
    assert ta.get(f"{COURSES}{course.pk}/curriculum/").status_code == 200
    assert ta.patch(f"{COURSES}{course.pk}/", {"title": "x"}, format="json").status_code == 403
    assert ta.post(f"{COURSES}{course.pk}/modules/", {"title": "x"}, format="json").status_code == 403
    assert ta.post(COURSES, {"title": "x", "slug": "x"}, format="json").status_code == 403


def test_students_and_finance_have_no_catalog_admin(client_for, make_course):
    course = make_course()
    for role in (roles.STUDENT, roles.FINANCE_MANAGER):
        client = client_for(role)
        assert client.get(f"{COURSES}{course.pk}/").status_code in (403, 404)
        assert client.post(COURSES, {"title": "x", "slug": "x"}, format="json").status_code == 403


def test_course_with_enrollments_cannot_return_to_draft_or_be_deleted(client_for, make_course, make_user):
    from apps.learning.services import enroll_free

    editor = client_for(roles.CONTENT_EDITOR)
    course = make_course()
    enroll_free(make_user(), course)
    assert editor.post(f"{COURSES}{course.pk}/status/", {"status": "draft"}, format="json").status_code == 409
    assert editor.delete(f"{COURSES}{course.pk}/").status_code in (400, 409)
    assert editor.post(f"{COURSES}{course.pk}/status/", {"status": "archived"}, format="json").status_code == 200


def test_sale_price_must_be_below_price(client_for):
    editor = client_for(roles.CONTENT_EDITOR)
    res = _create(editor, price="1000.00", sale_price="1500.00")
    assert res.status_code == 400
    assert "sale_price" in res.json()["error"]["details"]


def test_reorder_must_cover_every_item(client_for, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    course = make_course(lessons=3)
    module = course.modules.get()
    second = CourseModule.objects.create(course=course, title="Module 2", position=1)
    l1, l2, l3 = Lesson.objects.filter(course=course).order_by("position")
    url = f"{COURSES}{course.pk}/curriculum/reorder/"

    res = editor.post(url, {"modules": [{"id": module.pk, "lessons": [l1.pk]}]}, format="json")
    assert res.status_code == 409

    payload = {"modules": [{"id": second.pk, "lessons": [l3.pk, l1.pk]}, {"id": module.pk, "lessons": [l2.pk]}]}
    res = editor.post(url, payload, format="json")
    assert res.status_code == 200, res.json()
    assert [m["id"] for m in res.json()] == [second.pk, module.pk]
    l1.refresh_from_db()
    assert l1.module_id == second.pk and l1.position == 2


def test_lesson_with_progress_cannot_be_deleted(client_for, make_course, make_user):
    from apps.learning.services import enroll_free, record_progress

    editor = client_for(roles.CONTENT_EDITOR)
    course = make_course()
    lesson = course.lessons.first()
    enrollment, _ = enroll_free(make_user(), course)
    record_progress(enrollment, lesson, completed=True)
    assert editor.delete(f"/api/v1/admin/catalog/lessons/{lesson.pk}/").status_code == 409


def test_category_tree_is_two_levels(client_for):
    editor = client_for(roles.CONTENT_EDITOR)
    url = "/api/v1/admin/catalog/categories/"
    top = editor.post(url, {"name": "Programming", "slug": "programming"}, format="json").json()
    child = editor.post(url, {"name": "Python", "slug": "python", "parent": top["id"]}, format="json")
    assert child.status_code == 201
    res = editor.post(url, {"name": "Django", "slug": "django", "parent": child.json()["id"]}, format="json")
    assert res.status_code == 400
    assert client_for(roles.INSTRUCTOR).post(url, {"name": "X", "slug": "x"}, format="json").status_code == 403
    assert client_for(roles.INSTRUCTOR).get(url).status_code == 200


def test_course_model_price_helpers(make_course):
    from datetime import timedelta
    from decimal import Decimal

    from django.utils import timezone

    course = make_course(price=Decimal("1000"), sale_price=Decimal("700"))
    assert course.current_price() == Decimal("700") and not course.is_free()
    course.sale_ends_at = timezone.now() - timedelta(minutes=1)
    assert course.current_price() == Decimal("1000")
    assert make_course().is_free()
    assert Course.objects.count() == 2
