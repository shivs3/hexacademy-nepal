"""Notice endpoints: staff CRUD under /api/v1/admin/cms/notices/ and the public
list/detail under /api/v1/notices/, which only ever return live notices."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_field
from rest_framework import serializers, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import HasPerm

from . import notices as service
from . import sanitize
from .models import MediaAsset, Notice, NoticePage

MANAGE_NOTICES = "cms.manage_notices"
MAX_BODY = 50_000


class NoticePageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = NoticePage
        fields = ["number", "url", "width", "height"]

    def get_url(self, obj) -> str:
        return obj.image.url


class NoticeAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.CharField(read_only=True)
    alt = serializers.CharField(source="alt_text", read_only=True)

    class Meta:
        model = MediaAsset
        fields = ["id", "kind", "url", "mime_type", "width", "height", "alt", "original_name", "size_bytes"]


def _pages(notice: Notice) -> list[dict]:
    # Pages belong to the PDF they were rendered from; hide them if that changed.
    attachment = notice.attachment
    if attachment is None or attachment.kind != MediaAsset.Kind.DOCUMENT:
        return []
    if notice.rendered_attachment_id != attachment.pk:
        return []
    return NoticePageSerializer(notice.pages.all(), many=True).data


# --- Staff ------------------------------------------------------------------------------------


class AdminNoticeSerializer(serializers.ModelSerializer):
    attachment = serializers.PrimaryKeyRelatedField(queryset=MediaAsset.objects.all(), allow_null=True, required=False)
    attachment_detail = serializers.SerializerMethodField()
    pages = serializers.SerializerMethodField()
    is_live = serializers.SerializerMethodField()
    is_upcoming = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = [
            "id",
            "title",
            "summary",
            "body",
            "attachment",
            "attachment_detail",
            "pages",
            "is_active",
            "show_in_popup",
            "starts_at",
            "ends_at",
            "position",
            "is_live",
            "is_upcoming",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    @extend_schema_field(NoticeAttachmentSerializer(allow_null=True))
    def get_attachment_detail(self, obj):
        return NoticeAttachmentSerializer(obj.attachment).data if obj.attachment_id else None

    @extend_schema_field(NoticePageSerializer(many=True))
    def get_pages(self, obj) -> list[dict]:
        return _pages(obj)

    def get_is_live(self, obj) -> bool:
        return obj.is_live()

    def get_is_upcoming(self, obj) -> bool:
        return obj.is_active and obj.starts_at is not None and obj.starts_at > timezone.now()

    def validate_title(self, value):
        value = sanitize.clean_plain_text(value)
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate_summary(self, value):
        return sanitize.clean_plain_text(value)

    def validate_body(self, value):
        if len(value) > MAX_BODY:
            raise serializers.ValidationError("The details are too long.")
        value = sanitize.clean_rich_text(value)
        return "" if sanitize.rich_text_is_empty(value) else value

    def validate(self, attrs):
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": ["The end time must be after the start time."]})
        return attrs

    def _save(self, notice, validated_data):
        request = self.context["request"]
        return service.save_notice(notice, data=validated_data, actor=request.user, request=request)

    def create(self, validated_data):
        return self._save(Notice(), validated_data)

    def update(self, instance, validated_data):
        return self._save(instance, validated_data)


class AdminNoticeViewSet(viewsets.ModelViewSet):
    serializer_class = AdminNoticeSerializer
    permission_classes = [HasPerm(MANAGE_NOTICES)]
    search_fields = ["title", "summary"]
    ordering = ["position", "-created_at"]
    filterset_fields = ["is_active", "show_in_popup"]

    def get_queryset(self):
        return Notice.objects.select_related("attachment").prefetch_related("pages")

    def perform_destroy(self, instance):
        service.delete_notice(instance, actor=self.request.user, request=self.request)


# --- Public -----------------------------------------------------------------------------------


class PublicNoticeSerializer(serializers.ModelSerializer):
    attachment = serializers.SerializerMethodField()
    pages = serializers.SerializerMethodField()
    has_details = serializers.SerializerMethodField()
    published_at = serializers.SerializerMethodField()

    class Meta:
        model = Notice
        fields = [
            "id",
            "title",
            "summary",
            "has_details",
            "attachment",
            "pages",
            "show_in_popup",
            "published_at",
            "updated_at",
        ]

    @extend_schema_field(NoticeAttachmentSerializer(allow_null=True))
    def get_attachment(self, obj):
        if not obj.attachment_id:
            return None
        data = NoticeAttachmentSerializer(obj.attachment).data
        data.pop("id")
        return data

    @extend_schema_field(NoticePageSerializer(many=True))
    def get_pages(self, obj) -> list[dict]:
        return _pages(obj)

    def get_has_details(self, obj) -> bool:
        return bool(obj.body)

    def get_published_at(self, obj) -> str:
        return serializers.DateTimeField().to_representation(obj.starts_at or obj.created_at)


class PublicNoticeDetailSerializer(PublicNoticeSerializer):
    class Meta(PublicNoticeSerializer.Meta):
        fields = [*PublicNoticeSerializer.Meta.fields, "body"]


class NoticeListView(APIView):
    permission_classes = [AllowAny]
    MAX_ITEMS = 50

    @extend_schema(responses=PublicNoticeSerializer(many=True))
    def get(self, request):
        rows = service.live_notices()[: self.MAX_ITEMS]
        return Response(PublicNoticeSerializer(rows, many=True).data)


class NoticeDetailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicNoticeDetailSerializer)
    def get(self, request, pk: int):
        notice = get_object_or_404(service.live_notices(), pk=pk)
        return Response(PublicNoticeDetailSerializer(notice).data)
