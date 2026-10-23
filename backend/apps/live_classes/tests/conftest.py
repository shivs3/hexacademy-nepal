from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.learning.models import Enrollment
from apps.live_classes.models import Batch, BatchMembership, ClassSession

MEET = "https://meet.google.com/abc-defg-hij"


def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    c.user = user
    return c


@pytest.fixture
def enroll():
    def _enroll(user, course, status=Enrollment.Status.ACTIVE):
        return Enrollment.objects.create(
            user=user,
            course=course,
            source=Enrollment.Source.ADMIN,
            status=status,
            revoked_at=timezone.now() if status == Enrollment.Status.REVOKED else None,
        )

    return _enroll


@pytest.fixture
def make_session():
    """ORM-only session at any time (bypasses the "not in the past" rule)."""

    def _make(batch, *, start_in=timedelta(hours=2), length=timedelta(hours=1), **extra):
        starts = timezone.now() + start_in
        return ClassSession.objects.create(
            batch=batch,
            title=extra.pop("title", "Live class"),
            starts_at=starts,
            ends_at=starts + length,
            provider=extra.pop("provider", ClassSession.Provider.GOOGLE_MEET),
            join_url=extra.pop("join_url", MEET),
            external_meeting_id="abc-defg-hij",
            passcode=extra.pop("passcode", "s3cret"),
            **extra,
        )

    return _make


@pytest.fixture
def world(make_user, make_course, enroll, make_session):
    """A course taught by `instructor` (with `ta`), one batch with an enrolled
    member `learner`, an enrolled non-member `outsider`, and a session."""
    instructor = make_user(roles.INSTRUCTOR)
    ta = make_user(roles.TEACHING_ASSISTANT)
    course = make_course(instructor=instructor, ta=ta)
    batch = Batch.objects.create(course=course, name="Morning cohort", created_by=instructor)
    learner, outsider = make_user(), make_user()
    enroll(learner, course)
    enroll(outsider, course)
    BatchMembership.objects.create(batch=batch, user=learner)
    session = make_session(batch)
    return SimpleNamespace(
        instructor=instructor, ta=ta, course=course, batch=batch, learner=learner, outsider=outsider, session=session
    )
