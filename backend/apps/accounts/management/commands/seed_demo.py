"""Seed all demo content in one step: CMS pages, catalog, and the practice exam.

Creates a demo instructor (no usable password, so nobody can sign in as it) to
own and publish the demo courses, then runs seed_cms, seed_catalog and
seed_exams. Every step is idempotent and leaves administrators' edits alone.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts import roles
from apps.accounts.models import UserProfile

DEMO_INSTRUCTOR = {
    "email": "demo-instructor@example.com",
    "full_name": "Demo Instructor",
    "headline": "Demo instructor profile — replace with a real instructor before launch",
    "bio": (
        "This profile is demo content created by the setup script. It does not describe a real person. "
        "Replace it with your instructors' own profiles, or remove it from the demo courses."
    ),
}


class Command(BaseCommand):
    help = "Create all demo content (pages, courses, practice exam) without overwriting existing edits."

    @transaction.atomic
    def handle(self, *args, **options):
        instructor = self._instructor()
        call_command("seed_cms", stdout=self.stdout)
        call_command("seed_catalog", instructor=instructor.email, stdout=self.stdout)
        call_command("seed_exams", stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS("Demo content ready."))

    def _instructor(self):
        User = get_user_model()  # noqa: N806
        spec = DEMO_INSTRUCTOR
        user = User.objects.filter(email__iexact=spec["email"]).first()
        if user is None:
            user = User.objects.create_user(email=spec["email"], password=None, full_name=spec["full_name"])
            user.set_unusable_password()
            user.save(update_fields=["password"])
            self.stdout.write(f"Account {user.email}: created without a usable password.")
        user.groups.add(Group.objects.get_or_create(name=roles.group_name(roles.INSTRUCTOR))[0])
        profile, _ = UserProfile.objects.get_or_create(user=user)
        blank = [f for f in ("headline", "bio") if not getattr(profile, f)]
        for field in blank:
            setattr(profile, field, spec[field])
        if blank:
            profile.save(update_fields=[*blank, "updated_at"])
        return user
