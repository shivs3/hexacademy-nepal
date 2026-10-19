from .base import *  # noqa: F401,F403
from .base import MIDDLEWARE, env

DEBUG = False
MIDDLEWARE = [m for m in MIDDLEWARE if m != "whitenoise.middleware.WhiteNoiseMiddleware"]
SECRET_KEY = "test-secret-key-not-for-production-0123456789abcdefghij"
ALLOWED_HOSTS = ["testserver", "localhost"]
DATABASES = {"default": env.db("TEST_DATABASE_URL", default="postgres:///hexacademy_test")}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # speed only; never in prod
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CELERY_TASK_ALWAYS_EAGER = True
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "private": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
PAYMENTS["ENABLE_SANDBOX_PROVIDER"] = True  # noqa: F405
PAYMENTS["SANDBOX_SECRET"] = "test-sandbox-secret"  # noqa: F405
# Throttles are exercised explicitly in dedicated tests.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
    **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],  # noqa: F405
    "anon": "10000/min",
    "user": "10000/min",
    "login": "1000/min",
    "register": "1000/min",
    "password_reset": "1000/min",
    "email_verify": "1000/min",
    "exam_answer": "10000/min",
    "newsletter": "1000/min",
}
LOGGING["root"]["level"] = "WARNING"  # noqa: F405
