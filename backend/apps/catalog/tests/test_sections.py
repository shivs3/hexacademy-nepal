"""Catalog-backed page-builder sections and their reference pickers."""

import pytest

from apps.accounts import roles

pytestmark = pytest.mark.django_db


def _section(page, section_type):
    return next(s for s in page["sections"] if s["type"] == section_type)


def _publish_page(client, sections):
    res = client.post(
        "/api/v1/admin/cms/pages/", {"title": "Home", "slug": "learn", "sections": sections}, format="json"
    )
    assert res.status_code == 201, res.json()
    page_id = res.json()["id"]
    assert client.post(f"/api/v1/admin/cms/pages/{page_id}/publish/", {}, format="json").status_code == 200


def test_collection_section_shows_only_published_courses_in_chosen_order(client_for, api_client, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    first, second = make_course(title="First"), make_course(title="Second")
    draft = make_course(status="draft", title="Hidden draft")
    _publish_page(
        editor,
        [{"type": "course_collection", "data": {"heading": "Picks", "courses": [second.pk, draft.pk, first.pk]}}],
    )
    page = api_client.get("/api/v1/pages/learn/").json()
    cards = _section(page, "course_collection")["data"]["courses"]
    assert [c["slug"] for c in cards] == [second.slug, first.slug]


def test_reference_to_missing_course_is_rejected(client_for):
    editor = client_for(roles.CONTENT_EDITOR)
    res = editor.post(
        "/api/v1/admin/cms/pages/",
        {"title": "X", "slug": "x", "sections": [{"type": "course_collection", "data": {"courses": [999999]}}]},
        format="json",
    )
    assert res.status_code == 400


def test_featured_section_resolves_featured_courses(client_for, api_client, make_course):
    editor = client_for(roles.CONTENT_EDITOR)
    star = make_course(is_featured=True)
    make_course()
    _publish_page(editor, [{"type": "featured_courses", "data": {"heading": "Featured", "source": "featured"}}])
    data = _section(api_client.get("/api/v1/pages/learn/").json(), "featured_courses")["data"]
    assert [c["slug"] for c in data["courses"]] == [star.slug]


def test_reference_options_need_page_permission(client_for, make_course):
    make_course(title="Machine Learning")
    editor = client_for(roles.CONTENT_EDITOR)
    res = editor.get("/api/v1/admin/cms/references/course/", {"search": "machine"})
    assert res.status_code == 200
    assert [o["label"] for o in res.json()] == ["Machine Learning"]
    archived = make_course(slug="old", title="Old Course", status="archived")
    res = editor.get("/api/v1/admin/cms/references/course/", {"ids": str(archived.pk)})
    assert [o["label"] for o in res.json()] == ["Old Course"]  # a stored selection is labelled even if archived
    assert editor.get("/api/v1/admin/cms/references/course/", {"ids": "1,x"}).status_code == 400
    assert editor.get("/api/v1/admin/cms/references/nope/").status_code == 404
    assert client_for(roles.INSTRUCTOR).get("/api/v1/admin/cms/references/course/").status_code == 403


def test_section_types_are_described_with_refs(client_for):
    res = client_for(roles.CONTENT_EDITOR).get("/api/v1/admin/cms/section-types/")
    assert res.status_code == 200
    by_type = {t["type"]: t for t in res.json()}
    courses_field = next(f for f in by_type["course_collection"]["fields"] if f["name"] == "courses")
    assert courses_field["kind"] == "refs" and courses_field["ref"] == "course"
