"""Who may do what with live classes. Views ask these functions; the rules
live here only.

- ``live_classes.manage_all_classes``: every batch, session and attendance
  record (super administrators by default).
- ``live_classes.view_all_classes`` (support staff): read every batch and
  session to help learners, but never the meeting link or passcode.
- ``live_classes.teach_assigned_classes`` (instructors, teaching assistants):
  for courses where they are on the teaching team. Instructors create batches,
  schedule, reschedule and cancel sessions and manage members; teaching
  assistants can view them and mark attendance.
- Learners: sessions of batches they belong to, while their enrollment in the
  batch's course is active.
"""

from django.db.models import QuerySet

from apps.catalog import policies as catalog
from apps.catalog.models import Course, CourseInstructor

from .models import Batch

MANAGE_ALL = "live_classes.manage_all_classes"
VIEW_ALL = "live_classes.view_all_classes"
TEACH = "live_classes.teach_assigned_classes"


def _active(user) -> bool:
    return bool(user and user.is_authenticated and user.is_active)


def manages_all(user) -> bool:
    return _active(user) and user.has_perm(MANAGE_ALL)


def sees_all(user) -> bool:
    return manages_all(user) or (_active(user) and user.has_perm(VIEW_ALL))


def can_schedule(user, course: Course) -> bool:
    """Create batches and sessions, change schedules, manage members."""
    if manages_all(user):
        return True
    return (
        _active(user)
        and user.has_perm(TEACH)
        and catalog.teaching_role(user, course) == CourseInstructor.Role.INSTRUCTOR
    )


def can_take_attendance(user, course: Course) -> bool:
    if manages_all(user):
        return True
    return _active(user) and user.has_perm(TEACH) and catalog.teaching_role(user, course) is not None


def can_view(user, course: Course) -> bool:
    return sees_all(user) or (_active(user) and catalog.teaching_role(user, course) is not None)


def can_see_meeting_details(user, course: Course) -> bool:
    """Staff allowed to read the private link in the staff area."""
    return can_take_attendance(user, course)


def visible_batches(user) -> QuerySet[Batch]:
    if sees_all(user):
        return Batch.objects.all()
    if not _active(user):
        return Batch.objects.none()
    return Batch.objects.filter(course_id__in=catalog.taught_course_ids(user))


def schedulable_courses(user) -> QuerySet[Course]:
    qs = Course.objects.exclude(status=Course.Status.ARCHIVED)
    if manages_all(user):
        return qs
    if not (_active(user) and user.has_perm(TEACH)):
        return Course.objects.none()
    return qs.filter(instructor_links__user=user, instructor_links__role=CourseInstructor.Role.INSTRUCTOR).distinct()
