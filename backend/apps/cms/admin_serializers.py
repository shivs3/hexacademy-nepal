"""Staff-facing CMS serializers (drafts, versions, settings, menus, media, blog)."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from . import sanitize, sections
from .media import media_payload
from .models import BlogCategory, BlogPost, MediaAsset, Menu, MenuItem, NewsletterSubscriber, Page, PageVersion
from .serializers import MediaRefSerializer

User = get_user_model()


def _django_errors(exc: DjangoValidationError):
    return exc.message_dict if hasattr(exc, "error_dict") else {"non_field_errors": exc.messages}


class ImageAssetField(serializers.PrimaryKeyRelatedField):
    """Accepts the id of an image in the media library."""

    def __init__(self, **kwargs):
        kwargs.setdefault("queryset", MediaAsset.objects.filter(kind=MediaAsset.Kind.IMAGE))
        kwargs.setdefault("allow_null", True)
        kwargs.setdefault("required", False)
        super().__init__(**kwargs)


def _name(user) -> str:
    return user.full_name if user else ""


# --- Media ----------------------------------------------------------------------


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.CharField(read_only=True)
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = [
            "id",
            "url",
            "kind",
            "original_name",
            "mime_type",
            "size_bytes",
            "width",
            "height",
            "title",
            "alt_text",
            "uploaded_by_name",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f not in ("title", "alt_text")]

    def get_uploaded_by_name(self, obj) -> str:
        return _name(obj.uploaded_by)


class MediaUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    title = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    alt_text = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


# --- Pages ----------------------------------------------------------------------


class PageListSerializer(serializers.ModelSerializer):
    path = serializers.CharField(read_only=True)
    published_version_number = serializers.SerializerMethodField()
    latest_version_number = serializers.IntegerField(read_only=True)
    has_unpublished_changes = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            "id",
            "title",
            "slug",
            "path",
            "is_home",
            "status",
            "published_version_number",
            "latest_version_number",
            "has_unpublished_changes",
            "published_at",
            "scheduled_for",
            "updated_at",
            "updated_by_name",
        ]

    def get_published_version_number(self, obj) -> int | None:
        return obj.published_version.number if obj.published_version_id else None

    def get_has_unpublished_changes(self, obj) -> bool:
        latest = getattr(obj, "latest_version_number", None)
        published = self.get_published_version_number(obj)
        return obj.status == Page.Status.PUBLISHED and latest is not None and latest != published

    def get_updated_by_name(self, obj) -> str:
        return _name(obj.updated_by)


class PageSerializer(PageListSerializer):
    og_image = ImageAssetField()
    og_image_detail = serializers.SerializerMethodField()
    scheduled_version_number = serializers.SerializerMethodField()

    class Meta(PageListSerializer.Meta):
        fields = [
            *PageListSerializer.Meta.fields,
            "sections",
            "meta_title",
            "meta_description",
            "canonical_url",
            "og_image",
            "og_image_detail",
            "noindex",
            "scheduled_version_number",
            "created_at",
        ]
        read_only_fields = [
            "is_home",
            "status",
            "published_at",
            "scheduled_for",
            "updated_at",
            "created_at",
        ]

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_og_image_detail(self, obj):
        return media_payload(obj.og_image) if obj.og_image_id else None

    def get_scheduled_version_number(self, obj) -> int | None:
        return obj.scheduled_version.number if obj.scheduled_version_id else None

    def validate_slug(self, value):
        try:
            return sanitize.validate_page_slug(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def validate_title(self, value):
        value = sanitize.clean_plain_text(value)
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate(self, attrs):
        if "sections" in attrs:
            try:
                attrs["sections"] = sections.clean_sections(attrs["sections"])
            except DjangoValidationError as exc:
                raise serializers.ValidationError(_django_errors(exc)) from exc
        return attrs


class PageVersionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    is_published = serializers.SerializerMethodField()

    class Meta:
        model = PageVersion
        fields = ["number", "title", "note", "created_at", "created_by_name", "is_published"]

    def get_created_by_name(self, obj) -> str:
        return _name(obj.created_by)

    def get_is_published(self, obj) -> bool:
        return obj.page.published_version_id == obj.pk


class PublishSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1, required=False, allow_null=True)


class ScheduleSerializer(PublishSerializer):
    publish_at = serializers.DateTimeField()


class RestoreSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)


# --- Site settings ----------------------------------------------------------------

SOCIAL_PLATFORMS = ("facebook", "instagram", "linkedin", "youtube", "x", "tiktok", "github", "whatsapp")


class SocialLinkInputSerializer(serializers.Serializer):
    platform = serializers.ChoiceField(choices=SOCIAL_PLATFORMS)
    url = serializers.URLField(max_length=500)

    def validate_url(self, value):
        if not value.startswith("https://"):
            raise serializers.ValidationError("Use an https:// address.")
        return value


class AdminSiteSettingsSerializer(serializers.Serializer):
    site_name = serializers.CharField(max_length=100)
    tagline = serializers.CharField(max_length=200, allow_blank=True)
    logo = ImageAssetField()
    logo_inverted = ImageAssetField()
    favicon = ImageAssetField()
    color_primary = serializers.CharField(max_length=7)
    color_accent = serializers.CharField(max_length=7)
    color_secondary = serializers.CharField(max_length=7)
    contact_email = serializers.EmailField(allow_blank=True)
    contact_phone = serializers.CharField(max_length=40, allow_blank=True)
    address = serializers.CharField(max_length=300, allow_blank=True)
    social_links = SocialLinkInputSerializer(many=True)
    footer_text = serializers.CharField(max_length=500, allow_blank=True)
    default_meta_title = serializers.CharField(max_length=70, allow_blank=True)
    default_meta_description = serializers.CharField(max_length=170, allow_blank=True)
    default_og_image = ImageAssetField()
    allow_indexing = serializers.BooleanField()
    default_language = serializers.ChoiceField(choices=["en", "ne"])
    announcement_enabled = serializers.BooleanField()
    announcement_text = serializers.CharField(max_length=300, allow_blank=True)
    announcement_link_label = serializers.CharField(max_length=60, allow_blank=True)
    announcement_link_url = serializers.CharField(max_length=500, allow_blank=True)
    announcement_starts_at = serializers.DateTimeField(allow_null=True, required=False)
    announcement_ends_at = serializers.DateTimeField(allow_null=True, required=False)
    auth_panel_heading = serializers.CharField(max_length=150, allow_blank=True)
    auth_panel_text = serializers.CharField(max_length=400, allow_blank=True)

    # Media fields are returned with their URL so the editor can show previews.
    def to_representation(self, instance):
        data = super().to_representation(instance)
        for key in ("logo", "logo_inverted", "favicon", "default_og_image"):
            asset = getattr(instance, key)
            data[f"{key}_detail"] = media_payload(asset) if asset else None
        data["updated_at"] = instance.updated_at
        return data

    def _color(self, value, min_contrast):
        try:
            return sanitize.validate_brand_color(value, min_contrast=min_contrast)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    # Primary carries white body text (header, footer, buttons); accent carries
    # white button text and large headings; secondary is decorative only.
    def validate_color_primary(self, value):
        return self._color(value, 4.5)

    def validate_color_accent(self, value):
        return self._color(value, 3.0)

    def validate_color_secondary(self, value):
        return self._color(value, 1.0)

    def validate_announcement_link_url(self, value):
        try:
            return sanitize.validate_link(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        starts, ends = get("announcement_starts_at"), get("announcement_ends_at")
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"announcement_ends_at": ["Must be after the start time."]})
        if get("announcement_enabled") and not get("announcement_text"):
            raise serializers.ValidationError({"announcement_text": ["Enter the announcement text."]})
        if bool(get("announcement_link_label")) != bool(get("announcement_link_url")):
            raise serializers.ValidationError(
                {"announcement_link_url": ["Provide both a link label and a link, or neither."]}
            )
        if "social_links" in attrs:
            attrs["social_links"] = [dict(link) for link in attrs["social_links"]]
        return attrs


# --- Menus ---------------------------------------------------------------------------


class MenuItemInputSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80)
    page = serializers.PrimaryKeyRelatedField(queryset=Page.objects.all(), allow_null=True, required=False)
    url = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")
    open_in_new_tab = serializers.BooleanField(required=False, default=False)
    is_visible = serializers.BooleanField(required=False, default=True)
    children = serializers.ListField(child=serializers.DictField(), required=False, default=list)

    def validate_url(self, value):
        try:
            return sanitize.validate_link(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

    def validate(self, attrs):
        depth = self.context.get("depth", 0)
        children = attrs.get("children") or []
        if children and depth >= 1:
            raise serializers.ValidationError({"children": ["Menus support two levels only."]})
        if not attrs.get("page") and not attrs.get("url") and not children:
            raise serializers.ValidationError({"url": ["Choose a page or enter a link."]})
        if attrs.get("page"):
            attrs["url"] = ""
        child = MenuItemInputSerializer(data=children, many=True, context={"depth": depth + 1})
        if not child.is_valid():
            # Keep the errors under "children" so clients can map them to the right item.
            raise serializers.ValidationError({"children": child.errors})
        attrs["children"] = [dict(c) for c in child.validated_data]
        return attrs


class MenuInputSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=100, allow_blank=True, required=False, default="")
    items = MenuItemInputSerializer(many=True)

    def validate_items(self, items):
        from .services import MAX_MENU_ITEMS

        total = sum(1 + len(i.get("children") or []) for i in items)
        if total > MAX_MENU_ITEMS:
            raise serializers.ValidationError(f"A menu can have at most {MAX_MENU_ITEMS} links.")
        return [dict(i) for i in items]


class AdminMenuItemSerializer(serializers.ModelSerializer):
    page_title = serializers.SerializerMethodField()
    page_status = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = [
            "id",
            "label",
            "page",
            "page_title",
            "page_status",
            "url",
            "open_in_new_tab",
            "is_visible",
            "children",
        ]

    def get_page_title(self, obj) -> str:
        return obj.page.title if obj.page_id else ""

    def get_page_status(self, obj) -> str:
        return obj.page.status if obj.page_id else ""

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_children(self, obj):
        kids = [c for c in self.context["all_items"] if c.parent_id == obj.pk]
        return AdminMenuItemSerializer(kids, many=True, context=self.context).data


class AdminMenuSerializer(serializers.ModelSerializer):
    location_label = serializers.CharField(source="get_location_display", read_only=True)
    items = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ["location", "location_label", "title", "updated_at", "items"]

    @extend_schema_field(AdminMenuItemSerializer(many=True))
    def get_items(self, obj):
        all_items = list(obj.items.select_related("page").order_by("position", "id"))
        roots = [i for i in all_items if i.parent_id is None]
        return AdminMenuItemSerializer(roots, many=True, context={"all_items": all_items}).data


# --- Blog --------------------------------------------------------------------------------


def _slug_format(value):
    try:
        return sanitize.validate_slug_format(value)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.messages) from exc


class AdminBlogCategorySerializer(serializers.ModelSerializer):
    post_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = BlogCategory
        fields = ["id", "name", "slug", "description", "post_count"]

    def validate_slug(self, value):
        return _slug_format(value)


class BlogPostListSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    is_scheduled = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ["id", "title", "slug", "status", "published_at", "is_scheduled", "author_name", "updated_at"]

    def get_author_name(self, obj) -> str:
        return _name(obj.author)

    def get_is_scheduled(self, obj) -> bool:
        from django.utils import timezone

        return (
            obj.status == BlogPost.Status.PUBLISHED
            and obj.published_at is not None
            and obj.published_at > timezone.now()
        )


def staff_authors():
    from django.db.models import Q

    perm = Q(groups__permissions__codename="access_admin_panel") | Q(is_superuser=True)
    return User.objects.filter(perm, is_active=True).distinct()


class BlogPostSerializer(BlogPostListSerializer):
    cover = ImageAssetField()
    og_image = ImageAssetField()
    cover_detail = serializers.SerializerMethodField()
    og_image_detail = serializers.SerializerMethodField()
    author = serializers.PrimaryKeyRelatedField(queryset=User.objects.none(), allow_null=True, required=False)
    categories = serializers.PrimaryKeyRelatedField(queryset=BlogCategory.objects.all(), many=True, required=False)

    class Meta(BlogPostListSerializer.Meta):
        fields = [
            *BlogPostListSerializer.Meta.fields,
            "excerpt",
            "body",
            "cover",
            "cover_detail",
            "author",
            "categories",
            "meta_title",
            "meta_description",
            "canonical_url",
            "og_image",
            "og_image_detail",
            "noindex",
            "created_at",
        ]
        read_only_fields = ["status", "published_at", "updated_at", "created_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["author"].queryset = staff_authors()

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_cover_detail(self, obj):
        return media_payload(obj.cover) if obj.cover_id else None

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_og_image_detail(self, obj):
        return media_payload(obj.og_image) if obj.og_image_id else None

    def validate_title(self, value):
        value = sanitize.clean_plain_text(value)
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate_slug(self, value):
        return _slug_format(value)

    def validate_body(self, value):
        if len(value) > 200_000:
            raise serializers.ValidationError("The post is too long.")
        return sanitize.clean_rich_text(value)


class PostPublishSerializer(serializers.Serializer):
    publish_at = serializers.DateTimeField(required=False, allow_null=True)


class AuthorOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "full_name", "email"]


class NewsletterSubscriberSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsletterSubscriber
        fields = ["id", "email", "source", "consented_at", "unsubscribed_at"]
