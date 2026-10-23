from django.contrib import admin

from .models import AttendanceRecord, Batch, BatchMembership, ClassSession


class ReadOnlyAdmin(admin.ModelAdmin):
    """Schedules, members and attendance change only through the services,
    which check permissions, notify learners and audit."""

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Batch)
class BatchAdmin(ReadOnlyAdmin):
    list_display = ["name", "course", "status", "starts_on", "ends_on", "capacity"]
    list_filter = ["status"]
    search_fields = ["name", "course__title"]


@admin.register(BatchMembership)
class BatchMembershipAdmin(ReadOnlyAdmin):
    list_display = ["batch", "user", "created_at"]
    search_fields = ["user__email", "batch__name"]


@admin.register(ClassSession)
class ClassSessionAdmin(ReadOnlyAdmin):
    list_display = ["title", "batch", "starts_at", "provider", "status"]
    list_filter = ["status", "provider"]
    search_fields = ["title", "batch__name"]
    exclude = ["join_url", "passcode"]


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(ReadOnlyAdmin):
    list_display = ["session", "user", "status", "joined_at", "marked_at"]
    list_filter = ["status"]
    search_fields = ["user__email"]
