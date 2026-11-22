from django.urls import path
from rest_framework.routers import SimpleRouter

from . import access_views, admin_views, views

router = SimpleRouter()
router.register("admin/commerce/orders", admin_views.AdminOrderViewSet, basename="admin-commerce-orders")
router.register("admin/commerce/payments", admin_views.AdminPaymentViewSet, basename="admin-commerce-payments")
router.register("admin/commerce/coupons", admin_views.AdminCouponViewSet, basename="admin-commerce-coupons")
router.register("admin/commerce/requests", access_views.AdminAccessRequestViewSet, basename="admin-commerce-requests")

urlpatterns = [
    path("checkout/item/", access_views.CheckoutItemView.as_view(), name="checkout-item"),
    path("access-requests/", access_views.AccessRequestCreateView.as_view(), name="access-request-create"),
    path("me/access-requests/", access_views.MyAccessRequestsView.as_view(), name="my-access-requests"),
    path(
        "me/access-requests/<str:number>/cancel/",
        access_views.MyAccessRequestCancelView.as_view(),
        name="my-access-request-cancel",
    ),
    path("admin/users/<int:pk>/access/", access_views.AdminUserAccessView.as_view(), name="admin-user-access"),
    path(
        "admin/users/<int:pk>/exam-access/",
        access_views.AdminUserExamAccessView.as_view(),
        name="admin-user-exam-access",
    ),
    path(
        "admin/exam-access/<int:pk>/revoke/",
        access_views.AdminExamAccessRevokeView.as_view(),
        name="admin-exam-access-revoke",
    ),
    path("admin/access/options/", access_views.AdminAccessOptionsView.as_view(), name="admin-access-options"),
    path("admin/access/people/", access_views.AdminAccessPeopleView.as_view(), name="admin-access-people"),
    path("admin/access/assign/", access_views.AdminAssignAccessView.as_view(), name="admin-access-assign"),
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
