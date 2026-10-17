from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit import services as audit
from common.exceptions import DomainError
from common.permissions import HasPerm

from . import roles, services
from .serializers import (
    AdminUserSerializer,
    EmailVerifySerializer,
    LoginSerializer,
    MeSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserRolesSerializer,
    UserStatusSerializer,
)
from .throttles import LoginEmailThrottle

User = get_user_model()
_Detail = inline_serializer("Detail", {"detail": serializers.CharField()})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Issues the CSRF cookie the frontend must echo in X-CSRFToken."""

    permission_classes = [AllowAny]

    @extend_schema(responses=inline_serializer("Csrf", {"csrf_token": serializers.CharField()}))
    def get(self, request):
        return Response({"csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    @extend_schema(request=RegisterSerializer, responses={201: MeSerializer})
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.register_user(**serializer.validated_data, request=request)
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response(MeSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, LoginEmailThrottle]
    throttle_scope = "login"

    @extend_schema(request=LoginSerializer, responses={200: MeSerializer})
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request, username=serializer.validated_data["email"], password=serializer.validated_data["password"]
        )
        if user is None:
            audit.record("auth.login_failed", request=request, email=serializer.validated_data["email"])
            raise DomainError("Invalid email or password.", code="invalid_credentials", status_code=400)
        login(request, user)
        audit.record("auth.login", actor=user, target=user, request=request)
        return Response(MeSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        if request.user.is_authenticated:
            audit.record("auth.logout", actor=request.user, target=request.user, request=request)
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "options"]

    def get_object(self):
        return User.objects.select_related("profile").prefetch_related("groups").get(pk=self.request.user.pk)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordChangeSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)  # keep this session, invalidate others
        audit.record("account.password_changed", actor=request.user, target=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_protect, name="dispatch")
class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetRequestSerializer, responses={202: _Detail})
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_password_reset(serializer.validated_data["email"], request=request)
        return Response(
            {"detail": "If an account exists for that email, a reset link has been sent."},
            status=status.HTTP_202_ACCEPTED,
        )


@method_decorator(csrf_protect, name="dispatch")
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.confirm_password_reset(**serializer.validated_data, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_protect, name="dispatch")
class EmailVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verify"

    @extend_schema(request=EmailVerifySerializer, responses={200: _Detail})
    def post(self, request):
        serializer = EmailVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.verify_email(serializer.validated_data["token"])
        return Response({"detail": "Your email address has been verified."})


class EmailVerifyResendView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verify"

    @extend_schema(request=None, responses={202: _Detail})
    def post(self, request):
        if request.user.email_verified:
            return Response({"detail": "Your email address is already verified."})
        services.send_verification_email(request.user)
        return Response({"detail": "A new verification email has been sent."}, status=status.HTTP_202_ACCEPTED)


class AdminUserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Staff user directory. Status changes and role assignment have separate permissions."""

    serializer_class = AdminUserSerializer
    permission_classes = [HasPerm("accounts.view_user_directory")]
    search_fields = ["email", "full_name", "phone"]
    ordering_fields = ["date_joined", "email", "full_name", "last_login"]
    ordering = ["-date_joined"]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        qs = User.objects.prefetch_related("groups")
        role = self.request.query_params.get("role")
        if role == roles.SUPER_ADMIN:
            qs = qs.filter(is_superuser=True)
        elif role in roles.ROLES:
            qs = qs.filter(groups__name=roles.group_name(role))
        return qs

    @extend_schema(request=UserStatusSerializer, responses=AdminUserSerializer)
    @action(detail=True, methods=["post"], permission_classes=[HasPerm("accounts.manage_user_status")])
    def status(self, request, pk=None):
        serializer = UserStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.set_user_active(
            target=self.get_object(),
            is_active=serializer.validated_data["is_active"],
            actor=request.user,
            request=request,
        )
        return Response(AdminUserSerializer(user).data)

    @extend_schema(request=UserRolesSerializer, responses=AdminUserSerializer)
    @action(detail=True, methods=["put"], permission_classes=[HasPerm("accounts.assign_roles")])
    def roles(self, request, pk=None):
        serializer = UserRolesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = self.get_object()
        services.set_user_roles(
            target=user, role_slugs=serializer.validated_data["roles"], actor=request.user, request=request
        )
        # Re-fetch: the instance from get_object() carries a stale groups prefetch.
        user = self.get_queryset().get(pk=user.pk)
        return Response(AdminUserSerializer(user).data)


class RoleListView(APIView):
    permission_classes = [HasPerm("accounts.view_user_directory")]

    @extend_schema(
        responses=inline_serializer(
            "RoleInfo",
            {
                "slug": serializers.CharField(),
                "name": serializers.CharField(),
                "description": serializers.CharField(),
            },
            many=True,
        )
    )
    def get(self, request):
        return Response([{"slug": r.slug, "name": r.name, "description": r.description} for r in roles.ROLES.values()])
