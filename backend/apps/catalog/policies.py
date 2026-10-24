"""Who may do what with a course. Every catalog and learning view asks these
functions rather than checking permissions inline, so the rules live in one
place:

- ``catalog.manage_catalog`` (content editors, super admins): every course,
  category, price and instructor assignment.
- ``catalog.author_assigned_courses`` (instructors): create courses, and edit
  the content and curriculum of courses where they are listed as instructor.
  Price, featured flag, slug of a live course and the teaching team stay with
  catalog managers.
- ``catalog.publish_courses``: change a course's status. Instructors without
  it hand a finished draft to an editor for publication.
- Teaching assistants listed on a course can view it (and its learners'
  progress) but not edit it.
"""

from django.db.models import QuerySet

from .models import Course, CourseInstructor

MANAGE_CATALOG = "catalog.manage_catalog"
PUBLISH_COURSES = "catalog.publish_courses"
AUTHOR_COURSES = "catalog.author_assigned_courses"


def _authenticated(user) -> bool:
    return bool(user and user.is_authenticated and user.is_active)


def can_manage_catalog(user) -> bool:
    return _authenticated(user) and user.has_perm(MANAGE_CATALOG)


def can_publish(user) -> bool:
    return _authenticated(user) and user.has_perm(PUBLISH_COURSES)


def can_create_course(user) -> bool:
    return can_manage_catalog(user) or (_authenticated(user) and user.has_perm(AUTHOR_COURSES))


def teaching_role(user, course: Course) -> str | None:
    if not _authenticated(user):
        return None
    # List views prefetch `instructor_links` so a page of rows costs no query each.
    if "instructor_links" in getattr(course, "_prefetched_objects_cache", {}):
        return next((link.role for link in course.instructor_links.all() if link.user_id == user.pk), None)
    return CourseInstructor.objects.filter(course=course, user=user).values_list("role", flat=True).first()


def can_edit_content(user, course: Course) -> bool:
    if can_manage_catalog(user):
        return True
    return user.has_perm(AUTHOR_COURSES) and teaching_role(user, course) == CourseInstructor.Role.INSTRUCTOR


def can_view_admin(user, course: Course) -> bool:
    """Open the course in the staff area (read-only for teaching assistants)."""
    return can_manage_catalog(user) or can_publish(user) or teaching_role(user, course) is not None


def admin_courses(user) -> QuerySet[Course]:
    """Courses this user may see in the staff area."""
    if can_manage_catalog(user) or can_publish(user):
        return Course.objects.all()
    if not _authenticated(user):
        return Course.objects.none()
    return Course.objects.filter(instructor_links__user=user).distinct()


def taught_course_ids(user) -> list[int]:
    if not _authenticated(user):
        return []
    return list(CourseInstructor.objects.filter(user=user).values_list("course_id", flat=True))
