"""Public catalog serializers. Only published courses and published lessons
reach these; lesson bodies, video links and files are never included (they
come from the learning API after an access check)."""

from django.db.models import Count, Prefetch, Q, QuerySet, Sum
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.cms.media import media_payload
from apps.cms.serializers import MediaRefSerializer

from .models import Category, Course, CourseInstructor, CourseModule, Lesson

CURRENCY = "NPR"


def published_courses() -> QuerySet[Course]:
    public_team = CourseInstructor.objects.filter(is_public=True).select_related("user__profile")
    return (
        Course.objects.filter(status=Course.Status.PUBLISHED)
        .select_related("category", "category__parent", "thumbnail")
        .prefetch_related(Prefetch("instructor_links", queryset=public_team, to_attr="public_team"))
        .annotate(
            lesson_count=Count("lessons", filter=Q(lessons__is_published=True)),
            total_minutes=Sum("lessons__duration_minutes", filter=Q(lessons__is_published=True)),
        )
    )


def instructor_payload(user) -> dict:
    profile = getattr(user, "profile", None)
    return {
        "id": user.pk,
        "full_name": user.full_name,
        "headline": getattr(profile, "headline", "") or "",
        "bio": getattr(profile, "bio", "") or "",
        "avatar_url": profile.avatar.url if profile and profile.avatar else None,
    }


class InstructorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    headline = serializers.CharField()
    bio = serializers.CharField()
    avatar_url = serializers.CharField(allow_null=True)


class CategoryRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class PricingMixin(serializers.Serializer):
    currency = serializers.SerializerMethodField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    current_price = serializers.SerializerMethodField()
    sale_ends_at = serializers.SerializerMethodField()
    is_free = serializers.SerializerMethodField()

    def get_currency(self, obj) -> str:
        return CURRENCY

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2))
    def get_current_price(self, obj):
        return f"{obj.current_price():.2f}"

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_sale_ends_at(self, obj):
        on_sale = obj.sale_price is not None and obj.current_price() == obj.sale_price
        return obj.sale_ends_at.isoformat() if on_sale and obj.sale_ends_at else None

    def get_is_free(self, obj) -> bool:
        return obj.is_free()


class CourseCardSerializer(PricingMixin, serializers.ModelSerializer):
    category = CategoryRefSerializer(allow_null=True)
    thumbnail = serializers.SerializerMethodField()
    instructors = serializers.SerializerMethodField()
    lesson_count = serializers.IntegerField()
    total_minutes = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id", "slug", "title", "subtitle", "category", "thumbnail", "level", "language", "duration_text",
            "is_featured", "lesson_count", "total_minutes", "instructors", "currency", "price", "current_price",
            "sale_ends_at", "is_free", "published_at",
        ]  # fmt: skip

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_thumbnail(self, obj):
        return media_payload(obj.thumbnail) if obj.thumbnail else None

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_instructors(self, obj):
        return [link.user.full_name for link in getattr(obj, "public_team", [])]

    def get_total_minutes(self, obj) -> int:
        return obj.total_minutes or 0


class OutlineLessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lesson
        fields = ["id", "title", "duration_minutes", "is_preview"]


class OutlineModuleSerializer(serializers.ModelSerializer):
    lessons = OutlineLessonSerializer(many=True, source="published_lessons")

    class Meta:
        model = CourseModule
        fields = ["id", "title", "description", "lessons"]


class CourseDetailSerializer(CourseCardSerializer):
    curriculum = serializers.SerializerMethodField()
    team = serializers.SerializerMethodField()
    seo = serializers.SerializerMethodField()

    class Meta(CourseCardSerializer.Meta):
        fields = [
            *CourseCardSerializer.Meta.fields,
            "description", "learning_outcomes", "prerequisites", "sequential",
            "curriculum", "team", "seo", "updated_at",
        ]  # fmt: skip

    @extend_schema_field(OutlineModuleSerializer(many=True))
    def get_curriculum(self, obj):
        lessons = Lesson.objects.filter(is_published=True).order_by("position", "id")
        modules = obj.modules.prefetch_related(Prefetch("lessons", queryset=lessons, to_attr="published_lessons"))
        return OutlineModuleSerializer([m for m in modules if m.published_lessons], many=True).data

    @extend_schema_field(InstructorSerializer(many=True))
    def get_team(self, obj):
        return [instructor_payload(link.user) for link in getattr(obj, "public_team", [])]

    @extend_schema_field(
        {
            "type": "object",
            "properties": {
                "meta_title": {"type": "string"},
                "meta_description": {"type": "string"},
                "canonical_url": {"type": "string"},
                "noindex": {"type": "boolean"},
                "og_image": {"type": "object", "nullable": True},
            },
        }
    )
    def get_seo(self, obj):
        return {
            "meta_title": obj.meta_title,
            "meta_description": obj.meta_description,
            "canonical_url": obj.canonical_url,
            "noindex": obj.noindex,
            "og_image": media_payload(obj.og_image) if obj.og_image else None,
        }


class PublicCategorySerializer(serializers.ModelSerializer):
    course_count = serializers.IntegerField()
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "course_count", "children"]

    @extend_schema_field(
        {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "name": {"type": "string"},
                    "slug": {"type": "string"},
                    "description": {"type": "string"},
                    "course_count": {"type": "integer"},
                },
            },
        }
    )
    def get_children(self, obj):
        return [
            {"id": c.pk, "name": c.name, "slug": c.slug, "description": c.description, "course_count": c.course_count}
            for c in getattr(obj, "child_list", [])
        ]


def category_tree() -> list[Category]:
    """Top-level categories with published course counts; a parent's count
    includes its subcategories' courses."""
    published = Q(courses__status=Course.Status.PUBLISHED)
    cats = list(Category.objects.annotate(course_count=Count("courses", filter=published)))
    by_parent: dict[int, list[Category]] = {}
    for c in cats:
        if c.parent_id:
            by_parent.setdefault(c.parent_id, []).append(c)
    roots = [c for c in cats if c.parent_id is None]
    for root in roots:
        root.child_list = by_parent.get(root.pk, [])
        root.course_count += sum(c.course_count for c in root.child_list)
    return roots
