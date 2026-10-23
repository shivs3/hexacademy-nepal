"""The signed-in user's own notifications. Querysets are always filtered to
request.user, so one user can never read or mark another's."""

from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import generics, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "created_at", "read_at"]


class MarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), max_length=100, required=False)


@extend_schema(parameters=[OpenApiParameter("unread", bool)])
class MyNotificationsView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    filter_backends: list = []

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get("unread") in ("1", "true"):
            qs = qs.filter(read_at__isnull=True)
        return qs


class UnreadCountView(APIView):
    @extend_schema(responses=inline_serializer("UnreadCount", {"unread": serializers.IntegerField()}))
    def get(self, request):
        return Response({"unread": services.unread_count(request.user)})


class MarkReadView(APIView):
    """Mark the given notifications read, or all of them when no ids are sent."""

    @extend_schema(
        request=MarkReadSerializer,
        responses=inline_serializer("MarkReadResult", {"updated": serializers.IntegerField()}),
    )
    def post(self, request):
        serializer = MarkReadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = services.mark_read(request.user, serializer.validated_data.get("ids"))
        return Response({"updated": updated})
