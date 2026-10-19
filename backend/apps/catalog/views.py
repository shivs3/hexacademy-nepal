"""Public catalog endpoints: published courses only."""

from django.db.models import Case, DecimalField, F, Q, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .cms_sections import public_instructors
from .models import Course
from .serializers import (
    CourseCardSerializer,
    CourseDetailSerializer,
    InstructorSerializer,
    PublicCategorySerializer,
    category_tree,
    published_courses,
)

ORDERINGS = {
    "newest": ["-published_at", "-id"],
    "title": ["title", "id"],
    "price_low": ["effective_price", "title"],
    "price_high": ["-effective_price", "title"],
}


def with_effective_price(qs, now=None):
    now = now or timezone.now()
    on_sale = Q(sale_price__isnull=False) & (Q(sale_ends_at__isnull=True) | Q(sale_ends_at__gt=now))
    return qs.annotate(
        effective_price=Case(
            When(on_sale, then=F("sale_price")),
            default=F("price"),
            output_field=DecimalField(max_digits=10, decimal_places=2),
        )
    )


@extend_schema(
    parameters=[
        OpenApiParameter("search", str),
        OpenApiParameter("category", str, description="Category slug; includes its subcategories."),
        OpenApiParameter("level", str, enum=[c for c, _ in Course.Level.choices]),
        OpenApiParameter("language", str),
        OpenApiParameter("price", str, enum=["free", "paid"]),
        OpenApiParameter("featured", bool),
        OpenApiParameter("ordering", str, enum=list(ORDERINGS)),
    ]
)
class CourseListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = CourseCardSerializer
    filter_backends: list = []

    def get_queryset(self):
        params = self.request.query_params
        qs = with_effective_price(published_courses())
        if search := params.get("search", "").strip()[:100]:
            qs = qs.filter(
                Q(title__icontains=search) | Q(subtitle__icontains=search) | Q(category__name__icontains=search)
            )
        if category := params.get("category"):
            qs = qs.filter(Q(category__slug=category) | Q(category__parent__slug=category))
        if (level := params.get("level")) in Course.Level.values:
            qs = qs.filter(level=level)
        if language := params.get("language"):
            qs = qs.filter(language=language)
        if params.get("price") == "free":
            qs = qs.filter(effective_price=0)
        elif params.get("price") == "paid":
            qs = qs.filter(effective_price__gt=0)
        if params.get("featured") in ("1", "true"):
            qs = qs.filter(is_featured=True)
        return qs.order_by(*ORDERINGS.get(params.get("ordering", ""), ORDERINGS["newest"]))


class CourseDetailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=CourseDetailSerializer)
    def get(self, request, slug):
        course = get_object_or_404(published_courses().select_related("og_image"), slug=slug)
        return Response(CourseDetailSerializer(course).data)


class CategoryListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicCategorySerializer(many=True))
    def get(self, request):
        return Response(PublicCategorySerializer(category_tree(), many=True).data)


class InstructorListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=InstructorSerializer(many=True))
    def get(self, request):
        return Response(public_instructors(limit=100))


class CourseSitemapView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            "CourseSitemapEntry",
            {"slug": serializers.CharField(), "updated_at": serializers.DateTimeField()},
            many=True,
        )
    )
    def get(self, request):
        rows = Course.objects.filter(status=Course.Status.PUBLISHED, noindex=False).values("slug", "updated_at")
        return Response(list(rows.order_by("-published_at")))
