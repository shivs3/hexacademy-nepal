import logging
import re
import threading
import uuid

_local = threading.local()
_VALID_ID = re.compile(r"^[A-Za-z0-9\-]{8,64}$")


def get_request_id() -> str:
    return getattr(_local, "request_id", "-")


class RequestIdMiddleware:
    """Attaches a request id (from X-Request-ID when well-formed) for log correlation."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.headers.get("X-Request-ID", "")
        request_id = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex
        _local.request_id = request_id
        request.request_id = request_id
        try:
            response = self.get_response(request)
        finally:
            _local.request_id = "-"
        response["X-Request-ID"] = request_id
        return response


class RequestIdLogFilter(logging.Filter):
    def filter(self, record):
        record.request_id = get_request_id()
        return True
