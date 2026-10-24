import logging
import uuid

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)


@require_GET
def health(request):
    """Liveness: the process is up."""
    return JsonResponse({"status": "ok"})


def _database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:  # noqa: BLE001 - report any DB failure as not ready
        logger.exception("Readiness: database check failed")
        return False
    return True


def _cache_ok() -> bool:
    # Throttle counters live in the cache (Redis in production); if it is down
    # every throttled API call fails. A per-probe key keeps concurrent probes apart.
    token = uuid.uuid4().hex
    key = f"readyz:{token}"
    try:
        cache.set(key, token, timeout=10)
        ok = cache.get(key) == token
        cache.delete(key)
        return ok
    except Exception:  # noqa: BLE001 - report any cache failure as not ready
        logger.exception("Readiness: cache check failed")
        return False


@require_GET
def readiness(request):
    """Readiness: the database and the cache are reachable."""
    checks = {"database": _database_ok(), "cache": _cache_ok()}
    ready = all(checks.values())
    body = {"status": "ok" if ready else "unavailable", **{k: "ok" if v else "error" for k, v in checks.items()}}
    return JsonResponse(body, status=200 if ready else 503)
