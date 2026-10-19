"""Public CMS endpoints. Every queryset here is restricted to published
content; drafts, archived pages and future-dated posts are never served."""

from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import services
from .models import BlogCategory, BlogPost, Menu, MenuItem, Page, SiteSettings
from .serializers import (
    PublicBlogCategorySerializer,
    PublicBlogPostListSerializer,
    PublicBlogPostSerializer,
    PublicMenuSerializer,
    PublicPageSerializer,
    PublicSiteSettingsSerializer,
    SitemapSerializer,
    SubscribeSerializer,
    page_payload,
)


def published_pages():
    return Page.objects.filter(status=Page.Status.PUBLISHED, published_version__isnull=False).select_related(
        "published_version"
    )


def published_posts(now=None):
    now = now or timezone.now()
    return BlogPost.objects.filter(status=BlogPost.Status.PUBLISHED, published_at__lte=now)


class PublicView(APIView):
    permission_classes = [AllowAny]


class SiteSettingsView(PublicView):
    @extend_schema(responses=PublicSiteSettingsSerializer)
    def get(self, request):
        obj = SiteSettings.objects.select_related("logo", "logo_inverted", "favicon", "default_og_image").filter(pk=1)
        settings_obj = obj.first() or SiteSettings.load()
        return Response(PublicSiteSettingsSerializer(settings_obj).data)


def public_menu_items(menu: Menu) -> list[dict]:
    items = MenuItem.objects.filter(menu=menu, is_visible=True).select_related("page").order_by("position", "id")
    by_parent: dict[int | None, list[MenuItem]] = {}
    for item in items:
        by_parent.setdefault(item.parent_id, []).append(item)

    def resolve(item: MenuItem) -> str | None:
        if item.page_id:
            page = item.page
            published = page and page.status == Page.Status.PUBLISHED and page.published_version_id
            return page.path if published else None
        return item.url or None

    def build(parent_id):
        out = []
        for item in by_parent.get(parent_id, []):
            children = build(item.pk)
            url = resolve(item)
            # A column heading without a link is kept if it has visible children.
            if url is None and not children:
                continue
            out.append(
                {"label": item.label, "url": url or "", "open_in_new_tab": item.open_in_new_tab, "children": children}
            )
        return out

    return build(None)


class MenuView(PublicView):
    @extend_schema(responses=PublicMenuSerializer)
    def get(self, request, location):
        if location not in Menu.Location.values:
            return Response(
                {"error": {"code": "not_found", "message": "Unknown menu location."}}, status=status.HTTP_404_NOT_FOUND
            )
        menu = Menu.objects.filter(location=location).first()
        if menu is None:
            return Response({"location": location, "title": "", "items": []})
        return Response({"location": location, "title": menu.title, "items": public_menu_items(menu)})


class HomePageView(PublicView):
    @extend_schema(responses=PublicPageSerializer)
    def get(self, request):
        page = get_object_or_404(published_pages(), is_home=True)
        return Response(page_payload(page, page.published_version))


class PageView(PublicView):
    @extend_schema(responses=PublicPageSerializer)
    def get(self, request, slug):
        page = get_object_or_404(published_pages(), slug=slug)
        return Response(page_payload(page, page.published_version))


_post_queryset_related = (
    Prefetch("categories", queryset=BlogCategory.objects.order_by("name")),
    "author__profile",
)


@extend_schema(
    parameters=[
        OpenApiParameter("category", str, description="Category slug"),
        OpenApiParameter("author", int, description="Author id"),
    ]
)
class BlogPostListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicBlogPostListSerializer
    search_fields = ["title", "excerpt"]
    ordering_fields = ["published_at"]
    ordering = ["-published_at"]
    filterset_fields: list[str] = []

    def get_queryset(self):
        qs = published_posts().select_related("cover", "author__profile").prefetch_related(*_post_queryset_related)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(categories__slug=category)
        author = self.request.query_params.get("author")
        if author and author.isdigit():
            qs = qs.filter(author_id=int(author))
        return qs.distinct()


class BlogPostDetailView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicBlogPostSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return (
            published_posts()
            .select_related("cover", "og_image", "author__profile")
            .prefetch_related(*_post_queryset_related)
        )


class BlogCategoryListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicBlogCategorySerializer
    pagination_class = None
    filter_backends: list = []

    def get_queryset(self):
        now = timezone.now()
        live = Q(posts__status=BlogPost.Status.PUBLISHED, posts__published_at__lte=now)
        return BlogCategory.objects.annotate(post_count=Count("posts", filter=live)).filter(post_count__gt=0)


class SitemapView(PublicView):
    """Indexable published URLs for the frontend's sitemap.xml."""

    @extend_schema(responses=SitemapSerializer)
    def get(self, request):
        pages = [
            {"path": p.path, "updated_at": p.published_version.created_at}
            for p in published_pages()
            if not (p.published_version.seo or {}).get("noindex")
        ]
        posts = [
            {"path": f"/blog/{p.slug}", "updated_at": p.updated_at}
            for p in published_posts().filter(noindex=False).only("slug", "updated_at")
        ]
        return Response({"pages": pages, "posts": posts})


@method_decorator(csrf_protect, name="dispatch")
class NewsletterSubscribeView(PublicView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "newsletter"

    @extend_schema(
        request=SubscribeSerializer,
        responses={202: inline_serializer("SubscribeResult", {"detail": serializers.CharField()})},
    )
    def post(self, request):
        serializer = SubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.subscribe(serializer.validated_data["email"], source=serializer.validated_data["source"])
        return Response(
            {"detail": "Thank you. You're on the list."},
            status=status.HTTP_202_ACCEPTED,
        )
