from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import PAYMENTS, REST_FRAMEWORK, SECRET_KEY, env

DEBUG = False

if not SECRET_KEY or len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set to a long random value in production.")
if PAYMENTS["ENABLE_SANDBOX_PROVIDER"]:
    raise ImproperlyConfigured("The sandbox payment provider must not be enabled in production.")

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = env.int("DJANGO_HSTS_SECONDS", default=60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = env.bool("DJANGO_HSTS_PRELOAD", default=False)
if not SECURE_HSTS_PRELOAD:
    # Preload is opt-in: it is hard to undo, so enable it only once HTTPS is
    # settled on every subdomain (docs/deployment.md).
    SILENCED_SYSTEM_CHECKS = ["security.W021"]
# Browsers drop Secure cookies on plain-HTTP origins, so a staging host served
# over http://IP:port must opt out explicitly (docs/deployment.md). Never set
# this to false on a public domain: credentials would travel unencrypted.
SECURE_COOKIES = env.bool("DJANGO_SECURE_COOKIES", default=True)
if not SECURE_COOKIES and SECURE_SSL_REDIRECT:
    raise ImproperlyConfigured("DJANGO_SECURE_COOKIES=false requires DJANGO_SECURE_SSL_REDIRECT=false.")
SESSION_COOKIE_SECURE = SECURE_COOKIES
CSRF_COOKIE_SECURE = SECURE_COOKIES
if not SECURE_COOKIES:
    SECURE_HSTS_SECONDS = 0  # HSTS is meaningless without HTTPS
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
USE_X_FORWARDED_HOST = env.bool("DJANGO_USE_X_FORWARDED_HOST", default=True)

# Nginx resolves the real client IP (Cloudflare ranges via real_ip) and sends it
# as a single-entry X-Forwarded-For, so one trusted hop is correct for both
# DRF throttling and audit logging. Django is never reachable except via Nginx.
TRUST_X_FORWARDED_FOR = env.bool("TRUST_X_FORWARDED_FOR", default=True)
REST_FRAMEWORK = {**REST_FRAMEWORK, "NUM_PROXIES": env.int("DJANGO_NUM_PROXIES", default=1)}
