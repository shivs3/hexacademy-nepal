"""Staff catalog serializers: course editing, teaching team, curriculum."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts import roles
from apps.cms import sanitize
from apps.cms.admin_serializers import ImageAssetField
from apps.cms.media import media_payload
from apps.cms.serializers import MediaRefSerializer
from common.exceptions import DomainError

from . import policies, services
from .models import Category, Course, CourseInstructor, CourseModule, Lesson, LessonResource

User = get_user_model()

MAX_OUTCOMES = 12
MAX_PREREQUISITES = 10
MAX_PRICE = Decimal("1000000")


def _plain_required(value: str) -> str:
    value = " ".join(sanitize.clean_plain_text(value).split())
    if not value:
        raise serializers.ValidationError("This field may not be blank.")
    return value


def _slug(value: str) -> str:
    try:
        return sanitize.validate_slug_format(value)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages) from exc


def _text_list(value, *, max_items: int, label: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(v, str) for v in value):
        raise serializers.ValidationError("Must be a list of text items.")
    items = [" ".join(sanitize.clean_plain_text(v).split()) for v in value]
    items = [v for v in items if v]
    if len(items) > max_items:
        raise serializers.ValidationError(f"Use at most {max_items} {label}.")
    if any(len(v) > 200 for v in items):
        raise serializers.ValidationError("Keep each item to 200 characters or fewer.")
    return items


# --- Categories ----------------------------------------------------------------------


class AdminCategorySerializer(serializers.ModelSerializer):
    parent = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), allow_null=True, required=False)
    course_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "parent", "description", "position", "course_count"]
        # The (parent, name) constraint's auto-validator would make `parent` required; checked in validate().
        validators: list = []

    def validate_name(self, value):
        return _plain_required(value)

    def validate_slug(self, value):
        return _slug(value)

    def validate_description(self, value):
        return sanitize.clean_plain_text(value).strip()

    def validate(self, attrs):
        parent = attrs.get("parent", self.instance.parent if self.instance else None)
        try:
            services.validate_category_parent(self.instance, parent)
        except DomainError as exc:
            raise serializers.ValidationError({"parent": [str(exc.detail)]}) from exc
        name = attrs.get("name", self.instance.name if self.instance else "")
        siblings = Category.objects.filter(parent=parent, name__iexact=name)
        if self.instance:
            siblings = siblings.exclude(pk=self.instance.pk)
        if siblings.exists():
            raise serializers.ValidationError({"name": ["A category with this name already exists here."]})
        return attrs


# --- Courses -------------------------------------------------------------------------


class TeamMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.pk", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = CourseInstructor
        fields = ["user_id", "full_name", "email", "role", "is_public"]


class AdminCourseListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", default="", read_only=True)
    thumbnail_detail = serializers.SerializerMethodField()
    lesson_count = serializers.IntegerField(read_only=True)
    published_lesson_count = serializers.IntegerField(read_only=True)
    enrollment_count = serializers.IntegerField(read_only=True)
    current_price = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            "id", "title", "slug", "status", "category_name", "thumbnail_detail", "price", "current_price",
            "is_featured", "lesson_count", "published_lesson_count", "enrollment_count", "published_at", "updated_at",
        ]  # fmt: skip

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_thumbnail_detail(self, obj):
        return media_payload(obj.thumbnail) if obj.thumbnail_id else None

    @extend_schema_field(serializers.DecimalField(max_digits=10, decimal_places=2))
    def get_current_price(self, obj):
        return f"{obj.current_price():.2f}"


# Fields only catalog managers may change: commercial terms, merchandising and,
# once a course is live, its address.
MANAGER_ONLY_FIELDS = ("price", "sale_price", "sale_ends_at", "is_featured")


class AdminCourseSerializer(AdminCourseListSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), allow_null=True, required=False)
    thumbnail = ImageAssetField()
    og_image = ImageAssetField()
    og_image_detail = serializers.SerializerMethodField()
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), max_value=MAX_PRICE,
                                     required=False)  # fmt: skip
    sale_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), allow_null=True,
                                          required=False)  # fmt: skip
    team = TeamMemberSerializer(many=True, source="instructor_links", read_only=True)
    abilities = serializers.SerializerMethodField()
    publish_problems = serializers.SerializerMethodField()

    class Meta(AdminCourseListSerializer.Meta):
        fields = [
            *AdminCourseListSerializer.Meta.fields,
            "subtitle", "description", "category", "thumbnail", "level", "language", "duration_text",
            "learning_outcomes", "prerequisites", "sequential", "sale_price", "sale_ends_at",
            "meta_title", "meta_description", "canonical_url", "og_image", "og_image_detail", "noindex",
            "team", "abilities", "publish_problems", "created_at",
        ]  # fmt: skip
        read_only_fields = ["status", "published_at", "updated_at", "created_at"]

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_og_image_detail(self, obj):
        return media_payload(obj.og_image) if obj.og_image_id else None

    @extend_schema_field(
        {
            "type": "object",
            "properties": {k: {"type": "boolean"} for k in ("edit", "manage", "publish", "delete")},
        }
    )
    def get_abilities(self, obj):
        user = self.context["request"].user
        return {
            "edit": policies.can_edit_content(user, obj),
            "manage": policies.can_manage_catalog(user),
            "publish": policies.can_publish(user),
            "delete": policies.can_manage_catalog(user) and obj.status == Course.Status.DRAFT,
        }

    def get_publish_problems(self, obj) -> list[str]:
        return services.publish_problems(obj)

    def validate_title(self, value):
        return _plain_required(value)

    def validate_slug(self, value):
        return _slug(value)

    def validate_subtitle(self, value):
        return " ".join(sanitize.clean_plain_text(value).split())

    def validate_duration_text(self, value):
        return " ".join(sanitize.clean_plain_text(value).split())

    def validate_description(self, value):
        if len(value) > 100_000:
            raise serializers.ValidationError("The description is too long.")
        return sanitize.clean_rich_text(value)

    def validate_learning_outcomes(self, value):
        return _text_list(value, max_items=MAX_OUTCOMES, label="outcomes")

    def validate_prerequisites(self, value):
        return _text_list(value, max_items=MAX_PREREQUISITES, label="prerequisites")

    def validate(self, attrs):
        instance = self.instance
        price = attrs.get("price", instance.price if instance else Decimal("0"))
        sale_price = attrs.get("sale_price", instance.sale_price if instance else None)
        if sale_price is not None and sale_price >= price:
            raise serializers.ValidationError({"sale_price": ["The sale price must be lower than the regular price."]})
        if sale_price is None and "sale_price" in attrs:
            attrs["sale_ends_at"] = None
        return attrs


class StatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Course.Status.choices)


def team_candidates():
    """Accounts that can be put on a teaching team."""
    groups = [roles.group_name(roles.INSTRUCTOR), roles.group_name(roles.TEACHING_ASSISTANT)]
    return User.objects.filter(is_active=True).filter(Q(groups__name__in=groups) | Q(is_superuser=True)).distinct()


class TeamInputSerializer(serializers.Serializer):
    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.none())
    role = serializers.ChoiceField(choices=CourseInstructor.Role.choices)
    is_public = serializers.BooleanField(default=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["user"].queryset = team_candidates()


class TeamListInputSerializer(serializers.Serializer):
    members = TeamInputSerializer(many=True)


class TeamCandidateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "full_name", "email"]


# --- Curriculum ----------------------------------------------------------------------


class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonResource
        fields = ["id", "title", "kind", "original_name", "mime_type", "size_bytes", "url", "position", "created_at"]
        read_only_fields = [f for f in fields if f != "title"]

    def validate_title(self, value):
        return _plain_required(value)


class ResourceUploadSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160, required=False, allow_blank=True)
    file = serializers.FileField(required=False)
    url = serializers.URLField(max_length=500, required=False)

    def validate_url(self, value):
        if not value.lower().startswith(("https://", "http://")):
            raise serializers.ValidationError("Use an http(s) link.")
        return value

    def validate(self, attrs):
        if bool(attrs.get("file")) == bool(attrs.get("url")):
            raise serializers.ValidationError("Upload a file or enter a link (not both).")
        if attrs.get("url") and not (attrs.get("title") or "").strip():
            raise serializers.ValidationError({"title": ["Give the link a title."]})
        return attrs


class LessonSummarySerializer(serializers.ModelSerializer):
    has_video = serializers.SerializerMethodField()
    resource_count = serializers.IntegerField(source="resources.count", read_only=True)

    class Meta:
        model = Lesson
        fields = ["id", "title", "is_published", "is_preview", "duration_minutes", "has_video", "resource_count"]

    def get_has_video(self, obj) -> bool:
        return bool(obj.video_url)


class AdminModuleSerializer(serializers.ModelSerializer):
    lessons = LessonSummarySerializer(many=True, read_only=True)

    class Meta:
        model = CourseModule
        fields = ["id", "title", "description", "position", "lessons"]
        read_only_fields = ["position"]

    def validate_title(self, value):
        return _plain_required(value)

    def validate_description(self, value):
        return sanitize.clean_plain_text(value).strip()


class AdminLessonSerializer(serializers.ModelSerializer):
    module = serializers.PrimaryKeyRelatedField(queryset=CourseModule.objects.all())
    resources = ResourceSerializer(many=True, read_only=True)
    video_embed_url = serializers.SerializerMethodField()
    duration_minutes = serializers.IntegerField(min_value=0, max_value=1440, required=False)

    class Meta:
        model = Lesson
        fields = [
            "id", "course", "module", "title", "summary", "body", "video_url", "video_embed_url", "duration_minutes",
            "is_preview", "is_published", "position", "resources", "updated_at",
        ]  # fmt: skip
        read_only_fields = ["course", "position", "updated_at"]

    def get_fields(self):
        fields = super().get_fields()
        if self.instance is not None:
            fields["module"].read_only = True  # moved with the curriculum reorder endpoint
        return fields

    def get_video_embed_url(self, obj) -> str:
        try:
            return sanitize.video_embed_url(obj.video_url) if obj.video_url else ""
        except DjangoValidationError:
            return ""

    def validate_title(self, value):
        return _plain_required(value)

    def validate_summary(self, value):
        return " ".join(sanitize.clean_plain_text(value).split())

    def validate_body(self, value):
        if len(value) > 200_000:
            raise serializers.ValidationError("The lesson is too long.")
        return sanitize.clean_rich_text(value)

    def validate_video_url(self, value):
        value = value.strip()
        if value:
            try:
                sanitize.video_embed_url(value)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.messages) from exc
        return value


class ReorderSerializer(serializers.Serializer):
    modules = serializers.ListField(child=serializers.DictField(), max_length=services.MAX_MODULES_PER_COURSE)

    def validate_modules(self, value):
        out = []
        for entry in value:
            module_id, lessons = entry.get("id"), entry.get("lessons", [])
            if not isinstance(module_id, int) or not isinstance(lessons, list):
                raise serializers.ValidationError("Each entry needs a module id and a list of lesson ids.")
            if any(isinstance(v, bool) or not isinstance(v, int) for v in lessons):
                raise serializers.ValidationError("Lesson ids must be numbers.")
            out.append({"id": module_id, "lessons": lessons})
        return out
