"""Who may see and change questions, exams and results.

- ``assessments.manage_question_bank`` (exam coordinators, super admins): every
  subject, topic and question, including answer keys.
- ``assessments.manage_exams``: every exam, its configuration and results.
- ``assessments.author_course_assessments`` (instructors): questions and exams
  of the courses where they are listed as instructor. They can also read and
  use the active questions of the shared bank (questions without a course),
  but not edit them.
- Teaching assistants listed on a course can see that course's exams and
  results. They never see the question bank or answer keys.

Finance and content staff get none of these, so they never see answer keys.
"""

from django.db.models import Q, QuerySet

from apps.catalog.models import CourseInstructor
from apps.catalog.policies import taught_course_ids

from .models import Exam, Question

MANAGE_BANK = "assessments.manage_question_bank"
MANAGE_EXAMS = "assessments.manage_exams"
AUTHOR = "assessments.author_course_assessments"


def _active(user) -> bool:
    return bool(user and user.is_authenticated and user.is_active)


def can_manage_bank(user) -> bool:
    return _active(user) and user.has_perm(MANAGE_BANK)


def can_manage_exams(user) -> bool:
    return _active(user) and user.has_perm(MANAGE_EXAMS)


def authored_course_ids(user) -> list[int]:
    """Courses this user may write questions and exams for (instructor role on the team)."""
    if not (_active(user) and user.has_perm(AUTHOR)):
        return []
    return list(
        CourseInstructor.objects.filter(user=user, role=CourseInstructor.Role.INSTRUCTOR).values_list(
            "course_id", flat=True
        )
    )


def can_open_bank(user) -> bool:
    """Exam managers read the bank to build exams; authors also write their own courses' questions."""
    return can_manage_bank(user) or can_manage_exams(user) or (_active(user) and user.has_perm(AUTHOR))


def can_open_exams(user) -> bool:
    return can_manage_exams(user) or can_open_bank(user) or bool(taught_course_ids(user))


# --- Questions -----------------------------------------------------------------------


def visible_questions(user) -> QuerySet[Question]:
    if can_manage_bank(user):
        return Question.objects.all()
    if not can_open_bank(user):
        return Question.objects.none()
    if can_manage_exams(user):
        return Question.objects.filter(status=Question.Status.ACTIVE)
    shared = Q(course__isnull=True, status=Question.Status.ACTIVE)
    return Question.objects.filter(shared | Q(course_id__in=authored_course_ids(user)))


def can_edit_question(user, question: Question) -> bool:
    if can_manage_bank(user):
        return True
    return question.course_id is not None and question.course_id in authored_course_ids(user)


def can_create_question_for(user, course_id: int | None) -> bool:
    if can_manage_bank(user):
        return True
    return course_id is not None and course_id in authored_course_ids(user)


# --- Exams ---------------------------------------------------------------------------


def visible_exams(user) -> QuerySet[Exam]:
    if can_manage_exams(user):
        return Exam.objects.all()
    if not _active(user):
        return Exam.objects.none()
    return Exam.objects.filter(course_id__in=taught_course_ids(user))


def can_edit_exam(user, exam: Exam) -> bool:
    if can_manage_exams(user):
        return True
    return exam.course_id is not None and exam.course_id in authored_course_ids(user)


def can_create_exam_for(user, course_id: int | None) -> bool:
    if can_manage_exams(user):
        return True
    return course_id is not None and course_id in authored_course_ids(user)
