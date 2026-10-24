import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.accounts.management.commands.seed_demo import DEMO_INSTRUCTOR
from apps.accounts.models import User
from apps.assessments.models import Exam
from apps.catalog.models import Course

pytestmark = pytest.mark.django_db


def test_seed_demo_creates_everything_once_with_a_locked_instructor():
    call_command("seed_demo")
    call_command("seed_demo")

    instructor = User.objects.get(email=DEMO_INSTRUCTOR["email"])
    assert not instructor.has_usable_password()  # nobody can sign in as the demo instructor
    assert roles.INSTRUCTOR in roles.role_slugs_for(instructor)
    assert "demo" in instructor.profile.headline.lower()

    assert Course.objects.filter(status="published").count() == 6
    assert Course.objects.filter(is_featured=True).count() == 3
    assert Exam.objects.filter(status="published").count() == 1

    anon = APIClient()
    catalog = anon.get("/api/v1/courses/").json()
    assert catalog["count"] == 6
    assert all("(Demo)" in c["title"] for c in catalog["results"])
    home = anon.get("/api/v1/home-page/").json()
    instructors = next(s for s in home["sections"] if s["type"] == "instructors")
    assert [i["full_name"] for i in instructors["data"]["instructors"]] == ["Demo Instructor"]


def test_seed_demo_keeps_an_existing_password_and_profile(make_user):
    user = make_user(email=DEMO_INSTRUCTOR["email"])
    user.profile.headline = "Kept"
    user.profile.save()
    call_command("seed_demo")
    user.refresh_from_db()
    assert user.has_usable_password()
    assert user.profile.headline == "Kept"
