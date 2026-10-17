from __future__ import annotations

from typing import Any

from django.conf import settings

from common.middleware import get_request_id

from .models import AuditLog

# Keys that must never be persisted in audit metadata.
_REDACTED_KEYS = {"password", "token", "secret", "api_key", "authorization", "correct_option_ids"}


def _client_ip(request) -> str | None:
    if request is None:
        return None
    # X-Forwarded-For is client-controlled unless a trusted proxy (Nginx) overwrites it.
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR") if settings.TRUST_X_FORWARDED_FOR else None
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def _scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("[redacted]" if k.lower() in _REDACTED_KEYS else _scrub(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_scrub(v) for v in value]
    return value


def record(action: str, *, actor=None, target=None, request=None, **metadata) -> AuditLog:
    if actor is None and request is not None and getattr(request, "user", None) is not None:
        actor = request.user if request.user.is_authenticated else None
    return AuditLog.objects.create(
        actor=actor,
        actor_email=getattr(actor, "email", "") or "",
        action=action,
        target_type=target._meta.label_lower if target is not None else "",
        target_id=str(target.pk) if target is not None else "",
        target_repr=str(target)[:255] if target is not None else "",
        metadata=_scrub(metadata),
        ip_address=_client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "")[:255] if request is not None else ""),
        request_id=get_request_id(),
    )
