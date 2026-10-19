from django.contrib import admin

from .models import Category, Course, CourseInstructor, CourseModule, Lesson, LessonResource


class CourseInstructorInline(admin.TabularInline):
    model = CourseInstructor
    extra = 0
    raw_id_fields = ["user"]


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ["title", "status", "price", "sale_price", "is_featured", "published_at"]
    list_filter = ["status", "level", "is_featured"]
    search_fields = ["title", "slug"]
    raw_id_fields = ["thumbnail", "og_image", "created_by", "updated_by"]
    inlines = [CourseInstructorInline]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "parent", "position"]


@admin.register(CourseModule)
class CourseModuleAdmin(admin.ModelAdmin):
    list_display = ["title", "course", "position"]
    raw_id_fields = ["course"]


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ["title", "course", "module", "is_published", "is_preview"]
    list_filter = ["is_published", "is_preview"]
    raw_id_fields = ["course", "module"]


@admin.register(LessonResource)
class LessonResourceAdmin(admin.ModelAdmin):
    list_display = ["title", "kind", "lesson", "size_bytes"]
    raw_id_fields = ["lesson"]
