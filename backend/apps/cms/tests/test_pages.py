from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.cms import services
from apps.cms.models import Page

from .conftest import HERO

pytestmark = pytest.mark.django_db
ADMIN = "/api/v1/admin/cms/pages/"


def test_draft_is_not_public_until_published(editor, make_page):
    page = make_page("about")
    anon = APIClient()
    assert anon.get("/api/v1/pages/about/").status_code == 404

    res = editor.post(f"{ADMIN}{page['id']}/publish/", {}, format="json")
    assert res.status_code == 200
    assert res.json()["status"] == "published"
    body = anon.get("/api/v1/pages/about/").json()
    assert body["title"] == "About"
    assert body["sections"][0]["data"]["heading"] == "Learn with Hexacademy"
    assert AuditLog.objects.filter(action="cms.page_published").exists()


def test_editing_published_page_does_not_change_live_content(editor, make_page):
    page = make_page("about", publish=True)
    changed = {**HERO, "data": {**HERO["data"], "heading": "Unreleased heading"}}
    res = editor.patch(f"{ADMIN}{page['id']}/", {"sections": [changed]}, format="json")
    assert res.status_code == 200
    assert res.json()["has_unpublished_changes"] is True
    assert res.json()["latest_version_number"] == 2

    live = APIClient().get("/api/v1/pages/about/").json()
    assert live["sections"][0]["data"]["heading"] == "Learn with Hexacademy"

    preview = editor.get(f"{ADMIN}{page['id']}/preview/").json()
    assert preview["sections"][0]["data"]["heading"] == "Unreleased heading"


def test_unchanged_save_does_not_create_a_version(editor, make_page):
    page = make_page("about")
    editor.patch(f"{ADMIN}{page['id']}/", {"title": "About"}, format="json")
    versions = editor.get(f"{ADMIN}{page['id']}/versions/").json()
    assert versions["count"] == 1


def test_restore_version_copies_into_draft(editor, make_page):
    page = make_page("about")
    changed = {**HERO, "data": {**HERO["data"], "heading": "Second"}}
    editor.patch(f"{ADMIN}{page['id']}/", {"title": "Renamed", "sections": [changed]}, format="json")
    res = editor.post(f"{ADMIN}{page['id']}/restore/", {"version": 1}, format="json")
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "About"
    assert data["sections"][0]["data"]["heading"] == "Learn with Hexacademy"
    assert data["latest_version_number"] == 3
    versions = editor.get(f"{ADMIN}{page['id']}/versions/").json()["results"]
    assert versions[0]["note"] == "Restored from version 1"


def test_unpublish_and_archive_hide_page(editor, make_page):
    page = make_page("about", publish=True)
    assert editor.post(f"{ADMIN}{page['id']}/unpublish/").json()["status"] == "draft"
    assert APIClient().get("/api/v1/pages/about/").status_code == 404
    editor.post(f"{ADMIN}{page['id']}/publish/", {}, format="json")
    assert editor.post(f"{ADMIN}{page['id']}/archive/").json()["status"] == "archived"
    assert APIClient().get("/api/v1/pages/about/").status_code == 404


def test_cannot_publish_empty_page(editor, make_page):
    page = make_page("empty", sections=[])
    res = editor.post(f"{ADMIN}{page['id']}/publish/", {}, format="json")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "page_empty"


def test_home_page_is_unique_and_protected(editor, make_page):
    first = make_page("home", publish=True)
    draft = make_page("start")
    res = editor.post(f"{ADMIN}{draft['id']}/make-home/")
    assert res.json()["error"]["code"] == "page_not_published"

    assert editor.post(f"{ADMIN}{first['id']}/make-home/").status_code == 200
    assert APIClient().get("/api/v1/home-page/").json()["slug"] == "home"
    editor.post(f"{ADMIN}{draft['id']}/publish/", {}, format="json")
    assert editor.post(f"{ADMIN}{draft['id']}/make-home/").json()["is_home"] is True
    assert Page.objects.filter(is_home=True).count() == 1
    assert APIClient().get("/api/v1/home-page/").json()["slug"] == "start"

    # The home page can be neither deleted nor taken offline.
    assert editor.delete(f"{ADMIN}{draft['id']}/").json()["error"]["code"] == "page_is_home"
    assert editor.post(f"{ADMIN}{draft['id']}/unpublish/").json()["error"]["code"] == "page_is_home"
    assert editor.post(f"{ADMIN}{draft['id']}/archive/").json()["error"]["code"] == "page_is_home"
    # is_home is not writable through the generic update.
    editor.patch(f"{ADMIN}{first['id']}/", {"is_home": True}, format="json")
    assert not Page.objects.get(pk=first["id"]).is_home


def test_published_page_must_be_unpublished_before_delete(editor, make_page):
    page = make_page("about", publish=True)
    assert editor.delete(f"{ADMIN}{page['id']}/").status_code == 400
    editor.post(f"{ADMIN}{page['id']}/unpublish/")
    assert editor.delete(f"{ADMIN}{page['id']}/").status_code == 204
    assert not Page.objects.filter(pk=page["id"]).exists()


def test_reserved_and_duplicate_slugs_rejected(editor, make_page):
    res = editor.post(ADMIN, {"title": "Login", "slug": "login", "sections": []}, format="json")
    assert res.status_code == 400
    assert "slug" in res.json()["error"]["details"]
    make_page("about")
    res = editor.post(ADMIN, {"title": "About 2", "slug": "about", "sections": []}, format="json")
    assert res.status_code == 400


def test_duplicate_creates_draft_copy(editor, make_page):
    page = make_page("about", publish=True)
    res = editor.post(f"{ADMIN}{page['id']}/duplicate/")
    assert res.status_code == 201
    copy = res.json()
    assert copy["slug"] == "about-copy"
    assert copy["status"] == "draft"
    assert editor.post(f"{ADMIN}{page['id']}/duplicate/").json()["slug"] == "about-copy-2"


def test_scheduled_publication(editor, make_page):
    page = make_page("launch")
    when = timezone.now() + timedelta(hours=1)
    res = editor.post(f"{ADMIN}{page['id']}/schedule/", {"publish_at": when.isoformat()}, format="json")
    assert res.status_code == 200
    assert res.json()["scheduled_version_number"] == 1

    assert services.publish_due_pages() == 0
    assert APIClient().get("/api/v1/pages/launch/").status_code == 404

    assert services.publish_due_pages(now=when + timedelta(seconds=1)) == 1
    obj = Page.objects.get(pk=page["id"])
    assert obj.status == Page.Status.PUBLISHED and obj.scheduled_for is None
    assert APIClient().get("/api/v1/pages/launch/").status_code == 200


def test_schedule_rejects_past_time(editor, make_page):
    page = make_page("launch")
    past = timezone.now() - timedelta(minutes=1)
    res = editor.post(f"{ADMIN}{page['id']}/schedule/", {"publish_at": past.isoformat()}, format="json")
    assert res.json()["error"]["code"] == "schedule_in_past"


def test_cancel_schedule(editor, make_page):
    page = make_page("launch")
    when = timezone.now() + timedelta(hours=1)
    editor.post(f"{ADMIN}{page['id']}/schedule/", {"publish_at": when.isoformat()}, format="json")
    res = editor.post(f"{ADMIN}{page['id']}/cancel-schedule/")
    assert res.json()["scheduled_for"] is None
    assert services.publish_due_pages(now=when + timedelta(minutes=1)) == 0


def test_celery_task_publishes_due_pages(editor, make_page):
    from apps.cms.tasks import publish_scheduled_pages

    page = make_page("launch")
    obj = Page.objects.get(pk=page["id"])
    obj.scheduled_version = obj.versions.first()
    obj.scheduled_for = timezone.now() - timedelta(seconds=5)
    obj.save()
    assert publish_scheduled_pages.delay().get() == 1
