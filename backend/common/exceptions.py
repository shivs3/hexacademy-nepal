"""Consistent error envelope for every API error.

{"error": {"code": "validation_error", "message": "...", "details": {...}}}
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class DomainError(exceptions.APIException):
    """Raised by service layers for business-rule violations."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "domain_error"
    default_detail = "The request could not be completed."

    def __init__(self, message=None, code=None, status_code=None):
        super().__init__(detail=message or self.default_detail, code=code or self.default_code)
        if status_code:
            self.status_code = status_code


class ConflictError(DomainError):
    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"


def _code_for(exc) -> str:
    if isinstance(exc, exceptions.ValidationError):
        return "validation_error"
    if isinstance(exc, exceptions.NotAuthenticated):
        return "not_authenticated"
    if isinstance(exc, exceptions.AuthenticationFailed):
        return "authentication_failed"
    if isinstance(exc, exceptions.PermissionDenied):
        return "permission_denied"
    if isinstance(exc, exceptions.NotFound):
        return "not_found"
    if isinstance(exc, exceptions.Throttled):
        return "throttled"
    if isinstance(exc, exceptions.APIException):
        codes = exc.get_codes()
        return codes if isinstance(codes, str) else "error"
    return "error"


def api_exception_handler(exc, context):
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, DjangoPermissionDenied):
        exc = exceptions.PermissionDenied()
    elif isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(detail=exc.message_dict if hasattr(exc, "error_dict") else exc.messages)

    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    if isinstance(exc, exceptions.ValidationError):
        if isinstance(data, dict) and set(data.keys()) == {"non_field_errors"}:
            message = str(data["non_field_errors"][0])
        elif isinstance(data, list) and data:
            message = str(data[0])
        else:
            message = "Please correct the highlighted fields."
        details = data
    else:
        message = str(data.get("detail", "")) if isinstance(data, dict) else str(data)
        details = None

    body = {"error": {"code": _code_for(exc), "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return Response(body, status=response.status_code, headers=_retain_headers(response))


def _retain_headers(response):
    return {k: v for k, v in response.items() if k in ("Retry-After", "WWW-Authenticate", "Allow")}
