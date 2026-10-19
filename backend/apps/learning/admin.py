from django.contrib import admin

from .models import Enrollment, LessonProgress


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ["user", "course", "status", "source", "enrolled_at", "completed_at"]
    list_filter = ["status", "source"]
    search_fields = ["user__email", "course__title"]
    raw_id_fields = ["user", "course", "granted_by", "last_lesson"]


@admin.register(LessonProgress)
class LessonProgressAdmin(admin.ModelAdmin):
    list_display = ["enrollment", "lesson", "first_viewed_at", "completed_at"]
    raw_id_fields = ["enrollment", "lesson"]
