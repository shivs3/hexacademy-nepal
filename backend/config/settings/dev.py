from .base import *  # noqa: F401,F403
from .base import env

DEBUG = env.bool("DJANGO_DEBUG", default=True)
SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-insecure-key-change-me-0123456789abcdefghijklmnop")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1", "backend"])
CSRF_TRUSTED_ORIGINS = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", default=["http://localhost:3000", "http://127.0.0.1:3000"]
)
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000", "http://127.0.0.1:3000"])
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")

PAYMENTS["ENABLE_SANDBOX_PROVIDER"] = env.bool("PAYMENTS_ENABLE_SANDBOX", default=True)  # noqa: F405
PAYMENTS["SANDBOX_SECRET"] = env("PAYMENTS_SANDBOX_SECRET", default="dev-sandbox-secret")  # noqa: F405

# End-to-end suites register and sign in many accounts within a minute. Opt in
# for those runs only; the default keeps the real limits so throttling is visible.
if env.bool("DJANGO_E2E_RELAXED_THROTTLES", default=False):
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],  # noqa: F405
        "login": "300/min",
        "register": "300/min",
    }
