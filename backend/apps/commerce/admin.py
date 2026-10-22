from django.contrib import admin

from .models import Coupon, Order, OrderItem, Payment, PaymentEvent, Refund


class ReadOnlyAdmin(admin.ModelAdmin):
    """Money moves only through the services, which validate and audit it."""

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    has_add_permission = has_change_permission = has_delete_permission = ReadOnlyAdmin.has_add_permission


class PaymentInline(OrderItemInline):
    model = Payment
    fields = ["reference", "provider", "status", "amount", "verified_at"]


@admin.register(Order)
class OrderAdmin(ReadOnlyAdmin):
    list_display = ["number", "user", "status", "total", "paid_at", "needs_review"]
    list_filter = ["status", "needs_review"]
    search_fields = ["number", "user__email"]
    inlines = [OrderItemInline, PaymentInline]


@admin.register(PaymentEvent)
class PaymentEventAdmin(ReadOnlyAdmin):
    list_display = ["payment", "kind", "source", "status_after", "created_at"]


@admin.register(Refund)
class RefundAdmin(ReadOnlyAdmin):
    list_display = ["order", "amount", "processed_by", "created_at"]


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ["code", "kind", "value", "is_active", "ends_at"]
    search_fields = ["code"]
