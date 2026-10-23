"""Live-class rules: batches and members, scheduling, the join gate,
attendance and reminders.

A learner may join a session when all of these hold, checked on the server at
the moment they press "Join":
1. the session is scheduled (not cancelled);
2. they are a member of the session's batch;
3. their enrollment in the batch's course is active;
4. the join window is open: from JOIN_OPENS_BEFORE before the start until
   the scheduled end.
"""

from dataclasses import dataclass
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit import services as audit
from apps.catalog.models import CourseInstructor
from apps.learning.models import Enrollment
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from common.exceptions import ConflictError, DomainError

from . import policies, providers
from .models import AttendanceRecord, Batch, BatchMembership, ClassSession

JOIN_OPENS_BEFORE = timedelta(minutes=15)
REMINDER_LEAD = timedelta(minutes=60)
MIN_DURATION = timedelta(minutes=15)
MAX_DURATION = timedelta(hours=8)
MAX_WEEKLY_REPEATS = 26
MAX_MEMBERS_PER_REQUEST = 200
LEARNER_LINK = "/dashboard/classes"


def local_zone() -> ZoneInfo:
    return ZoneInfo(settings.TIME_ZONE)


def fmt_local(dt) -> str:
    return dt.astimezone(local_zone()).strftime("%a %d %b %Y, %I:%M %p (Nepal time)")


# --- Batches and members ---------------------------------------------------------------


@transaction.atomic
def create_batch(course, *, actor, request=None, **fields) -> Batch:
    if course.status == course.Status.ARCHIVED:
        raise DomainError("This course is archived.", code="course_archived")
    try:
        with transaction.atomic():
            batch = Batch.objects.create(course=course, created_by=actor, **fields)
    except IntegrityError:
        raise ValidationError({"name": ["This course already has a batch with that name."]}) from None
    audit.record("live_classes.batch_created", actor=actor, target=batch, request=request, course=course.pk)
    return batch


@transaction.atomic
def update_batch(batch: Batch, *, actor, request=None, **fields) -> Batch:
    for key, value in fields.items():
        setattr(batch, key, value)
    if batch.capacity is not None and batch.capacity < batch.memberships.count():
        raise ValidationError({"capacity": ["The batch already has more members than that."]})
    try:
        with transaction.atomic():
            batch.save()
    except IntegrityError:
        raise ValidationError({"name": ["This course already has a batch with that name."]}) from None
    audit.record("live_classes.batch_updated", actor=actor, target=batch, request=request, fields=sorted(fields))
    return batch


@transaction.atomic
def delete_batch(batch: Batch, *, actor, request=None):
    if batch.sessions.exists():
        raise ConflictError("This batch has sessions. Archive it instead.", code="has_sessions")
    audit.record("live_classes.batch_deleted", actor=actor, target=batch, request=request, course=batch.course_id)
    batch.delete()


def _enrolled_user_ids(course_id, user_ids) -> set[int]:
    return set(
        Enrollment.objects.filter(
            course_id=course_id, user_id__in=user_ids, status=Enrollment.Status.ACTIVE, user__is_active=True
        ).values_list("user_id", flat=True)
    )


@dataclass
class MembershipResult:
    added: list[int]
    already_members: list[int]
    not_enrolled: list[int]


@transaction.atomic
def add_members(batch: Batch, users, *, actor, request=None) -> MembershipResult:
    """Only learners with an active enrollment in the course can join a batch."""
    batch = Batch.objects.select_for_update().get(pk=batch.pk)
    if batch.status != Batch.Status.ACTIVE:
        raise ConflictError("This batch is archived.", code="batch_archived")
    users = list({u.pk: u for u in users}.values())
    if len(users) > MAX_MEMBERS_PER_REQUEST:
        raise ValidationError({"users": [f"Add at most {MAX_MEMBERS_PER_REQUEST} learners at a time."]})
    ids = [u.pk for u in users]
    existing = set(BatchMembership.objects.filter(batch=batch, user_id__in=ids).values_list("user_id", flat=True))
    enrolled = _enrolled_user_ids(batch.course_id, ids)
    to_add = [u for u in users if u.pk not in existing and u.pk in enrolled]
    if batch.capacity is not None and batch.memberships.count() + len(to_add) > batch.capacity:
        free = max(batch.capacity - batch.memberships.count(), 0)
        raise ConflictError(f"The batch has room for {free} more learner(s).", code="batch_full")
    BatchMembership.objects.bulk_create([BatchMembership(batch=batch, user=u, added_by=actor) for u in to_add])
    if to_add:
        audit.record(
            "live_classes.members_added", actor=actor, target=batch, request=request, users=[u.pk for u in to_add]
        )
    return MembershipResult(
        added=[u.pk for u in to_add],
        already_members=[i for i in ids if i in existing],
        not_enrolled=[i for i in ids if i not in existing and i not in enrolled],
    )


def add_all_enrolled(batch: Batch, *, actor, request=None) -> MembershipResult:
    from apps.accounts.models import User

    candidates = User.objects.filter(
        enrollments__course_id=batch.course_id, enrollments__status=Enrollment.Status.ACTIVE, is_active=True
    ).exclude(batch_memberships__batch=batch)[: MAX_MEMBERS_PER_REQUEST + 1]
    candidates = list(candidates)
    if len(candidates) > MAX_MEMBERS_PER_REQUEST:
        raise ValidationError(
            {"users": [f"More than {MAX_MEMBERS_PER_REQUEST} learners are waiting. Add them by email in groups."]}
        )
    return add_members(batch, candidates, actor=actor, request=request)


@transaction.atomic
def remove_member(membership: BatchMembership, *, actor, request=None):
    audit.record(
        "live_classes.member_removed", actor=actor, target=membership.batch, request=request, user=membership.user_id
    )
    membership.delete()


def eligible_learners(batch: Batch):
    """Members who may currently join: active account and active enrollment."""
    from apps.accounts.models import User

    return User.objects.filter(
        batch_memberships__batch=batch,
        is_active=True,
        enrollments__course_id=batch.course_id,
        enrollments__status=Enrollment.Status.ACTIVE,
    ).distinct()


# --- Scheduling ------------------------------------------------------------------------


def _check_instructor(batch: Batch, instructor):
    if instructor is None:
        return
    on_team = CourseInstructor.objects.filter(course_id=batch.course_id, user=instructor).exists()
    if not on_team:
        raise ValidationError({"instructor": ["Choose someone on this course's teaching team."]})


def _check_times(starts_at, ends_at, *, now):
    if starts_at < now - timedelta(minutes=5):
        raise ValidationError({"starts_at": ["The start time is in the past."]})
    if ends_at <= starts_at:
        raise ValidationError({"ends_at": ["The class must end after it starts."]})
    if ends_at - starts_at < MIN_DURATION:
        raise ValidationError({"ends_at": ["A class lasts at least 15 minutes."]})
    if ends_at - starts_at > MAX_DURATION:
        raise ValidationError({"ends_at": ["A class lasts at most 8 hours."]})


def _weekly(starts_at, ends_at, count):
    """Same Nepal wall-clock time each week (Nepal has no daylight saving,
    but the arithmetic is done in local time so it would stay right)."""
    zone = local_zone()
    start_local, length = starts_at.astimezone(zone), ends_at - starts_at
    for week in range(count):
        start = (start_local + timedelta(weeks=week)).replace(tzinfo=zone)
        yield start, start + length


@transaction.atomic
def schedule(
    batch: Batch,
    *,
    actor,
    title,
    starts_at,
    ends_at,
    provider,
    join_url,
    passcode="",
    description="",
    instructor=None,
    repeat_weeks=1,
    request=None,
) -> list[ClassSession]:
    batch = Batch.objects.select_for_update().get(pk=batch.pk)
    if batch.status != Batch.Status.ACTIVE:
        raise ConflictError("This batch is archived.", code="batch_archived")
    if not 1 <= repeat_weeks <= MAX_WEEKLY_REPEATS:
        raise ValidationError({"repeat_weeks": [f"Repeat for 1 to {MAX_WEEKLY_REPEATS} weeks."]})
    _check_times(starts_at, ends_at, now=timezone.now())
    _check_instructor(batch, instructor)
    link = providers.get(provider).parse(join_url)
    series = ClassSession.new_series_id() if repeat_weeks > 1 else None
    sessions = [
        ClassSession(
            batch=batch,
            title=title if repeat_weeks == 1 else f"{title} (week {i + 1})",
            description=description,
            starts_at=start,
            ends_at=end,
            instructor=instructor,
            provider=provider,
            join_url=link.url,
            external_meeting_id=link.meeting_id,
            passcode=passcode,
            series_id=series,
            created_by=actor,
        )
        for i, (start, end) in enumerate(_weekly(starts_at, ends_at, repeat_weeks))
    ]
    ClassSession.objects.bulk_create(sessions)
    audit.record(
        "live_classes.sessions_scheduled",
        actor=actor,
        target=batch,
        request=request,
        count=len(sessions),
        first=sessions[0].starts_at.isoformat(),
    )
    return sessions


def _lock(session: ClassSession) -> ClassSession:
    return ClassSession.objects.select_for_update(of=("self",)).select_related("batch__course").get(pk=session.pk)


@transaction.atomic
def update_session(session: ClassSession, *, actor, request=None, **fields) -> ClassSession:
    """Edit details; moving the time of a future session is a reschedule and
    the members are told. Started or cancelled sessions keep their times."""
    session = _lock(session)
    now = timezone.now()
    if session.status == ClassSession.Status.CANCELLED:
        raise ConflictError("This class was cancelled.", code="cancelled")

    starts_at = fields.pop("starts_at", session.starts_at)
    ends_at = fields.pop("ends_at", session.ends_at)
    moved = starts_at != session.starts_at or ends_at != session.ends_at
    if moved:
        if session.starts_at <= now:
            raise ConflictError("This class has already started, so its time cannot change.", code="started")
        _check_times(starts_at, ends_at, now=now)
    if "instructor" in fields:
        _check_instructor(session.batch, fields["instructor"])
    provider = fields.pop("provider", session.provider)
    join_url = fields.pop("join_url", None)
    if join_url is not None or provider != session.provider:
        link = providers.get(provider).parse(join_url if join_url is not None else session.join_url)
        session.provider, session.join_url, session.external_meeting_id = provider, link.url, link.meeting_id

    had_recording = bool(session.recording_url)
    for key, value in fields.items():
        setattr(session, key, value)
    if moved:
        if session.original_starts_at is None:
            session.original_starts_at = session.starts_at
        session.starts_at, session.ends_at, session.reminder_sent_at = starts_at, ends_at, None
    session.save()
    audit.record(
        "live_classes.session_updated",
        actor=actor,
        target=session,
        request=request,
        rescheduled=moved,
        fields=sorted(fields) + (["time"] if moved else []),
    )
    if moved:
        notifications.notify(
            eligible_learners(session.batch),
            kind=Notification.Kind.CLASS_RESCHEDULED,
            title=f"Class rescheduled: {session.title}",
            body=f"{session.batch.course.title}. The class now starts {fmt_local(session.starts_at)}.",
            link=LEARNER_LINK,
            email=True,
        )
    if session.recording_url and not had_recording and session.ends_at <= now:
        notifications.notify(
            eligible_learners(session.batch),
            kind=Notification.Kind.CLASS_RECORDING,
            title=f"Recording available: {session.title}",
            body=f"The recording of this {session.batch.course.title} class is ready.",
            link=LEARNER_LINK,
        )
    return session


@transaction.atomic
def cancel_session(session: ClassSession, *, reason: str, actor, request=None) -> ClassSession:
    session = _lock(session)
    if session.status == ClassSession.Status.CANCELLED:
        raise ConflictError("This class is already cancelled.", code="cancelled")
    if session.ends_at <= timezone.now():
        raise ConflictError("This class has already taken place.", code="ended")
    session.status, session.cancelled_at, session.cancel_reason = (
        ClassSession.Status.CANCELLED,
        timezone.now(),
        reason.strip()[:300],
    )
    session.save(update_fields=["status", "cancelled_at", "cancel_reason", "updated_at"])
    audit.record("live_classes.session_cancelled", actor=actor, target=session, request=request)
    body = f"{session.batch.course.title}, {fmt_local(session.starts_at)}."
    if session.cancel_reason:
        body += f" Reason: {session.cancel_reason}"
    notifications.notify(
        eligible_learners(session.batch),
        kind=Notification.Kind.CLASS_CANCELLED,
        title=f"Class cancelled: {session.title}",
        body=body,
        link=LEARNER_LINK,
        email=True,
    )
    return session


# --- Learner access ----------------------------------------------------------------


def is_member(user, batch: Batch) -> bool:
    return BatchMembership.objects.filter(batch=batch, user=user).exists()


def learner_can_see(user, session: ClassSession) -> bool:
    if not (user and user.is_authenticated and user.is_active):
        return False
    return (
        is_member(user, session.batch)
        and Enrollment.objects.filter(
            user=user, course_id=session.batch.course_id, status=Enrollment.Status.ACTIVE
        ).exists()
    )


def join_window(session: ClassSession):
    return session.starts_at - JOIN_OPENS_BEFORE, session.ends_at


def join(session: ClassSession, user, *, request=None) -> ClassSession:
    """Return the session if `user` may join right now; record the first join."""
    course = session.batch.course
    staff = policies.can_see_meeting_details(user, course)
    if not staff and not learner_can_see(user, session):
        raise DomainError("You are not in this class.", code="not_member", status_code=403)
    if session.status == ClassSession.Status.CANCELLED:
        raise DomainError("This class was cancelled.", code="cancelled", status_code=409)
    opens, closes = join_window(session)
    now = timezone.now()
    if not staff and now < opens:
        raise DomainError(f"You can join from {fmt_local(opens)}.", code="not_open_yet", status_code=409)
    if now > closes:
        raise DomainError("This class has ended.", code="ended", status_code=409)
    if not staff:
        record, created = AttendanceRecord.objects.get_or_create(
            session=session, user=user, defaults={"joined_at": now}
        )
        if not created and record.joined_at is None:
            AttendanceRecord.objects.filter(pk=record.pk, joined_at__isnull=True).update(joined_at=now)
    return session


# --- Attendance ------------------------------------------------------------------------


def roster(session: ClassSession) -> list[dict]:
    """Every batch member plus anyone with an attendance row (e.g. removed later)."""
    records = {r.user_id: r for r in session.attendance.select_related("user")}
    members = {m.user_id: m.user for m in session.batch.memberships.select_related("user")}
    users = {**{uid: r.user for uid, r in records.items()}, **members}
    rows = []
    for uid, user in sorted(users.items(), key=lambda kv: (kv[1].full_name.lower(), kv[1].email)):
        record = records.get(uid)
        rows.append({"user": user, "record": record, "is_member": uid in members})
    return rows


@transaction.atomic
def set_attendance(session: ClassSession, entries: list[dict], *, actor, request=None) -> int:
    session = _lock(session)
    if session.status == ClassSession.Status.CANCELLED:
        raise ConflictError("This class was cancelled.", code="cancelled")
    now = timezone.now()
    if session.starts_at > now:
        raise ConflictError("Attendance can be marked once the class has started.", code="not_started")
    allowed = set(session.batch.memberships.values_list("user_id", flat=True)) | set(
        session.attendance.values_list("user_id", flat=True)
    )
    unknown = sorted({e["user"] for e in entries} - allowed)
    if unknown:
        raise ValidationError({"entries": [f"Not in this batch: {', '.join(map(str, unknown))}."]})
    for entry in entries:
        status = entry["status"]
        AttendanceRecord.objects.update_or_create(
            session=session,
            user_id=entry["user"],
            defaults={
                "status": status,
                "note": entry.get("note", "")[:300],
                "marked_by": actor if status else None,
                "marked_at": now if status else None,
            },
        )
    audit.record("live_classes.attendance_marked", actor=actor, target=session, request=request, count=len(entries))
    return len(entries)


# --- Reminders -----------------------------------------------------------------------


def send_due_reminders(now=None) -> int:
    """Remind members of sessions starting within REMINDER_LEAD. Each session is
    claimed under a row lock (skip_locked), so overlapping workers never send twice."""
    now = now or timezone.now()
    due = ClassSession.objects.filter(
        status=ClassSession.Status.SCHEDULED,
        reminder_sent_at__isnull=True,
        starts_at__gt=now,
        starts_at__lte=now + REMINDER_LEAD,
    ).values_list("pk", flat=True)
    sent = 0
    for pk in list(due[:500]):
        with transaction.atomic():
            session = (
                ClassSession.objects.select_for_update(skip_locked=True, of=("self",))
                .select_related("batch__course")
                .filter(pk=pk, reminder_sent_at__isnull=True, status=ClassSession.Status.SCHEDULED)
                .first()
            )
            if session is None:
                continue
            session.reminder_sent_at = now
            session.save(update_fields=["reminder_sent_at", "updated_at"])
            notifications.notify(
                eligible_learners(session.batch),
                kind=Notification.Kind.CLASS_REMINDER,
                title=f"Class soon: {session.title}",
                body=(
                    f"{session.batch.course.title} starts {fmt_local(session.starts_at)} on "
                    f"{session.get_provider_display()}. Join from your dashboard."
                ),
                link=LEARNER_LINK,
                email=True,
            )
            sent += 1
    return sent
