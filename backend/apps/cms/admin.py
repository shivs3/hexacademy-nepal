"""Low-level Django admin (super administrators only). Day-to-day editing
happens in the staff dashboard, which goes through the versioned services."""

from django.contrib import admin

from .models import BlogCategory, BlogPost, MediaAsset, Menu, NewsletterSubscriber, Page, PageVersion, SiteSettings


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "status", "is_home", "updated_at")
    list_filter = ("status", "is_home")
    search_fields = ("title", "slug")
    readonly_fields = ("published_version", "scheduled_version", "sections")


@admin.register(PageVersion)
class PageVersionAdmin(admin.ModelAdmin):
    list_display = ("page", "number", "note", "created_by", "created_at")
    readonly_fields = [f.name for f in PageVersion._meta.fields]

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = ("original_name", "kind", "mime_type", "size_bytes", "created_at")
    list_filter = ("kind",)
    search_fields = ("original_name", "title", "alt_text")


admin.site.register(SiteSettings)
admin.site.register(Menu)
admin.site.register(BlogCategory)


@admin.register(BlogPost)
class BlogPostAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "published_at", "author")
    list_filter = ("status",)
    search_fields = ("title", "slug")


@admin.register(NewsletterSubscriber)
class NewsletterSubscriberAdmin(admin.ModelAdmin):
    list_display = ("email", "consented_at", "unsubscribed_at")
    search_fields = ("email",)
