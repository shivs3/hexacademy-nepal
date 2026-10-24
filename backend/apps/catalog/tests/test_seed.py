import pytest
from django.core.management import call_command

from apps.accounts import roles
from apps.catalog.models import Course

pytestmark = pytest.mark.django_db


def test_seed_without_instructor_leaves_drafts(make_user):
    call_command("seed_catalog")
    assert set(Course.objects.values_list("status", flat=True)) == {"draft"}


def test_seed_publishes_with_instructor_and_is_idempotent(make_user, api_client):
    teacher = make_user(roles.INSTRUCTOR)
    call_command("seed_catalog", instructor=teacher.email)
    call_command("seed_catalog", instructor=teacher.email)
    assert Course.objects.filter(status="published").count() == 6
    paid = Course.objects.get(slug="demo-ioe-msc-entrance-preparation")
    assert paid.current_price() == 3500 and paid.price == 4500
    detail = api_client.get("/api/v1/courses/demo-python-fundamentals/").json()
    assert "Demo" in detail["title"] and "Demo content" in detail["description"]
