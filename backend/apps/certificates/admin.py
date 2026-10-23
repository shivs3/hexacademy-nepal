from django.contrib import admin

from .models import Certificate, CertificateRule, CertificateTemplate


@admin.register(CertificateTemplate)
class CertificateTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "heading", "signatory_name", "updated_at"]
    search_fields = ["name"]


@admin.register(CertificateRule)
class CertificateRuleAdmin(admin.ModelAdmin):
    list_display = ["course", "is_enabled", "template", "require_lessons", "required_exam", "require_assignments"]
    list_filter = ["is_enabled"]
    raw_id_fields = ["course", "required_exam"]


@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    """Read-only: issue through the rules, revoke through the staff API (audited)."""

    list_display = ["number", "recipient_name", "course_title", "issued_at", "status"]
    list_filter = ["status"]
    search_fields = ["number", "recipient_name", "user__email"]
    readonly_fields = [f.name for f in Certificate._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
