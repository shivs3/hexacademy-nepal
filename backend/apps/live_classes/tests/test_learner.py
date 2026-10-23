from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts import roles
from apps.learning.models import Enrollment
from apps.live_classes.models import AttendanceRecord, ClassSession

from .conftest import MEET, client

pytestmark = pytest.mark.django_db

LIST = "/api/v1/me/class-sessions/"


def join(c, session):
    return c.post(f"/api/v1/class-sessions/{session.pk}/join/")


def test_member_sees_session_without_link(world):
    res = client(world.learner).get(LIST)
    assert res.status_code == 200
    [row] = res.json()["results"]
    assert row["id"] == world.session.pk
    assert row["state"] == "upcoming"
    assert "join_url" not in row and "passcode" not in row
    assert MEET not in res.content.decode() and "s3cret" not in res.content.decode()


def test_detail_never_contains_link(world):
    res = client(world.learner).get(f"/api/v1/class-sessions/{world.session.pk}/")
    assert res.status_code == 200
    assert MEET not in res.content.decode()


def test_non_member_and_anonymous_see_nothing(world, api_client):
    assert client(world.outsider).get(LIST).json()["results"] == []
    assert client(world.outsider).get(f"/api/v1/class-sessions/{world.session.pk}/").status_code == 404
    assert api_client.get(LIST).status_code in (401, 403)
    assert join(api_client, world.session).status_code in (401, 403)


def test_revoked_enrollment_hides_sessions_and_blocks_join(world, make_session):
    Enrollment.objects.filter(user=world.learner).update(status="revoked", revoked_at=timezone.now())
    live = make_session(world.batch, start_in=timedelta(minutes=-5))
    c = client(world.learner)
    assert c.get(LIST).json()["results"] == []
    res = join(c, live)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "not_member"


def test_join_not_open_until_fifteen_minutes_before(world, make_session):
    early = make_session(world.batch, start_in=timedelta(minutes=30))
    res = join(client(world.learner), early)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "not_open_yet"
    assert not AttendanceRecord.objects.filter(session=early).exists()


def test_join_inside_window_returns_link_and_records_first_join(world, make_session):
    soon = make_session(world.batch, start_in=timedelta(minutes=10))
    c = client(world.learner)
    res = join(c, soon)
    assert res.status_code == 200
    assert res.json() == {"provider": "google_meet", "join_url": MEET, "passcode": "s3cret"}
    first = AttendanceRecord.objects.get(session=soon, user=world.learner).joined_at
    assert first is not None
    assert join(c, soon).status_code == 200
    assert AttendanceRecord.objects.get(session=soon, user=world.learner).joined_at == first
    assert AttendanceRecord.objects.get(session=soon, user=world.learner).status == ""  # staff mark attendance


def test_join_refused_after_end_and_when_cancelled(world, make_session):
    ended = make_session(world.batch, start_in=timedelta(hours=-2))
    assert join(client(world.learner), ended).json()["error"]["code"] == "ended"
    cancelled = make_session(
        world.batch, start_in=timedelta(minutes=5), status=ClassSession.Status.CANCELLED, cancelled_at=timezone.now()
    )
    res = join(client(world.learner), cancelled)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "cancelled"


def test_non_member_cannot_join_even_when_enrolled(world, make_session):
    live = make_session(world.batch, start_in=timedelta(minutes=-5))
    assert join(client(world.outsider), live).status_code == 403


def test_teaching_team_can_join_early_without_attendance(world):
    for user in (world.instructor, world.ta):
        assert join(client(user), world.session).status_code == 200
    assert not AttendanceRecord.objects.filter(session=world.session).exists()


def test_support_staff_cannot_get_the_link(world, make_user):
    support = make_user(roles.SUPPORT_STAFF)
    assert join(client(support), world.session).status_code == 403


def test_recording_and_notes_only_after_class(world, make_session):
    past = make_session(
        world.batch, start_in=timedelta(hours=-3), recording_url="https://drive.example/rec", notes="Slides inside"
    )
    world.session.recording_url = "https://drive.example/early"
    world.session.save()
    c = client(world.learner)
    upcoming = c.get(LIST).json()["results"]
    assert upcoming[0]["recording_url"] == ""
    [row] = c.get(LIST, {"scope": "past"}).json()["results"]
    assert row["id"] == past.pk
    assert row["state"] == "ended"
    assert row["recording_url"] == "https://drive.example/rec"
    assert row["notes"] == "Slides inside"


def test_my_attendance_is_shown_only_to_me(world, make_session):
    past = make_session(world.batch, start_in=timedelta(hours=-3))
    AttendanceRecord.objects.create(session=past, user=world.learner, status="present", marked_at=timezone.now())
    [row] = client(world.learner).get(LIST, {"scope": "past"}).json()["results"]
    assert row["attendance"] == "present"
