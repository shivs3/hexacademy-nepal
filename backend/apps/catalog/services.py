"""Catalog business rules. Views authorise the caller (see policies.py) and
validate input shapes; everything that changes state goes through here."""

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.audit import services as audit
from common.exceptions import ConflictError, DomainError

from .models import Category, Course, CourseInstructor, CourseModule, Lesson

MAX_MODULES_PER_COURSE = 60
MAX_LESSONS_PER_MODULE = 100
MAX_TEAM_SIZE = 12


def _locked(course: Course) -> Course:
    return Course.objects.select_for_update().get(pk=course.pk)


# --- Courses -------------------------------------------------------------------------


@transaction.atomic
def create_course(*, data: dict, actor, request=None) -> Course:
    course = Course.objects.create(**data, created_by=actor, updated_by=actor)
    if not actor.has_perm("catalog.manage_catalog"):
        # An instructor who creates a course teaches it.
        CourseInstructor.objects.create(course=course, user=actor, role=CourseInstructor.Role.INSTRUCTOR)
    audit.record("catalog.course_created", actor=actor, target=course, request=request)
    return course


@transaction.atomic
def update_course(course: Course, *, data: dict, actor, request=None) -> Course:
    course = _locked(course)
    for key, value in data.items():
        setattr(course, key, value)
    course.updated_by = actor
    course.save()
    if {"price", "sale_price", "sale_ends_at"} & data.keys():
        audit.record(
            "catalog.course_pricing_changed",
            actor=actor,
            target=course,
            request=request,
            price=str(course.price),
            sale_price=None if course.sale_price is None else str(course.sale_price),
        )
    return course


def publish_problems(course: Course) -> list[str]:
    problems = []
    if not course.subtitle and not course.description:
        problems.append("Add a subtitle or description.")
    if not Lesson.objects.filter(course=course, is_published=True).exists():
        problems.append("Publish at least one lesson.")
    if not course.instructor_links.filter(role=CourseInstructor.Role.INSTRUCTOR).exists():
        problems.append("Assign at least one instructor.")
    return problems


@transaction.atomic
def set_status(course: Course, status: str, *, actor, request=None) -> Course:
    course = _locked(course)
    if status == course.status:
        return course
    if status == Course.Status.PUBLISHED:
        problems = publish_problems(course)
        if problems:
            raise DomainError(" ".join(problems), code="not_publishable")
        course.published_at = course.published_at or timezone.now()
    elif status == Course.Status.DRAFT and course.enrollments.exists():
        # Enrolled learners keep access to archived courses; a draft would look like it never existed.
        raise ConflictError("This course has learners. Archive it instead of returning it to draft.")
    course.status = status
    course.updated_by = actor
    course.save(update_fields=["status", "published_at", "updated_by", "updated_at"])
    audit.record(f"catalog.course_{status}", actor=actor, target=course, request=request)
    return course


@transaction.atomic
def delete_course(course: Course, *, actor, request=None):
    if course.status != Course.Status.DRAFT:
        raise ConflictError("Only draft courses can be deleted. Archive published courses instead.")
    if course.enrollments.exists():
        raise ConflictError("This course has enrollments and cannot be deleted.")
    audit.record("catalog.course_deleted", actor=actor, target=course, request=request)
    course.delete()


@transaction.atomic
def set_team(course: Course, members: list[dict], *, actor, request=None) -> list[CourseInstructor]:
    """Replace the teaching team. members: [{"user": User, "role": str, "is_public": bool}]."""
    if len(members) > MAX_TEAM_SIZE:
        raise DomainError(f"A course can have at most {MAX_TEAM_SIZE} team members.")
    user_ids = [m["user"].pk for m in members]
    if len(set(user_ids)) != len(user_ids):
        raise DomainError("Each person can only be listed once.")
    course = _locked(course)
    course.instructor_links.all().delete()
    links = CourseInstructor.objects.bulk_create(
        CourseInstructor(course=course, user=m["user"], role=m["role"], is_public=m.get("is_public", True), position=i)
        for i, m in enumerate(members)
    )
    audit.record(
        "catalog.course_team_changed",
        actor=actor,
        target=course,
        request=request,
        team=[{"user": m["user"].pk, "role": m["role"]} for m in members],
    )
    return links


# --- Categories ----------------------------------------------------------------------


def validate_category_parent(category: Category | None, parent: Category | None):
    if parent is None:
        return
    if parent.parent_id is not None:
        raise DomainError("Subcategories cannot have their own subcategories.")
    if category is not None and category.pk:
        if parent.pk == category.pk:
            raise DomainError("A category cannot be its own parent.")
        if category.children.exists():
            raise DomainError("This category has subcategories, so it cannot become a subcategory itself.")


def delete_category(category: Category, *, actor, request=None):
    if category.children.exists():
        raise ConflictError("Delete or move its subcategories first.")
    audit.record("catalog.category_deleted", actor=actor, target=category, request=request)
    category.delete()  # courses keep everything except the category (SET_NULL)


# --- Curriculum ----------------------------------------------------------------------


@transaction.atomic
def create_module(course: Course, *, title: str, description: str = "") -> CourseModule:
    course = _locked(course)
    if course.modules.count() >= MAX_MODULES_PER_COURSE:
        raise DomainError(f"A course can have at most {MAX_MODULES_PER_COURSE} modules.")
    position = (course.modules.aggregate(m=Max("position"))["m"] or 0) + 1
    return CourseModule.objects.create(course=course, title=title, description=description, position=position)


def delete_module(module: CourseModule):
    if module.lessons.exists():
        raise ConflictError("Move or delete this module's lessons first.")
    module.delete()


@transaction.atomic
def create_lesson(module: CourseModule, *, data: dict) -> Lesson:
    module = CourseModule.objects.select_for_update().get(pk=module.pk)
    if module.lessons.count() >= MAX_LESSONS_PER_MODULE:
        raise DomainError(f"A module can have at most {MAX_LESSONS_PER_MODULE} lessons.")
    position = (module.lessons.aggregate(m=Max("position"))["m"] or 0) + 1
    return Lesson.objects.create(module=module, course_id=module.course_id, position=position, **data)


def delete_lesson(lesson: Lesson):
    if lesson.progress.exists():
        raise ConflictError("Learners have started this lesson. Unpublish it instead of deleting it.")
    storage_names = [(r.file.storage, r.file.name) for r in lesson.resources.all() if r.file]
    with transaction.atomic():
        lesson.delete()
        for storage, name in storage_names:
            transaction.on_commit(lambda s=storage, n=name: s.delete(n))


@transaction.atomic
def reorder_curriculum(course: Course, layout: list[dict]):
    """layout: [{"id": module_id, "lessons": [lesson_id, ...]}, ...] covering
    every module and lesson of the course exactly once. Lessons may move
    between modules of the same course."""
    course = _locked(course)
    modules = {m.pk: m for m in course.modules.all()}
    lessons = {lesson.pk: lesson for lesson in Lesson.objects.filter(course=course)}

    module_ids = [entry.get("id") for entry in layout]
    lesson_ids = [lid for entry in layout for lid in entry.get("lessons", [])]
    if sorted(module_ids) != sorted(modules) or sorted(lesson_ids) != sorted(lessons):
        raise ConflictError("The curriculum changed while you were editing. Reload and try again.")

    for m_pos, entry in enumerate(layout, start=1):
        module = modules[entry["id"]]
        if module.position != m_pos:
            module.position = m_pos
            module.save(update_fields=["position", "updated_at"])
        for l_pos, lesson_id in enumerate(entry.get("lessons", []), start=1):
            lesson = lessons[lesson_id]
            if lesson.position != l_pos or lesson.module_id != module.pk:
                lesson.position = l_pos
                lesson.module_id = module.pk
                lesson.save(update_fields=["position", "module", "updated_at"])


# Curriculum order: modules by position, then lessons by position within each.
LESSON_ORDER = ("module__position", "module_id", "position", "id")


def ordered_lessons(course: Course, *, published_only: bool = True):
    qs = Lesson.objects.filter(course=course).select_related("module").order_by(*LESSON_ORDER)
    return qs.filter(is_published=True) if published_only else qs
