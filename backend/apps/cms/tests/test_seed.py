import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.cms import services
from apps.cms.management.commands.seed_cms import HOME_SECTIONS, PREVIOUS_MENUS, PREVIOUS_SECTIONS
from apps.cms.models import BlogPost, Menu, Page, SiteSettings
from apps.cms.sections import clean_sections

pytestmark = pytest.mark.django_db


def test_seed_cms_is_idempotent_and_preserves_edits():
    call_command("seed_cms")
    anon = APIClient()
    home = anon.get("/api/v1/home-page/").json()
    assert home["slug"] == "home"
    assert [s["type"] for s in home["sections"]] == [s["type"] for s in HOME_SECTIONS]
    assert [i["label"] for i in anon.get("/api/v1/menus/legal/").json()["items"]] == [
        "Terms of service",
        "Privacy policy",
    ]

    settings = SiteSettings.load()
    settings.tagline = "Edited by admin"
    settings.save()
    Page.objects.filter(slug="about").update(title="Edited")

    call_command("seed_cms")
    assert SiteSettings.load().tagline == "Edited by admin"
    assert Page.objects.get(slug="about").title == "Edited"
    assert Page.objects.count() == 5
    assert Menu.objects.get(location="header").items.count() == 4
    assert BlogPost.objects.filter(status="published").count() == 3


def test_demo_testimonials_are_labelled_as_samples():
    call_command("seed_cms")
    section = next(s for s in Page.objects.get(slug="home").sections if s["type"] == "testimonials")
    assert "sample" in section["data"]["heading"].lower()
    assert all(item["name"].startswith("Sample") for item in section["data"]["items"])


def _seed_previous_home():
    page = services.create_page(
        data={"title": "Home", "slug": "home", "sections": clean_sections(PREVIOUS_SECTIONS["home"][0])}, actor=None
    )
    page = services.publish_page(page, actor=None)
    services.set_home_page(page, actor=None)
    items = [{"label": label, "url": "/" + target.lstrip("/")} for label, target in PREVIOUS_MENUS["header"][0]]
    services.replace_menu("header", title="Main navigation", items=items, actor=None)
    return page


def test_untouched_earlier_demo_content_is_upgraded():
    page = _seed_previous_home()
    call_command("seed_cms")
    page.refresh_from_db()
    assert [s["type"] for s in page.published_version.sections] == [s["type"] for s in HOME_SECTIONS]
    assert page.versions.count() == 2  # the earlier demo stays in the history
    # The header menu was linked by URL rather than by page here, so it no longer
    # matches the seeded menu exactly and is left alone.
    assert Menu.objects.get(location="header").items.count() == 3


def test_edited_demo_content_is_never_replaced():
    page = _seed_previous_home()
    sections = clean_sections(PREVIOUS_SECTIONS["home"][0])
    sections[0]["data"]["heading"] = "Our own heading"
    services.update_page(page, data={"sections": sections}, actor=None)  # draft edit, not yet published
    call_command("seed_cms")
    page.refresh_from_db()
    assert page.sections[0]["data"]["heading"] == "Our own heading"
    assert [s["type"] for s in page.published_version.sections] == ["hero", "features", "faq", "cta"]
