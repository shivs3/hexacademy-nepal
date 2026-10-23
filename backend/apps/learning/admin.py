from django.contrib import admin

from .models import Assignment, Enrollment, LessonProgress, Submission


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


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ["title", "course", "due_at", "is_published", "max_points"]
    list_filter = ["is_published"]
    search_fields = ["title", "course__title"]
    raw_id_fields = ["course", "lesson", "created_by"]


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    # Learner work: read here, grade through the staff dashboard (it notifies and audits).
    list_display = ["assignment", "user", "status", "attempt", "submitted_at", "is_late", "points"]
    list_filter = ["status", "is_late"]
    search_fields = ["user__email", "assignment__title"]
    raw_id_fields = ["assignment", "user", "graded_by"]
    readonly_fields = [f.name for f in Submission._meta.fields]

    def has_add_permission(self, request):
        return False
