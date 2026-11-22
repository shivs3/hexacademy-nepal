"""The public Exams section: every published exam, open to visitors.

Only exam details are shown (title, rules, price and how to take it). No
question, option or answer is read here. Whether the visitor may start an exam
is still decided by `attempts.eligibility` when they open it signed in.
"""

from django.db.models import Case, Count, F, Q, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field, inline_serializer
from rest_framework import generics, serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Course

from . import services
from .models import OFFERED_ON_ITS_OWN, Exam, ExamCategory

ORDERINGS = {
    "newest": ["-published_at", "-id"],
    "title": ["title", "id"],
    "price_low": ["effective_price", "title"],
    "price_high": ["-effective_price", "title"],
}
OFFERS = ("free", "paid", "course")


def public_exams(now=None):
    """Published exams that haven't closed. A course exam is listed only while
    its course is published, so visitors always have a way to take it."""
    now = now or timezone.now()
    return (
        Exam.objects.filter(status=Exam.Status.PUBLISHED)
        .filter(Q(closes_at__isnull=True) | Q(closes_at__gt=now))
        .filter(Q(course__isnull=True) | Q(course__status=Course.Status.PUBLISHED))
        .filter(
            Q(category__isnull=True)
            | (Q(category__is_active=True) & (Q(category__parent__isnull=True) | Q(category__parent__is_active=True)))
        )
        .select_related("course", "category__parent")
    )


def offer_of(exam: Exam) -> str:
    """free / paid: can be taken on its own; course: only with its course."""
    if not exam.offered_on_its_own:
        return "course"
    return "free" if exam.is_free else "paid"


class ExamCategoryParentRef(serializers.Serializer):
    name = serializers.CharField()
    slug = serializers.CharField()


class ExamCategoryRef(serializers.Serializer):
    """The exam's category; `parent` is set when it is a section (NRB › Paper I)."""

    name = serializers.CharField()
    slug = serializers.CharField()
    parent = ExamCategoryParentRef(allow_null=True)


class ExamCourseRef(serializers.Serializer):
    title = serializers.CharField()
    slug = serializers.CharField()


class PublicExamSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display")
    category = ExamCategoryRef(allow_null=True)
    course = ExamCourseRef(allow_null=True)
    offer = serializers.SerializerMethodField()
    is_free = serializers.BooleanField(read_only=True)
    current_price = serializers.SerializerMethodField(help_text="The offer price while it lasts, else the price.")
    question_total = serializers.SerializerMethodField()
    total_marks = serializers.SerializerMethodField()

    class Meta:
        model = Exam
        fields = [
            "slug", "title", "summary", "kind", "kind_label", "category", "course", "offer", "price", "current_price",
            "sale_ends_at", "is_free",
            "duration_minutes", "question_total", "total_marks", "opens_at", "closes_at", "max_attempts",
            "negative_marking",
        ]  # fmt: skip

    @extend_schema_field(serializers.ChoiceField(choices=OFFERS))
    def get_offer(self, obj):
        return offer_of(obj)

    def get_current_price(self, obj) -> str:
        return f"{obj.current_price():.2f}"

    def get_question_total(self, obj) -> int:
        return services.drawn_count(obj, services.pool_summary(obj)["pool_size"])

    def get_total_marks(self, obj) -> str:
        return f"{services.total_marks(obj):.2f}"


class PublicExamDetailSerializer(PublicExamSerializer):
    result_release_label = serializers.CharField(source="get_result_release_display")

    class Meta(PublicExamSerializer.Meta):
        fields = [
            *PublicExamSerializer.Meta.fields,
            "instructions", "pass_marks", "allow_revisit", "result_release_label", "updated_at",
        ]  # fmt: skip


@extend_schema(
    parameters=[
        OpenApiParameter("search", str),
        OpenApiParameter("category", str, description="Category slug; a category also lists its sections' exams"),
        OpenApiParameter("kind", str, enum=Exam.Kind.values),
        OpenApiParameter("offer", str, enum=list(OFFERS)),
        OpenApiParameter("ordering", str, enum=list(ORDERINGS)),
    ]
)
class PublicExamListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicExamSerializer
    filter_backends: list = []

    def get_queryset(self):
        params = self.request.query_params
        qs = public_exams()
        if search := params.get("search", "").strip()[:100]:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(summary__icontains=search)
                | Q(category__name__icontains=search)
                | Q(course__title__icontains=search)
            )
        if category := params.get("category"):
            qs = qs.filter(Q(category__slug=category) | Q(category__parent__slug=category))
        if (kind := params.get("kind")) in Exam.Kind.values:
            qs = qs.filter(kind=kind)
        offer = params.get("offer")
        if offer == "free":
            qs = qs.filter(OFFERED_ON_ITS_OWN, price=0)
        elif offer == "paid":
            qs = qs.filter(OFFERED_ON_ITS_OWN, price__gt=0)
        elif offer == "course":
            qs = qs.exclude(OFFERED_ON_ITS_OWN)
        # Sort by what a visitor pays today, counting offers that are still running.
        now = timezone.now()
        running = Q(sale_price__isnull=False) & (Q(sale_ends_at__isnull=True) | Q(sale_ends_at__gt=now))
        qs = services.with_pool_totals(qs).annotate(
            effective_price=Case(When(running, then=F("sale_price")), default=F("price"))
        )
        return qs.order_by(*ORDERINGS.get(params.get("ordering", ""), ORDERINGS["newest"]))


class PublicExamDetailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicExamDetailSerializer)
    def get(self, request, slug):
        exam = get_object_or_404(public_exams(), slug=slug)
        return Response(PublicExamDetailSerializer(exam).data)


def _category_fields(children=None):
    fields = {
        "name": serializers.CharField(),
        "slug": serializers.CharField(),
        "description": serializers.CharField(),
        "exam_count": serializers.IntegerField(),
    }
    if children:
        fields["children"] = children
    return fields


class PublicExamCategoriesView(APIView):
    """Active top-level categories that have listed exams, each with its active
    sections (`children`). A category's count includes its sections' exams;
    empty sections and categories are left out."""

    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            "PublicExamCategory",
            _category_fields(inline_serializer("PublicExamSection", _category_fields(), many=True)),
            many=True,
        )
    )
    def get(self, request):
        listed = public_exams().values("pk")
        rows = list(
            ExamCategory.objects.filter(is_active=True)
            .filter(Q(parent__isnull=True) | Q(parent__is_active=True))
            .annotate(exam_count=Count("exams", filter=Q(exams__in=listed)))
            .values("id", "parent_id", "name", "slug", "description", "exam_count")
        )

        def public(r):
            return {k: r[k] for k in ("name", "slug", "description", "exam_count")}

        sections: dict[int, list] = {}
        for r in rows:
            if r["parent_id"] and r["exam_count"]:
                sections.setdefault(r["parent_id"], []).append(public(r))
        tree = []
        for r in rows:
            if r["parent_id"]:
                continue
            children = sections.get(r["id"], [])
            total = r["exam_count"] + sum(c["exam_count"] for c in children)
            if total:
                tree.append({**public(r), "exam_count": total, "children": children})
        return Response(tree)


class ExamSitemapView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            "ExamSitemapEntry",
            {"slug": serializers.CharField(), "updated_at": serializers.DateTimeField()},
            many=True,
        )
    )
    def get(self, request):
        return Response(list(public_exams().order_by("-published_at").values("slug", "updated_at")))
