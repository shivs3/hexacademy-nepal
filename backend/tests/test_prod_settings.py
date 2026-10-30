"""Production settings: cookies stay Secure unless a plain-HTTP staging host opts out."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
PRINT = (
    "from django.conf import settings as s; print(s.SESSION_COOKIE_SECURE, s.CSRF_COOKIE_SECURE, s.SECURE_HSTS_SECONDS)"
)


def load_prod(**extra: str) -> subprocess.CompletedProcess[str]:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "DJANGO_SETTINGS_MODULE": "config.settings.prod",
        "DJANGO_SECRET_KEY": "x" * 64,
        "PAYMENTS_ENABLE_SANDBOX": "false",
        **extra,
    }
    code = f"import django; django.setup(); {PRINT}"
    cmd = [sys.executable, "-c", code]
    return subprocess.run(cmd, cwd=BACKEND, env=env, capture_output=True, text=True, check=False)  # noqa: S603


@pytest.mark.parametrize(
    ("extra", "expected"),
    [
        ({}, "True True 2592000"),
        ({"DJANGO_SECURE_COOKIES": "false", "DJANGO_SECURE_SSL_REDIRECT": "false"}, "False False 0"),
    ],
)
def test_cookie_security(extra, expected):
    result = load_prod(**extra)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == expected


def test_insecure_cookies_require_redirect_off():
    result = load_prod(DJANGO_SECURE_COOKIES="false")
    assert result.returncode != 0
    assert "DJANGO_SECURE_SSL_REDIRECT=false" in result.stderr
