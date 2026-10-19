"""Public (anonymous) CMS serializers. They only ever describe published
content; staff-only fields such as drafts and authorship live in
admin_serializers.py."""

import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from . import sections as section_registry
from .media import media_map, media_payload
from .models import BlogCategory, BlogPost, MediaAsset, Page, PageVersion, SiteSettings


class MediaRefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    url = serializers.CharField()
    alt = serializers.CharField()
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)
    mime_type = serializers.CharField()


def _media(asset: MediaAsset | None):
    return media_payload(asset) if asset else None


class SeoSerializer(serializers.Serializer):
    meta_title = serializers.CharField()
    meta_description = serializers.CharField()
    canonical_url = serializers.CharField()
    og_image = MediaRefSerializer(allow_null=True)
    noindex = serializers.BooleanField()


class SectionSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.CharField()
    data = serializers.DictField()


class PublicPageSerializer(serializers.Serializer):
    title = serializers.CharField()
    slug = serializers.CharField()
    path = serializers.CharField()
    is_home = serializers.BooleanField()
    sections = SectionSerializer(many=True)
    seo = SeoSerializer()
    published_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField()


def page_payload(page: Page, version: PageVersion) -> dict:
    """Render a specific version of a page for public display (or preview)."""
    seo = version.seo or {}
    ids = section_registry.image_ids(version.sections)
    if seo.get("og_image"):
        ids.add(seo["og_image"])
    media = media_map(ids)
    return {
        "title": version.title,
        "slug": page.slug,
        "path": page.path,
        "is_home": page.is_home,
        "sections": section_registry.public_sections(version.sections, media),
        "seo": {
            "meta_title": seo.get("meta_title") or "",
            "meta_description": seo.get("meta_description") or "",
            "canonical_url": seo.get("canonical_url") or "",
            "og_image": media.get(seo.get("og_image")),
            "noindex": bool(seo.get("noindex")),
        },
        "published_at": page.published_at,
        "updated_at": version.created_at,
    }


class AnnouncementSerializer(serializers.Serializer):
    text = serializers.CharField()
    link_label = serializers.CharField()
    link_url = serializers.CharField()


class AuthPanelSerializer(serializers.Serializer):
    heading = serializers.CharField()
    text = serializers.CharField()


class SocialLinkSerializer(serializers.Serializer):
    platform = serializers.CharField()
    url = serializers.CharField()


class PublicSiteSettingsSerializer(serializers.ModelSerializer):
    logo = serializers.SerializerMethodField()
    logo_inverted = serializers.SerializerMethodField()
    favicon = serializers.SerializerMethodField()
    default_og_image = serializers.SerializerMethodField()
    social_links = SocialLinkSerializer(many=True)
    announcement = serializers.SerializerMethodField()
    auth_panel = serializers.SerializerMethodField()

    class Meta:
        model = SiteSettings
        fields = [
            "site_name",
            "tagline",
            "logo",
            "logo_inverted",
            "favicon",
            "color_primary",
            "color_accent",
            "color_secondary",
            "contact_email",
            "contact_phone",
            "address",
            "social_links",
            "footer_text",
            "default_meta_title",
            "default_meta_description",
            "default_og_image",
            "allow_indexing",
            "default_language",
            "announcement",
            "auth_panel",
        ]

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_logo(self, obj):
        return _media(obj.logo)

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_logo_inverted(self, obj):
        return _media(obj.logo_inverted)

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_favicon(self, obj):
        return _media(obj.favicon)

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_default_og_image(self, obj):
        return _media(obj.default_og_image)

    @extend_schema_field(AnnouncementSerializer(allow_null=True))
    def get_announcement(self, obj):
        if not obj.announcement_is_live():
            return None
        return {
            "text": obj.announcement_text,
            "link_label": obj.announcement_link_label,
            "link_url": obj.announcement_link_url,
        }

    @extend_schema_field(AuthPanelSerializer)
    def get_auth_panel(self, obj):
        return {"heading": obj.auth_panel_heading, "text": obj.auth_panel_text}


class PublicMenuItemSerializer(serializers.Serializer):
    label = serializers.CharField()
    url = serializers.CharField()
    open_in_new_tab = serializers.BooleanField()
    children = serializers.ListField(child=serializers.DictField())


class PublicMenuSerializer(serializers.Serializer):
    location = serializers.CharField()
    title = serializers.CharField()
    items = PublicMenuItemSerializer(many=True)


class AuthorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    headline = serializers.CharField()
    bio = serializers.CharField()
    avatar = serializers.CharField(allow_null=True)


def author_payload(user) -> dict | None:
    if user is None:
        return None
    profile = getattr(user, "profile", None)
    return {
        "id": user.pk,
        "name": user.full_name,
        "headline": getattr(profile, "headline", "") or "",
        "bio": getattr(profile, "bio", "") or "",
        "avatar": profile.avatar.url if profile and profile.avatar else None,
    }


class PublicBlogCategorySerializer(serializers.ModelSerializer):
    post_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = BlogCategory
        fields = ["name", "slug", "description", "post_count"]


class _CategoryRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogCategory
        fields = ["name", "slug"]


class PublicBlogPostListSerializer(serializers.ModelSerializer):
    cover = serializers.SerializerMethodField()
    author = serializers.SerializerMethodField()
    categories = _CategoryRefSerializer(many=True)
    reading_minutes = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ["title", "slug", "excerpt", "cover", "author", "categories", "published_at", "reading_minutes"]

    @extend_schema_field(MediaRefSerializer(allow_null=True))
    def get_cover(self, obj):
        return _media(obj.cover)

    @extend_schema_field(AuthorSerializer(allow_null=True))
    def get_author(self, obj):
        return author_payload(obj.author)

    def get_reading_minutes(self, obj) -> int:
        words = len(re.sub(r"<[^>]+>", " ", obj.body or "").split())
        return max(1, round(words / 200))


class PublicBlogPostSerializer(PublicBlogPostListSerializer):
    seo = serializers.SerializerMethodField()

    class Meta(PublicBlogPostListSerializer.Meta):
        fields = [*PublicBlogPostListSerializer.Meta.fields, "body", "updated_at", "seo"]

    @extend_schema_field(SeoSerializer)
    def get_seo(self, obj):
        return {
            "meta_title": obj.meta_title,
            "meta_description": obj.meta_description,
            "canonical_url": obj.canonical_url,
            "og_image": _media(obj.og_image),
            "noindex": obj.noindex,
        }


class SubscribeSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    source = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    consent = serializers.BooleanField()

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Please confirm that you want to receive our emails.")
        return value

    def validate_source(self, value):
        # Only a site path is kept; anything else is discarded.
        return value if value.startswith("/") and not value.startswith("//") else ""


class SitemapEntrySerializer(serializers.Serializer):
    path = serializers.CharField()
    updated_at = serializers.DateTimeField()


class SitemapSerializer(serializers.Serializer):
    pages = SitemapEntrySerializer(many=True)
    posts = SitemapEntrySerializer(many=True)
