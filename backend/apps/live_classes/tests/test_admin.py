from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.accounts import roles
from apps.audit.models import AuditLog
from apps.live_classes import services
from apps.live_classes.models import AttendanceRecord, Batch, BatchMembership, ClassSession
from apps.notifications.models import Notification

from .conftest import MEET, client

pytestmark = pytest.mark.django_db

NPT = ZoneInfo("Asia/Kathmandu")
BATCHES = "/api/v1/admin/live-classes/batches/"
SESSIONS = "/api/v1/admin/live-classes/sessions/"


def next_week_at(hour, minute=0):
    day = (timezone.now() + timedelta(days=7)).astimezone(NPT).date()
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=NPT)


def schedule_payload(world, **extra):
    start = next_week_at(18)
    return {
        "batch": world.batch.pk,
        "title": "Python basics",
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(minutes=90)).isoformat(),
        "instructor": world.instructor.pk,
        "provider": "google_meet",
        "join_url": MEET,
        **extra,
    }


# --- Visibility and permissions ---------------------------------------------------------


def test_instructor_sees_only_their_batches(world, make_user, make_course):
    other = make_course(instructor=make_user(roles.INSTRUCTOR))
    Batch.objects.create(course=other, name="Other")
    res = client(world.instructor).get(BATCHES)
    assert [b["id"] for b in res.json()["results"]] == [world.batch.pk]
    assert res.json()["results"][0]["member_count"] == 1
    assert res.json()["results"][0]["can_schedule"] is True


def test_other_instructor_cannot_read_or_change(world, make_user):
    stranger = client(make_user(roles.INSTRUCTOR))
    assert stranger.get(f"{BATCHES}{world.batch.pk}/").status_code == 404
    assert stranger.get(f"{SESSIONS}{world.session.pk}/").status_code == 404
    assert stranger.post(SESSIONS, schedule_payload(world), format="json").status_code == 403
    assert stranger.post(BATCHES, {"course": world.course.pk, "name": "Mine"}, format="json").status_code == 403


def test_students_and_finance_are_refused(world, make_user):
    for c in (client(world.learner), client(make_user(roles.FINANCE_MANAGER)), client(make_user(roles.CONTENT_EDITOR))):
        assert c.get(BATCHES).status_code == 403
        assert c.get(SESSIONS).status_code == 403


def test_teaching_assistant_views_and_marks_but_cannot_schedule(world):
    ta = client(world.ta)
    res = ta.get(f"{SESSIONS}{world.session.pk}/")
    assert res.status_code == 200
    assert res.json()["join_url"] == MEET
    assert res.json()["can_schedule"] is False and res.json()["can_take_attendance"] is True
    assert ta.post(SESSIONS, schedule_payload(world), format="json").status_code == 403
    assert ta.post(f"{SESSIONS}{world.session.pk}/cancel/", {}, format="json").status_code == 403
    assert ta.post(f"{BATCHES}{world.batch.pk}/members/", {"all_enrolled": True}, format="json").status_code == 403


def test_support_sees_schedule_but_never_the_link(world, make_user):
    support = client(make_user(roles.SUPPORT_STAFF))
    res = support.get(SESSIONS)
    assert res.status_code == 200
    [row] = res.json()["results"]
    assert row["join_url"] == "" and row["passcode"] == "" and row["external_meeting_id"] == ""
    assert MEET not in res.content.decode()
    assert support.get(f"{SESSIONS}{world.session.pk}/attendance/").status_code == 403
    assert support.post(SESSIONS, schedule_payload(world), format="json").status_code == 403


def test_super_admin_manages_everything(world, make_user):
    admin = client(make_user(roles.SUPER_ADMIN))
    assert admin.post(SESSIONS, schedule_payload(world), format="json").status_code == 201


# --- Batches and members ---------------------------------------------------------------


def test_create_batch_and_duplicate_name(world):
    c = client(world.instructor)
    res = c.post(BATCHES, {"course": world.course.pk, "name": "Evening", "capacity": 2}, format="json")
    assert res.status_code == 201, res.json()
    dup = c.post(BATCHES, {"course": world.course.pk, "name": "Evening"}, format="json")
    assert dup.status_code == 400
    assert "name" in dup.json()["error"]["details"]
    assert AuditLog.objects.filter(action="live_classes.batch_created").count() == 1


def test_add_members_requires_active_enrollment(world, make_user):
    stranger = make_user()
    res = client(world.instructor).post(
        f"{BATCHES}{world.batch.pk}/members/",
        {"emails": [world.outsider.email, stranger.email, world.learner.email, "nobody@example.com"]},
        format="json",
    )
    assert res.status_code == 200, res.json()
    assert res.json() == {
        "added": 1,
        "already_members": 1,
        "not_enrolled": [stranger.email],
        "unknown": ["nobody@example.com"],
    }
    assert BatchMembership.objects.filter(batch=world.batch).count() == 2


def test_capacity_is_enforced(world, make_user, enroll):
    world.batch.capacity = 1
    world.batch.save()
    res = client(world.instructor).post(f"{BATCHES}{world.batch.pk}/members/", {"all_enrolled": True}, format="json")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "batch_full"
    res = client(world.instructor).patch(f"{BATCHES}{world.batch.pk}/", {"capacity": 0}, format="json")
    assert res.status_code == 400


def test_remove_member_and_delete_rules(world):
    c = client(world.instructor)
    membership = BatchMembership.objects.get(batch=world.batch, user=world.learner)
    assert c.delete(f"{BATCHES}{world.batch.pk}/members/{membership.pk}/").status_code == 204
    assert not BatchMembership.objects.filter(pk=membership.pk).exists()
    res = c.delete(f"{BATCHES}{world.batch.pk}/")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "has_sessions"


# --- Scheduling ------------------------------------------------------------------------


def test_schedule_weekly_series_keeps_nepal_wall_clock(world):
    res = client(world.instructor).post(SESSIONS, schedule_payload(world, repeat_weeks=3), format="json")
    assert res.status_code == 201, res.json()
    rows = res.json()
    assert [r["title"] for r in rows] == ["Python basics (week 1)", "Python basics (week 2)", "Python basics (week 3)"]
    sessions = ClassSession.objects.filter(pk__in=[r["id"] for r in rows]).order_by("starts_at")
    assert len({s.series_id for s in sessions}) == 1
    for week, s in enumerate(sessions):
        local = s.starts_at.astimezone(NPT)
        assert (local.hour, local.minute) == (18, 0)
        assert s.starts_at - sessions[0].starts_at == timedelta(weeks=week)
        assert s.ends_at - s.starts_at == timedelta(minutes=90)


@pytest.mark.parametrize(
    "change, field",
    [
        ({"join_url": "https://evil.example/abc-defg-hij"}, "join_url"),
        ({"provider": "zoom"}, "join_url"),
        ({"starts_at": "2020-01-01T10:00:00+05:45", "ends_at": "2020-01-01T11:00:00+05:45"}, "starts_at"),
        ({"repeat_weeks": 27}, "repeat_weeks"),
    ],
)
def test_schedule_validation(world, change, field):
    res = client(world.instructor).post(SESSIONS, schedule_payload(world, **change), format="json")
    assert res.status_code == 400
    assert field in res.json()["error"]["details"]


def test_schedule_rejects_short_class_and_outside_instructor(world, make_user):
    start = next_week_at(9)
    short = schedule_payload(world, ends_at=(start + timedelta(minutes=10)).isoformat(), starts_at=start.isoformat())
    assert "ends_at" in client(world.instructor).post(SESSIONS, short, format="json").json()["error"]["details"]
    outsider = make_user(roles.INSTRUCTOR)
    res = client(world.instructor).post(SESSIONS, schedule_payload(world, instructor=outsider.pk), format="json")
    assert "instructor" in res.json()["error"]["details"]


def test_archived_batch_cannot_be_scheduled(world):
    world.batch.status = Batch.Status.ARCHIVED
    world.batch.save()
    res = client(world.instructor).post(SESSIONS, schedule_payload(world), format="json")
    assert res.status_code == 409


def test_reschedule_notifies_members_and_resets_reminder(world, mailoutbox, django_capture_on_commit_callbacks):
    world.session.reminder_sent_at = timezone.now()
    world.session.save()
    old_start = world.session.starts_at
    new_start = next_week_at(19)
    with django_capture_on_commit_callbacks(execute=True):
        res = client(world.instructor).patch(
            f"{SESSIONS}{world.session.pk}/",
            {"starts_at": new_start.isoformat(), "ends_at": (new_start + timedelta(hours=1)).isoformat()},
            format="json",
        )
    assert res.status_code == 200, res.json()
    world.session.refresh_from_db()
    assert world.session.original_starts_at == old_start
    assert world.session.reminder_sent_at is None
    [note] = Notification.objects.filter(kind="class_rescheduled")
    assert note.user == world.learner  # not the outsider, not staff
    assert "Nepal time" in note.body
    assert [m.to for m in mailoutbox] == [[world.learner.email]]


def test_started_class_cannot_move(world, make_session):
    live = make_session(world.batch, start_in=timedelta(minutes=-10))
    start = next_week_at(8)
    res = client(world.instructor).patch(
        f"{SESSIONS}{live.pk}/",
        {"starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat()},
        format="json",
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "started"


def test_recording_after_class_notifies(world, make_session):
    past = make_session(world.batch, start_in=timedelta(hours=-3))
    res = client(world.instructor).patch(
        f"{SESSIONS}{past.pk}/", {"recording_url": "https://drive.google.com/file/d/x"}, format="json"
    )
    assert res.status_code == 200, res.json()
    assert Notification.objects.filter(kind="class_recording", user=world.learner).count() == 1
    bad = client(world.instructor).patch(f"{SESSIONS}{past.pk}/", {"recording_url": "http://x.example"}, format="json")
    assert bad.status_code == 400


def test_cancel_notifies_and_is_final(world, mailoutbox, django_capture_on_commit_callbacks):
    c = client(world.instructor)
    with django_capture_on_commit_callbacks(execute=True):
        res = c.post(f"{SESSIONS}{world.session.pk}/cancel/", {"reason": "Instructor unwell"}, format="json")
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled" and res.json()["state"] == "cancelled"
    note = Notification.objects.get(kind="class_cancelled")
    assert note.user == world.learner and "Instructor unwell" in note.body
    assert len(mailoutbox) == 1
    assert c.post(f"{SESSIONS}{world.session.pk}/cancel/", {}, format="json").status_code == 409
    assert c.patch(f"{SESSIONS}{world.session.pk}/", {"title": "New"}, format="json").status_code == 409
    assert AuditLog.objects.filter(action="live_classes.session_cancelled").exists()


def test_unverified_email_gets_in_app_notice_only(world, mailoutbox, django_capture_on_commit_callbacks):
    type(world.learner).objects.filter(pk=world.learner.pk).update(email_verified_at=None)
    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        client(world.instructor).post(f"{SESSIONS}{world.session.pk}/cancel/", {}, format="json")
    assert len(callbacks) == 1
    assert Notification.objects.filter(user=world.learner).count() == 1
    assert mailoutbox == []


# --- Attendance ------------------------------------------------------------------------


def test_attendance_only_after_start_and_only_for_members(world, make_session):
    c = client(world.ta)
    url = f"{SESSIONS}{world.session.pk}/attendance/"
    entry = {"entries": [{"user": world.learner.pk, "status": "present"}]}
    assert c.put(url, entry, format="json").status_code == 409  # not started
    live = make_session(world.batch, start_in=timedelta(minutes=-30))
    url = f"{SESSIONS}{live.pk}/attendance/"
    res = c.put(url, {"entries": [{"user": world.outsider.pk, "status": "present"}]}, format="json")
    assert res.status_code == 400
    res = c.put(url, {"entries": [{"user": world.learner.pk, "status": "late", "note": "10 min"}]}, format="json")
    assert res.status_code == 200, res.json()
    [row] = res.json()
    assert row["status"] == "late" and row["note"] == "10 min" and row["marked_by_name"] == world.ta.full_name
    record = AttendanceRecord.objects.get(session=live, user=world.learner)
    assert record.marked_by == world.ta and record.marked_at is not None
    res = c.put(url, {"entries": [{"user": world.learner.pk, "status": ""}]}, format="json")
    record.refresh_from_db()
    assert record.status == "" and record.marked_at is None
    summary = c.get(f"{SESSIONS}{live.pk}/attendance-summary/").json()
    assert summary["present"] == 0 and summary["late"] == 0


def test_roster_lists_members_and_join_evidence(world, make_session):
    live = make_session(world.batch, start_in=timedelta(minutes=-5))
    client(world.learner).post(f"/api/v1/class-sessions/{live.pk}/join/")
    [row] = client(world.instructor).get(f"{SESSIONS}{live.pk}/attendance/").json()
    assert row["user"]["id"] == world.learner.pk
    assert row["is_member"] is True and row["joined_at"] is not None and row["status"] == ""


# --- Reminders -------------------------------------------------------------------------


def test_reminders_are_sent_once(world, make_session, mailoutbox, django_capture_on_commit_callbacks):
    soon = make_session(world.batch, start_in=timedelta(minutes=40))
    make_session(world.batch, start_in=timedelta(hours=5))  # too early for a reminder
    make_session(
        world.batch, start_in=timedelta(minutes=30), status=ClassSession.Status.CANCELLED, cancelled_at=timezone.now()
    )
    with django_capture_on_commit_callbacks(execute=True):
        assert services.send_due_reminders() == 1
        assert services.send_due_reminders() == 0
    soon.refresh_from_db()
    assert soon.reminder_sent_at is not None
    assert Notification.objects.filter(kind="class_reminder").count() == 1
    assert len(mailoutbox) == 1


def test_reminder_task_runs(world, make_session):
    from apps.live_classes.tasks import send_class_reminders

    make_session(world.batch, start_in=timedelta(minutes=20))
    assert send_class_reminders.apply().get() == 1


def test_course_options_are_courses_i_instruct(world, make_user, make_course):
    make_course(instructor=make_user(roles.INSTRUCTOR))
    res = client(world.instructor).get("/api/v1/admin/live-classes/courses/")
    assert [c["id"] for c in res.json()] == [world.course.pk]
    assert client(world.ta).get("/api/v1/admin/live-classes/courses/").json() == []


def test_team_lists_teaching_staff(world):
    res = client(world.instructor).get(f"{BATCHES}{world.batch.pk}/team/")
    assert {(r["id"], r["role"]) for r in res.json()} == {
        (world.instructor.pk, "instructor"),
        (world.ta.pk, "teaching_assistant"),
    }
