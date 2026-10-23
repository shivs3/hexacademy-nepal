"""Who may do what with assignments and submissions.

- Authoring (create, edit, publish, delete an assignment) follows course
  content editing: catalog managers, and instructors on the course.
- Reading and grading learners' work is for the course's teaching team
  (instructors and teaching assistants) and holders of
  ``learning.grade_all_submissions``. Content editors author assignments but
  do not read submissions.
- Learners see published assignments of courses they are actively enrolled
  in, and only their own submission.
"""

from django.db.models import QuerySet

from apps.catalog import policies as catalog
from apps.catalog.models import Course

from .models import Assignment, Enrollment

GRADE_ALL = "learning.grade_all_submissions"


def _active(user) -> bool:
    return bool(user and user.is_authenticated and user.is_active)


def can_author(user, course: Course) -> bool:
    return _active(user) and catalog.can_edit_content(user, course)


def can_grade(user, course: Course) -> bool:
    if not _active(user):
        return False
    return user.has_perm(GRADE_ALL) or catalog.teaching_role(user, course) is not None


def can_view(user, course: Course) -> bool:
    return can_author(user, course) or can_grade(user, course)


def staff_assignments(user) -> QuerySet[Assignment]:
    """Assignments this user may open in the staff area."""
    if not _active(user):
        return Assignment.objects.none()
    if user.has_perm(GRADE_ALL) or catalog.can_manage_catalog(user):
        return Assignment.objects.all()
    return Assignment.objects.filter(course_id__in=catalog.taught_course_ids(user))


def gradable_assignments(user) -> QuerySet[Assignment]:
    if not _active(user):
        return Assignment.objects.none()
    if user.has_perm(GRADE_ALL):
        return Assignment.objects.all()
    return Assignment.objects.filter(course_id__in=catalog.taught_course_ids(user))


def learner_assignments(user) -> QuerySet[Assignment]:
    if not _active(user):
        return Assignment.objects.none()
    enrolled = Enrollment.objects.filter(user=user, status=Enrollment.Status.ACTIVE).values("course_id")
    return Assignment.objects.filter(is_published=True, course_id__in=enrolled)
