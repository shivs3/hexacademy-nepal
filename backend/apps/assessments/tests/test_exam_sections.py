"""Sections inside an exam category, for example NRB › Paper I, II and III."""

import pytest
from rest_framework.test import APIClient

from apps.assessments.models import ExamCategory

pytestmark = pytest.mark.django_db
CATALOG = "/api/v1/exam-catalog/"
CATEGORIES = "/api/v1/admin/assessments/exam-categories/"


@pytest.fixture
def nrb(db):
    parent = ExamCategory.objects.create(name="NRB", slug="nrb")
    papers = [
        ExamCategory.objects.create(name=f"Paper {n}", slug=f"nrb-paper-{i}", parent=parent, position=i)
        for i, n in enumerate(["I", "II", "III"], start=1)
    ]
    return parent, papers


def slugs(res):
    return {row["slug"] for row in res.json()["results"]}


def test_public_catalog_groups_exams_by_section(nrb, make_exam):
    parent, (p1, p2, p3) = nrb
    a = make_exam(category=p1)
    b = make_exam(category=p2)
    general = make_exam(category=parent)
    other = make_exam()
    client = APIClient()

    assert slugs(client.get(CATALOG, {"category": "nrb"})) == {a.slug, b.slug, general.slug}
    assert slugs(client.get(CATALOG, {"category": "nrb-paper-1"})) == {a.slug}
    assert other.slug not in slugs(client.get(CATALOG, {"category": "nrb"}))

    row = next(r for r in client.get(CATALOG).json()["results"] if r["slug"] == a.slug)
    assert row["category"] == {"name": "Paper I", "slug": "nrb-paper-1", "parent": {"name": "NRB", "slug": "nrb"}}

    tree = client.get(f"{CATALOG}categories/").json()
    assert len(tree) == 1 and tree[0]["slug"] == "nrb" and tree[0]["exam_count"] == 3
    # Paper III has no exams yet, so it is left out.
    assert [c["slug"] for c in tree[0]["children"]] == ["nrb-paper-1", "nrb-paper-2"]
    assert tree[0]["children"][0]["exam_count"] == 1 and "children" not in tree[0]["children"][0]


def test_hiding_a_category_hides_its_sections(nrb, make_exam):
    parent, (p1, *_rest) = nrb
    exam = make_exam(category=p1)
    parent.is_active = False
    parent.save()
    client = APIClient()
    assert exam.slug not in slugs(client.get(CATALOG))
    assert client.get(f"{CATALOG}{exam.slug}/").status_code == 404
    assert client.get(f"{CATALOG}categories/").json() == []

    parent.is_active = True
    parent.save()
    p1.is_active = False
    p1.save()
    assert exam.slug not in slugs(client.get(CATALOG))


def test_manager_builds_sections_and_puts_exams_in_them(client_for, make_exam):
    coordinator = client_for("exam_coordinator")
    parent = coordinator.post(CATEGORIES, {"name": "NRB", "slug": "nrb"}, format="json").json()
    res = coordinator.post(
        CATEGORIES, {"name": "Paper I", "slug": "nrb-paper-1", "parent": parent["id"]}, format="json"
    )
    assert res.status_code == 201, res.content
    paper = res.json()
    assert paper["parent"] == parent["id"] and paper["parent_name"] == "NRB"

    exam = make_exam()
    res = coordinator.patch(f"/api/v1/admin/assessments/exams/{exam.pk}/", {"category": paper["id"]}, format="json")
    assert res.status_code == 200 and res.json()["category_name"] == "NRB › Paper I"

    rows = {r["id"]: r for r in coordinator.get(CATEGORIES).json()}
    assert rows[parent["id"]]["section_count"] == 1 and rows[paper["id"]]["exam_count"] == 1


def test_sections_are_one_level_deep(client_for, nrb):
    coordinator = client_for("exam_coordinator")
    parent, (p1, *_rest) = nrb
    # A section can't hold sections.
    res = coordinator.post(CATEGORIES, {"name": "Part A", "slug": "part-a", "parent": p1.pk}, format="json")
    assert res.status_code == 400 and "parent" in res.json()["error"]["details"]
    # A category with sections can't become a section.
    other = ExamCategory.objects.create(name="Loksewa", slug="loksewa")
    res = coordinator.patch(f"{CATEGORIES}{parent.pk}/", {"parent": other.pk}, format="json")
    assert res.status_code == 400 and "parent" in res.json()["error"]["details"]
    # Nor can a category be its own section.
    res = coordinator.patch(f"{CATEGORIES}{other.pk}/", {"parent": other.pk}, format="json")
    assert res.status_code == 400
    # Moving a section back to the top level is fine.
    res = coordinator.patch(f"{CATEGORIES}{p1.pk}/", {"parent": None}, format="json")
    assert res.status_code == 200 and res.json()["parent"] is None


def test_category_with_sections_cannot_be_deleted(client_for, nrb):
    coordinator = client_for("exam_coordinator")
    parent, papers = nrb
    res = coordinator.delete(f"{CATEGORIES}{parent.pk}/")
    assert res.status_code == 409
    assert ExamCategory.objects.filter(pk=parent.pk).exists()
    for p in papers:
        assert coordinator.delete(f"{CATEGORIES}{p.pk}/").status_code == 204
    assert coordinator.delete(f"{CATEGORIES}{parent.pk}/").status_code == 204


def test_only_exam_managers_change_sections(client_for, nrb):
    parent, _ = nrb
    res = client_for("content_editor").post(
        CATEGORIES, {"name": "Paper IV", "slug": "nrb-paper-4", "parent": parent.pk}, format="json"
    )
    assert res.status_code == 403
