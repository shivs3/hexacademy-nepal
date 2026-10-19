import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.cms.models import Menu, Page, SiteSettings

pytestmark = pytest.mark.django_db


def test_seed_cms_is_idempotent_and_preserves_edits():
    call_command("seed_cms")
    anon = APIClient()
    assert anon.get("/api/v1/home-page/").json()["slug"] == "home"
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
    assert Menu.objects.get(location="header").items.count() == 3
