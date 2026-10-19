"""Page-builder sections backed by the catalog. Registered with the CMS when
the app loads. Sections store ids; course and instructor data is looked up when
the page is served, so only published courses ever appear."""

from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.cms.sections import (
    HEADING,
    INTRO,
    Field,
    Reference,
    SectionType,
    cta_fields,
    register_reference,
    register_section_type,
)

from .models import Category, Course, CourseInstructor
from .serializers import CourseCardSerializer, category_tree, instructor_payload, published_courses

MAX_COLLECTION = 12


def _course_options(search: str, ids: set[int] | None = None):
    qs = Course.objects.order_by("title")
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    else:
        qs = qs.exclude(status=Course.Status.ARCHIVED)
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(slug__icontains=search))
    return [{"id": c.pk, "label": c.title, "description": c.get_status_display()} for c in qs[:30]]


def _category_options(search: str, ids: set[int] | None = None):
    qs = Category.objects.select_related("parent").order_by("parent__position", "position", "name")
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    if search:
        qs = qs.filter(name__icontains=search)
    return [{"id": c.pk, "label": c.name, "description": c.parent.name if c.parent else ""} for c in qs[:50]]


def _cards(courses) -> list[dict]:
    return list(CourseCardSerializer(courses, many=True).data)


def _resolve_featured(data: dict) -> dict:
    limit = data.get("limit") or 6
    qs = published_courses()
    source = data.get("source")
    if source == "featured":
        qs = qs.filter(is_featured=True)
    elif source == "category" and data.get("category"):
        qs = qs.filter(Q(category_id=data["category"]) | Q(category__parent_id=data["category"]))
    category = Category.objects.filter(pk=data.get("category")).first() if source == "category" else None
    return {
        **data,
        "category": {"name": category.name, "slug": category.slug} if category else None,
        "courses": _cards(qs.order_by("-published_at")[:limit]),
    }


def _resolve_collection(data: dict) -> dict:
    ids = data.get("courses") or []
    by_id = {c.pk: c for c in published_courses().filter(pk__in=ids)}
    return {**data, "courses": _cards([by_id[i] for i in ids if i in by_id])}


def _resolve_categories(data: dict) -> dict:
    tree = [c for c in category_tree() if c.course_count > 0]
    return {
        **data,
        "categories": [
            {"name": c.name, "slug": c.slug, "description": c.description, "course_count": c.course_count} for c in tree
        ],
    }


def public_instructors(limit: int | None = None) -> list[dict]:
    links = CourseInstructor.objects.filter(is_public=True, course__status=Course.Status.PUBLISHED)
    users = get_user_model().objects.filter(is_active=True, pk__in=links.values("user_id")).select_related("profile")
    users = users.order_by("full_name")
    return [instructor_payload(u) for u in (users[:limit] if limit else users)]


def _resolve_instructors(data: dict) -> dict:
    return {**data, "instructors": public_instructors(data.get("limit") or 8)}


SECTIONS = (
    SectionType(
        "featured_courses",
        "Featured courses",
        "Course cards chosen automatically: featured, newest, or from one category.",
        (
            HEADING,
            INTRO,
            Field(
                "source",
                "select",
                "Show",
                choices=(
                    ("featured", "Courses marked as featured"),
                    ("latest", "Newest courses"),
                    ("category", "Courses in a category"),
                ),  # fmt: skip
                default="featured",
            ),
            Field("category", "ref", "Category", ref="course_category", help="Used when showing a category."),
            Field("limit", "integer", "Number of courses", default=6, min_value=1, max_value=12),
            *cta_fields("cta", "Button"),
        ),
        resolve=_resolve_featured,
    ),
    SectionType(
        "course_collection",
        "Course collection",
        "A hand-picked list of courses in the order you choose.",
        (
            HEADING,
            INTRO,
            Field(
                "courses",
                "refs",
                "Courses",
                ref="course",
                required=True,
                min_items=1,
                max_items=MAX_COLLECTION,
                help="Only published courses are shown to visitors.",
            ),  # fmt: skip
            *cta_fields("cta", "Button"),
        ),
        resolve=_resolve_collection,
    ),
    SectionType(
        "course_categories",
        "Course categories",
        "Categories that have published courses, linking to the filtered catalog.",
        (HEADING, INTRO, Field("show_counts", "boolean", "Show course counts", default=True)),
        resolve=_resolve_categories,
    ),
    SectionType(
        "instructors",
        "Instructors",
        "Profiles of instructors shown on published courses (from their account profiles).",
        (HEADING, INTRO, Field("limit", "integer", "Maximum number shown", default=8, min_value=1, max_value=24)),
        resolve=_resolve_instructors,
    ),
)


def register():
    register_reference(
        Reference(
            "course",
            existing_ids=lambda ids: set(Course.objects.filter(pk__in=ids).values_list("pk", flat=True)),
            options=_course_options,
        )
    )
    register_reference(
        Reference(
            "course_category",
            existing_ids=lambda ids: set(Category.objects.filter(pk__in=ids).values_list("pk", flat=True)),
            options=_category_options,
        )
    )
    for section_type in SECTIONS:
        register_section_type(section_type)
