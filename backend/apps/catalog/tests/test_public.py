from decimal import Decimal

import pytest

from apps.catalog.models import Category, Lesson

pytestmark = pytest.mark.django_db


def test_catalog_lists_only_published_courses(api_client, make_course):
    live = make_course(title="Live")
    make_course(status="draft", title="Draft")
    make_course(status="archived", title="Old")
    res = api_client.get("/api/v1/courses/")
    assert res.status_code == 200
    assert [c["slug"] for c in res.json()["results"]] == [live.slug]
    assert api_client.get("/api/v1/courses/course-does-not-exist/").status_code == 404


def test_draft_course_detail_is_404(api_client, make_course):
    draft = make_course(status="draft")
    assert api_client.get(f"/api/v1/courses/{draft.slug}/").status_code == 404


def test_detail_outline_hides_unpublished_lessons_and_never_exposes_bodies(api_client, make_course):
    course = make_course(lessons=2)
    hidden = Lesson.objects.create(
        course=course, module=course.modules.get(), title="Secret lesson", body="<p>secret</p>", position=9
    )
    res = api_client.get(f"/api/v1/courses/{course.slug}/")
    assert res.status_code == 200
    body = res.json()
    titles = [lesson["title"] for m in body["curriculum"] for lesson in m["lessons"]]
    assert titles == ["Lesson 1", "Lesson 2"]
    assert "Secret lesson" not in res.content.decode()
    assert "<p>Body</p>" not in res.content.decode() and "video_url" not in res.content.decode()
    assert body["lesson_count"] == 2 and hidden.pk


def test_filters_category_level_and_price(api_client, make_course):
    parent = Category.objects.create(name="Programming", slug="programming")
    child = Category.objects.create(name="Python", slug="python", parent=parent)
    py = make_course(category=child, level="beginner")
    paid = make_course(price=Decimal("1500"), level="advanced")
    sale_free = make_course(price=Decimal("1500"), sale_price=Decimal("0"))

    def slugs(**params):
        return {c["slug"] for c in api_client.get("/api/v1/courses/", params).json()["results"]}

    assert slugs(category="programming") == {py.slug}
    assert slugs(level="advanced") == {paid.slug}
    assert slugs(price="paid") == {paid.slug}
    assert slugs(price="free") == {py.slug, sale_free.slug}
    order = [c["slug"] for c in api_client.get("/api/v1/courses/", {"ordering": "price_high"}).json()["results"]]
    assert order[0] == paid.slug


def test_category_counts_include_children(api_client, make_course):
    parent = Category.objects.create(name="Programming", slug="programming")
    child = Category.objects.create(name="Python", slug="python", parent=parent)
    make_course(category=child)
    make_course(category=parent)
    make_course(category=parent, status="draft")
    tree = api_client.get("/api/v1/course-categories/").json()
    top = next(c for c in tree if c["slug"] == "programming")
    assert top["course_count"] == 2


def test_instructors_are_public_only_when_on_published_courses(api_client, make_course, make_user):
    visible = make_user(full_name="Asha Teacher")
    hidden = make_user(full_name="Draft Teacher")
    make_course(instructor=visible)
    make_course(status="draft", instructor=hidden)
    names = [i["full_name"] for i in api_client.get("/api/v1/instructors/").json()]
    assert names == ["Asha Teacher"]
    assert "email" not in api_client.get("/api/v1/instructors/").content.decode()


def test_course_sitemap_excludes_noindex_and_drafts(api_client, make_course):
    live = make_course()
    make_course(noindex=True)
    make_course(status="draft")
    rows = api_client.get("/api/v1/seo/course-sitemap/").json()
    assert [r["slug"] for r in rows] == [live.slug]
