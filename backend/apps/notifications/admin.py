from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["user", "kind", "title", "created_at", "read_at", "emailed_at"]
    list_filter = ["kind"]
    search_fields = ["user__email", "title"]
    raw_id_fields = ["user"]
    readonly_fields = ["created_at", "read_at", "emailed_at"]
