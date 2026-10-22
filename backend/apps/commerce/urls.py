from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, views

router = SimpleRouter()
router.register("admin/commerce/orders", admin_views.AdminOrderViewSet, basename="admin-commerce-orders")
router.register("admin/commerce/payments", admin_views.AdminPaymentViewSet, basename="admin-commerce-payments")
router.register("admin/commerce/coupons", admin_views.AdminCouponViewSet, basename="admin-commerce-coupons")

urlpatterns = [
    path("payments/methods/", views.PaymentMethodsView.as_view(), name="payment-methods"),
    path("orders/quote/", views.QuoteView.as_view(), name="order-quote"),
    path("orders/", views.OrderCreateView.as_view(), name="order-create"),
    path("me/orders/", views.MyOrdersView.as_view(), name="my-orders"),
    path("me/orders/<str:number>/", views.MyOrderDetailView.as_view(), name="my-order"),
    path("me/orders/<str:number>/cancel/", views.MyOrderCancelView.as_view(), name="my-order-cancel"),
    path("payments/initiate/", views.InitiatePaymentView.as_view(), name="payment-initiate"),
    path("payments/<str:reference>/verify/", views.VerifyPaymentView.as_view(), name="payment-verify"),
    path("payments/<str:reference>/bank-transfer/", views.BankTransferView.as_view(), name="payment-bank-transfer"),
    path("payments/sandbox/<str:reference>/", views.SandboxChargeView.as_view(), name="payment-sandbox"),
    path("webhooks/payments/<slug:provider>/", views.PaymentWebhookView.as_view(), name="payment-webhook"),
    path(
        "admin/commerce/course-options/",
        admin_views.AdminCouponCourseOptionsView.as_view(),
        name="admin-commerce-course-options",
    ),
    path("admin/commerce/settings/", admin_views.AdminPaymentSettingsView.as_view(), name="admin-commerce-settings"),
    path(
        "admin/commerce/reports/revenue/", admin_views.AdminRevenueReportView.as_view(), name="admin-commerce-revenue"
    ),
    *router.urls,
]
