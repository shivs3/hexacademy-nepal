"""Tiny JSON-over-HTTPS client on the standard library, so the payment code
has no extra dependency. Timeouts are short: a slow gateway must not hold a
web worker, and every verification can be retried later."""

import json
import urllib.error
import urllib.parse
import urllib.request

from .base import ProviderError

TIMEOUT_SECONDS = 15


def request_json(method: str, url: str, *, headers=None, body=None, params=None) -> tuple[int, dict]:
    """Returns (status, parsed JSON). 4xx responses with a JSON body are returned,
    not raised, because some providers report payment states that way."""
    if urllib.parse.urlsplit(url).scheme != "https":
        raise ProviderError("Payment provider URLs must use https.")
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)  # noqa: S310 - https enforced above
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for name, value in (headers or {}).items():
        req.add_header(name, value)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:  # noqa: S310 - https enforced above
            return res.status, _parse(res.read())
    except urllib.error.HTTPError as exc:
        payload = _parse(exc.read())
        if 400 <= exc.code < 500 and payload:
            return exc.code, payload
        raise ProviderError(f"The payment provider returned HTTP {exc.code}.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProviderError("The payment provider could not be reached.") from None


def _parse(raw: bytes) -> dict:
    try:
        value = json.loads(raw or b"{}")
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {"data": value}
