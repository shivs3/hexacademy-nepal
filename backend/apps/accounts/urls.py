from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("admin/users", views.AdminUserViewSet, basename="admin-users")

urlpatterns = [
    path("auth/csrf/", views.CsrfView.as_view(), name="auth-csrf"),
    path("auth/register/", views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/password-reset/", views.PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("auth/password-reset/confirm/", views.PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("auth/verify-email/", views.EmailVerifyView.as_view(), name="auth-verify-email"),
    path("auth/verify-email/resend/", views.EmailVerifyResendView.as_view(), name="auth-verify-email-resend"),
    path("users/me/", views.MeView.as_view(), name="users-me"),
    path("users/me/password/", views.PasswordChangeView.as_view(), name="users-me-password"),
    path("admin/roles/", views.RoleListView.as_view(), name="admin-roles"),
    *router.urls,
]
