"""Staff CMS endpoints under /api/v1/admin/cms/. Every view declares the
permission it requires; publication actions need `publish_*` permissions in
addition to editing rights."""

import csv

from django.db.models import Count, Max, Q
from django.http import Http404, HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit import services as audit
from common.exceptions import DomainError
from common.permissions import HasPerm

from . import media as media_service
from . import sections, services
from .admin_serializers import (
    AdminBlogCategorySerializer,
    AdminMenuSerializer,
    AdminSiteSettingsSerializer,
    AuthorOptionSerializer,
    BlogPostListSerializer,
    BlogPostSerializer,
    MediaAssetSerializer,
    MediaUploadSerializer,
    MenuInputSerializer,
    NewsletterSubscriberSerializer,
    PageListSerializer,
    PageSerializer,
    PageVersionSerializer,
    PostPublishSerializer,
    PublishSerializer,
    RestoreSerializer,
    ScheduleSerializer,
    staff_authors,
)
from .models import BlogCategory, BlogPost, MediaAsset, Menu, NewsletterSubscriber, Page, SiteSettings
from .serializers import PublicBlogPostSerializer, PublicPageSerializer, page_payload

MANAGE_PAGES = "cms.manage_pages"
PUBLISH_PAGES = "cms.publish_pages"
MANAGE_MEDIA = "cms.manage_media"
MANAGE_MENUS = "cms.manage_menus"
MANAGE_SETTINGS = "cms.manage_site_settings"
MANAGE_BLOG = "cms.manage_blog"
PUBLISH_BLOG = "cms.publish_blog"
VIEW_SUBSCRIBERS = "cms.view_newsletter_subscribers"


# --- Pages ---------------------------------------------------------------------------


class AdminPageViewSet(viewsets.ModelViewSet):
    search_fields = ["title", "slug"]
    ordering_fields = ["title", "updated_at", "published_at"]
    ordering = ["-is_home", "title"]
    filterset_fields = ["status", "is_home"]

    def get_permissions(self):
        if self.action in ("publish", "schedule", "cancel_schedule", "unpublish", "archive", "unarchive", "make_home"):
            return [HasPerm(MANAGE_PAGES, PUBLISH_PAGES)()]
        if self.action in ("list", "retrieve"):
            # Menu editors need to pick pages to link to.
            return [HasPerm(MANAGE_PAGES, MANAGE_MENUS, any_of=True)()]
        return [HasPerm(MANAGE_PAGES)()]

    def get_serializer_class(self):
        return PageListSerializer if self.action == "list" else PageSerializer

    def get_queryset(self):
        return Page.objects.select_related("published_version", "scheduled_version", "updated_by", "og_image").annotate(
            latest_version_number=Max("versions__number")
        )

    def _fresh(self, page):
        return PageSerializer(self.get_queryset().get(pk=page.pk)).data

    def perform_create(self, serializer):
        serializer.instance = services.create_page(data=serializer.validated_data, actor=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(self._fresh(serializer.instance), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        page = self.get_object()
        serializer = self.get_serializer(page, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        page = services.update_page(page, data=serializer.validated_data, actor=request.user)
        return Response(self._fresh(page))

    def destroy(self, request, *args, **kwargs):
        services.delete_page(self.get_object(), actor=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=PublishSerializer, responses=PageSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        s = PublishSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        page = services.publish_page(
            self.get_object(), actor=request.user, request=request, version_number=s.validated_data.get("version")
        )
        return Response(self._fresh(page))

    @extend_schema(request=ScheduleSerializer, responses=PageSerializer)
    @action(detail=True, methods=["post"])
    def schedule(self, request, pk=None):
        s = ScheduleSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        page = services.schedule_page(
            self.get_object(),
            publish_at=s.validated_data["publish_at"],
            actor=request.user,
            request=request,
            version_number=s.validated_data.get("version"),
        )
        return Response(self._fresh(page))

    @extend_schema(request=None, responses=PageSerializer)
    @action(detail=True, methods=["post"], url_path="cancel-schedule")
    def cancel_schedule(self, request, pk=None):
        page = services.cancel_schedule(self.get_object(), actor=request.user, request=request)
        return Response(self._fresh(page))

    @extend_schema(request=None, responses=PageSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        page = services.unpublish_page(self.get_object(), actor=request.user, request=request)
        return Response(self._fresh(page))

    @extend_schema(request=None, responses=PageSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        page = services.unpublish_page(self.get_object(), actor=request.user, request=request, archive=True)
        return Response(self._fresh(page))

    @extend_schema(request=None, responses=PageSerializer)
    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        page = services.restore_from_archive(self.get_object(), actor=request.user, request=request)
        return Response(self._fresh(page))

    @extend_schema(request=None, responses=PageSerializer)
    @action(detail=True, methods=["post"], url_path="make-home")
    def make_home(self, request, pk=None):
        page = services.set_home_page(self.get_object(), actor=request.user, request=request)
        return Response(self._fresh(page))

    @extend_schema(request=None, responses={201: PageSerializer})
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        page = services.duplicate_page(self.get_object(), actor=request.user)
        return Response(self._fresh(page), status=status.HTTP_201_CREATED)

    @extend_schema(responses=PageVersionSerializer(many=True))
    @action(detail=True, methods=["get"])
    def versions(self, request, pk=None):
        page = self.get_object()
        qs = page.versions.select_related("created_by", "page").order_by("-number")
        pageobj = self.paginate_queryset(qs)
        return self.get_paginated_response(PageVersionSerializer(pageobj, many=True).data)

    @extend_schema(request=RestoreSerializer, responses=PageSerializer)
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        s = RestoreSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        page = services.restore_version(
            self.get_object(), number=s.validated_data["version"], actor=request.user, request=request
        )
        return Response(self._fresh(page))

    @extend_schema(
        parameters=[OpenApiParameter("version", int, description="Version number (defaults to the latest draft)")],
        responses=PublicPageSerializer,
    )
    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """Renders a draft or historical version exactly as the public site would."""
        page = self.get_object()
        raw = request.query_params.get("version")
        version = (
            page.versions.filter(number=int(raw)).first() if raw and raw.isdigit() else services.latest_version(page)
        )
        if version is None:
            return Response(
                {"error": {"code": "not_found", "message": "Version not found."}}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(page_payload(page, version))


class SectionTypesView(APIView):
    permission_classes = [HasPerm(MANAGE_PAGES)]

    @extend_schema(responses=inline_serializer("SectionTypeInfo", {"type": serializers.CharField()}, many=True))
    def get(self, request):
        return Response(sections.describe_section_types())


class SectionReferenceOptionsView(APIView):
    """Choices for `ref`/`refs` section fields (e.g. courses), searched by name."""

    permission_classes = [HasPerm(MANAGE_PAGES)]

    @extend_schema(
        parameters=[
            OpenApiParameter("search", str),
            OpenApiParameter("ids", str, description="Comma-separated ids to label (the current selection)."),
        ],
        responses=inline_serializer(
            "SectionReferenceOption",
            {
                "id": serializers.IntegerField(),
                "label": serializers.CharField(),
                "description": serializers.CharField(),
            },
            many=True,
        ),
    )
    def get(self, request, key):
        reference = sections.REFERENCES.get(key)
        if reference is None:
            raise Http404
        search = request.query_params.get("search", "").strip()[:100]
        raw_ids = request.query_params.get("ids")
        ids = None
        if raw_ids is not None:
            parts = [p for p in raw_ids.split(",") if p]
            if len(parts) > 50 or not all(p.isdigit() and len(p) < 10 for p in parts):
                raise ValidationError({"ids": "Give up to 50 comma-separated ids."})
            ids = {int(p) for p in parts}
        return Response(list(reference.options(search, ids)))


# --- Media ------------------------------------------------------------------------------


class AdminMediaViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = MediaAssetSerializer
    search_fields = ["title", "alt_text", "original_name"]
    ordering_fields = ["created_at", "size_bytes", "title"]
    ordering = ["-created_at"]
    filterset_fields = ["kind"]
    http_method_names = ["get", "post", "patch", "delete", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            # Anyone who edits pages, posts or settings can pick existing media.
            return [HasPerm(MANAGE_MEDIA, MANAGE_PAGES, MANAGE_BLOG, MANAGE_SETTINGS, any_of=True)()]
        return [HasPerm(MANAGE_MEDIA)()]

    def get_queryset(self):
        return MediaAsset.objects.select_related("uploaded_by")

    @extend_schema(request={"multipart/form-data": MediaUploadSerializer}, responses={201: MediaAssetSerializer})
    def create(self, request):
        s = MediaUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        asset = media_service.create_media_asset(
            s.validated_data["file"],
            title=s.validated_data["title"],
            alt_text=s.validated_data["alt_text"],
            actor=request.user,
            request=request,
        )
        return Response(MediaAssetSerializer(asset).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        media_service.delete_media_asset(instance, actor=self.request.user, request=self.request)

    def get_parsers(self):
        if getattr(self, "action", None) == "create":
            return [MultiPartParser()]
        return super().get_parsers()


# --- Site settings -------------------------------------------------------------------------


class AdminSiteSettingsView(APIView):
    permission_classes = [HasPerm(MANAGE_SETTINGS)]

    @extend_schema(responses=AdminSiteSettingsSerializer)
    def get(self, request):
        return Response(AdminSiteSettingsSerializer(SiteSettings.load()).data)

    @extend_schema(request=AdminSiteSettingsSerializer, responses=AdminSiteSettingsSerializer)
    def patch(self, request):
        current = SiteSettings.load()
        s = AdminSiteSettingsSerializer(current, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        obj = services.update_site_settings(data=s.validated_data, actor=request.user, request=request)
        return Response(AdminSiteSettingsSerializer(obj).data)


# --- Menus ------------------------------------------------------------------------------------


class AdminMenuListView(APIView):
    permission_classes = [HasPerm(MANAGE_MENUS)]

    @extend_schema(responses=AdminMenuSerializer(many=True))
    def get(self, request):
        menus = {m.location: m for m in Menu.objects.all()}
        for location in Menu.Location.values:
            if location not in menus:
                menus[location] = Menu.objects.create(location=location)
        ordered = [menus[loc] for loc in Menu.Location.values]
        return Response(AdminMenuSerializer(ordered, many=True).data)


class AdminMenuDetailView(APIView):
    permission_classes = [HasPerm(MANAGE_MENUS)]

    def _location(self, location):
        if location not in Menu.Location.values:
            raise Http404
        return location

    @extend_schema(responses=AdminMenuSerializer)
    def get(self, request, location):
        menu, _ = Menu.objects.get_or_create(location=self._location(location))
        return Response(AdminMenuSerializer(menu).data)

    @extend_schema(request=MenuInputSerializer, responses=AdminMenuSerializer)
    def put(self, request, location):
        location = self._location(location)
        s = MenuInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        menu = services.replace_menu(
            location,
            title=s.validated_data["title"],
            items=s.validated_data["items"],
            actor=request.user,
            request=request,
        )
        return Response(AdminMenuSerializer(menu).data)


# --- Blog -----------------------------------------------------------------------------------------


class AdminBlogPostViewSet(viewsets.ModelViewSet):
    search_fields = ["title", "slug", "excerpt"]
    ordering_fields = ["title", "updated_at", "published_at"]
    ordering = ["-updated_at"]
    filterset_fields = ["status"]

    def get_permissions(self):
        if self.action in ("publish", "unpublish", "archive"):
            return [HasPerm(MANAGE_BLOG, PUBLISH_BLOG)()]
        return [HasPerm(MANAGE_BLOG)()]

    def get_serializer_class(self):
        return BlogPostListSerializer if self.action == "list" else BlogPostSerializer

    def get_queryset(self):
        return BlogPost.objects.select_related("author", "cover", "og_image").prefetch_related("categories")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        # Posts are not versioned, so editing a published post changes the live
        # article: that needs the publishing permission, not just editing rights.
        if serializer.instance.status == BlogPost.Status.PUBLISHED and not self.request.user.has_perm(PUBLISH_BLOG):
            raise PermissionDenied("Only staff who can publish posts may edit a published post.")
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        if instance.status == BlogPost.Status.PUBLISHED:
            raise DomainError("Unpublish the post before deleting it.", code="post_published")
        audit.record("cms.post_deleted", actor=self.request.user, target=instance, request=self.request)
        instance.delete()

    def _fresh(self, post):
        return BlogPostSerializer(self.get_queryset().get(pk=post.pk)).data

    @extend_schema(request=PostPublishSerializer, responses=BlogPostSerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        s = PostPublishSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        post = services.publish_post(
            self.get_object(), actor=request.user, request=request, publish_at=s.validated_data.get("publish_at")
        )
        return Response(self._fresh(post))

    @extend_schema(request=None, responses=BlogPostSerializer)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        post = services.unpublish_post(self.get_object(), actor=request.user, request=request)
        return Response(self._fresh(post))

    @extend_schema(request=None, responses=BlogPostSerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        post = services.unpublish_post(self.get_object(), actor=request.user, request=request, archive=True)
        return Response(self._fresh(post))

    @extend_schema(responses=PublicBlogPostSerializer)
    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """The saved post (whatever its status) in the shape the public site renders."""
        return Response(PublicBlogPostSerializer(self.get_object()).data)


class AdminBlogCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = AdminBlogCategorySerializer
    permission_classes = [HasPerm(MANAGE_BLOG)]
    pagination_class = None
    search_fields = ["name"]
    ordering = ["name"]

    def get_queryset(self):
        return BlogCategory.objects.annotate(post_count=Count("posts"))


class BlogAuthorOptionsView(APIView):
    permission_classes = [HasPerm(MANAGE_BLOG)]

    @extend_schema(responses=AuthorOptionSerializer(many=True))
    def get(self, request):
        return Response(AuthorOptionSerializer(staff_authors().order_by("full_name"), many=True).data)


# --- Newsletter -------------------------------------------------------------------------------------


def _csv_safe(value) -> str:
    # Prevent spreadsheet formula injection when the export is opened in Excel.
    text = "" if value is None else str(value)
    return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


class AdminNewsletterViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NewsletterSubscriberSerializer
    permission_classes = [HasPerm(VIEW_SUBSCRIBERS)]
    search_fields = ["email"]
    ordering = ["-consented_at"]

    def get_queryset(self):
        qs = NewsletterSubscriber.objects.all()
        state = self.request.query_params.get("state")
        if state == "active":
            qs = qs.filter(unsubscribed_at__isnull=True)
        elif state == "unsubscribed":
            qs = qs.filter(unsubscribed_at__isnull=False)
        return qs

    @extend_schema(responses={(200, "text/csv"): str})
    @action(detail=False, methods=["get"])
    def export(self, request):
        rows = self.filter_queryset(self.get_queryset()).filter(unsubscribed_at__isnull=True)
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
        response["Content-Disposition"] = f'attachment; filename="newsletter-subscribers-{stamp}.csv"'
        writer = csv.writer(response)
        writer.writerow(["email", "source", "consented_at"])
        count = 0
        for sub in rows.iterator():
            writer.writerow([_csv_safe(sub.email), _csv_safe(sub.source), sub.consented_at.isoformat()])
            count += 1
        audit.record("cms.newsletter_exported", actor=request.user, request=request, rows=count)
        return response


class CmsOverviewView(APIView):
    """Counts for the staff dashboard's website card."""

    permission_classes = [HasPerm(MANAGE_PAGES, MANAGE_BLOG, MANAGE_MEDIA, any_of=True)]

    @extend_schema(
        responses=inline_serializer(
            "CmsOverview",
            {
                "pages_published": serializers.IntegerField(),
                "pages_draft": serializers.IntegerField(),
                "pages_scheduled": serializers.IntegerField(),
                "posts_published": serializers.IntegerField(),
                "posts_draft": serializers.IntegerField(),
                "media": serializers.IntegerField(),
            },
        )
    )
    def get(self, request):
        pages = Page.objects.aggregate(
            published=Count("id", filter=Q(status=Page.Status.PUBLISHED)),
            draft=Count("id", filter=Q(status=Page.Status.DRAFT)),
            scheduled=Count("id", filter=Q(scheduled_for__isnull=False)),
        )
        posts = BlogPost.objects.aggregate(
            published=Count("id", filter=Q(status=BlogPost.Status.PUBLISHED)),
            draft=Count("id", filter=Q(status=BlogPost.Status.DRAFT)),
        )
        return Response(
            {
                "pages_published": pages["published"],
                "pages_draft": pages["draft"],
                "pages_scheduled": pages["scheduled"],
                "posts_published": posts["published"],
                "posts_draft": posts["draft"],
                "media": MediaAsset.objects.count(),
            }
        )
