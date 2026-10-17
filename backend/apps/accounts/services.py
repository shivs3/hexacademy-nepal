"""Account domain services: registration, verification, password reset, roles."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from apps.audit import services as audit
from common.exceptions import DomainError

from . import roles
from .models import UserProfile

User = get_user_model()
_VERIFY_SALT = "accounts.email-verification"


@transaction.atomic
def register_user(*, email: str, password: str, full_name: str, phone: str = "", request=None) -> User:
    if User.objects.filter(email__iexact=email.strip()).exists():
        raise DomainError("An account with this email already exists.", code="email_taken")
    user = User.objects.create_user(email=email, password=password, full_name=full_name.strip(), phone=phone)
    UserProfile.objects.create(user=user)
    student, _ = Group.objects.get_or_create(name=roles.group_name(roles.STUDENT))
    user.groups.add(student)
    audit.record("account.registered", actor=user, target=user, request=request)
    transaction.on_commit(lambda: send_verification_email(user))
    return user


# --- Email verification ---------------------------------------------------


def make_verification_token(user) -> str:
    return signing.dumps({"uid": user.pk, "email": user.email}, salt=_VERIFY_SALT)


def send_verification_email(user) -> None:
    link = f"{settings.FRONTEND_URL}/verify-email?token={make_verification_token(user)}"
    send_mail(
        subject="Verify your Hexacademy Nepal email",
        message=(
            f"Hello {user.get_short_name()},\n\n"
            f"Please confirm your email address by opening this link:\n{link}\n\n"
            "If you did not create an account, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )


def verify_email(token: str) -> User:
    try:
        data = signing.loads(token, salt=_VERIFY_SALT, max_age=settings.EMAIL_VERIFICATION_TIMEOUT.total_seconds())
    except signing.SignatureExpired as exc:
        raise DomainError("This verification link has expired.", code="token_expired") from exc
    except signing.BadSignature as exc:
        raise DomainError("This verification link is invalid.", code="token_invalid") from exc
    user = User.objects.filter(pk=data.get("uid"), email=data.get("email")).first()
    if user is None:
        raise DomainError("This verification link is invalid.", code="token_invalid")
    if not user.email_verified:
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at"])
        audit.record("account.email_verified", actor=user, target=user)
    return user


# --- Password reset --------------------------------------------------------


def request_password_reset(email: str, request=None) -> None:
    """Always succeeds from the caller's perspective to avoid account enumeration."""
    user = User.objects.filter(email__iexact=email.strip(), is_active=True).first()
    if user is None:
        return
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail(
        subject="Reset your Hexacademy Nepal password",
        message=(
            f"Hello {user.get_short_name()},\n\n"
            f"Use this link to choose a new password (valid for 2 hours):\n{link}\n\n"
            "If you did not request this, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )
    audit.record("account.password_reset_requested", actor=user, target=user, request=request)


def confirm_password_reset(*, uid: str, token: str, new_password: str, request=None) -> User:
    try:
        pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=pk, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist) as exc:
        raise DomainError("This reset link is invalid or has expired.", code="token_invalid") from exc
    if not default_token_generator.check_token(user, token):
        raise DomainError("This reset link is invalid or has expired.", code="token_invalid")
    user.set_password(new_password)
    # A completed reset also proves control of the mailbox.
    if not user.email_verified:
        user.email_verified_at = timezone.now()
    user.save()
    audit.record("account.password_reset_completed", actor=user, target=user, request=request)
    return user


# --- Roles -----------------------------------------------------------------


@transaction.atomic
def set_user_roles(*, target: User, role_slugs: list[str], actor: User, request=None) -> list[str]:
    """Replace the target's assignable roles. Super administrator cannot be granted here."""
    if not actor.has_perm("accounts.assign_roles"):
        raise DomainError("You cannot assign roles.", code="permission_denied", status_code=403)
    unknown = set(role_slugs) - set(roles.ASSIGNABLE_ROLES)
    if unknown:
        raise DomainError(f"Unknown or non-assignable roles: {', '.join(sorted(unknown))}.", code="invalid_role")
    if target.is_superuser and not actor.is_superuser:
        raise DomainError("Only a super administrator can modify another super administrator.", status_code=403)
    if target.pk == actor.pk:
        raise DomainError("You cannot change your own roles.", code="self_modification", status_code=403)

    before = roles.role_slugs_for(target)
    managed_names = [r.name for r in roles.ROLES.values()]
    target.groups.remove(*Group.objects.filter(name__in=managed_names))
    for slug in role_slugs:
        group, _ = Group.objects.get_or_create(name=roles.group_name(slug))
        target.groups.add(group)
    after = roles.role_slugs_for(target)
    audit.record("account.roles_changed", actor=actor, target=target, request=request, before=before, after=after)
    return after


def set_user_active(*, target: User, is_active: bool, actor: User, request=None) -> User:
    if target.pk == actor.pk:
        raise DomainError("You cannot change the status of your own account.", status_code=403)
    if target.is_superuser and not actor.is_superuser:
        raise DomainError("Only a super administrator can modify another super administrator.", status_code=403)
    # Existing sessions stop working immediately: ModelBackend.get_user rejects inactive users.
    target.is_active = is_active
    target.save(update_fields=["is_active"])
    audit.record("account.status_changed", actor=actor, target=target, request=request, is_active=is_active)
    return target
