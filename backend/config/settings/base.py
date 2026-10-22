"""Base settings shared by every environment.

Environment-specific overrides live in dev.py, test.py and prod.py.
All secrets and deployment-specific values come from environment variables.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = [
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
]
LOCAL_APPS = [
    "apps.accounts",
    "apps.audit",
    "apps.cms",
    "apps.catalog",
    "apps.learning",
    "apps.assessments",
    "apps.commerce",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "common.middleware.RequestIdMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres:///hexacademy_dev"),
}
DATABASES["default"]["ATOMIC_REQUESTS"] = False
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("ne", "Nepali")]
TIME_ZONE = "Asia/Kathmandu"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = env("MEDIA_URL", default="/media/")
MEDIA_ROOT = BASE_DIR / "media"
PRIVATE_MEDIA_ROOT = BASE_DIR / "private_media"

# Object storage. When USE_S3_STORAGE is true, public and private media go to
# S3-compatible buckets (Cloudflare R2 in production). Otherwise the local
# filesystem is used, which is only appropriate for development and tests.
USE_S3_STORAGE = env.bool("USE_S3_STORAGE", default=False)
if USE_S3_STORAGE:
    _s3_common = {
        "access_key": env("S3_ACCESS_KEY_ID"),
        "secret_key": env("S3_SECRET_ACCESS_KEY"),
        "endpoint_url": env("S3_ENDPOINT_URL"),
        "region_name": env("S3_REGION", default="auto"),
        "signature_version": "s3v4",
        "file_overwrite": False,
    }
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                **_s3_common,
                "bucket_name": env("S3_PUBLIC_BUCKET"),
                "custom_domain": env("S3_PUBLIC_CUSTOM_DOMAIN", default=None),
                "querystring_auth": False,
                "default_acl": None,
            },
        },
        "private": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                **_s3_common,
                "bucket_name": env("S3_PRIVATE_BUCKET"),
                "querystring_auth": True,
                "querystring_expire": env.int("PRIVATE_URL_TTL_SECONDS", default=300),
                "default_acl": None,
            },
        },
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "private": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
            "OPTIONS": {"location": str(PRIVATE_MEDIA_ROOT), "base_url": "/private-not-served/"},
        },
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }

MAX_UPLOAD_SIZE_MB = env.int("MAX_UPLOAD_SIZE_MB", default=50)
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# --- Cache (throttling, rate limits). Redis when configured.
REDIS_URL = env("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}}
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# --- Sessions and CSRF: browser auth uses HttpOnly session cookies.
SESSION_COOKIE_NAME = "hx_session"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
CSRF_COOKIE_NAME = "hx_csrftoken"
CSRF_COOKIE_HTTPONLY = False  # The SPA must read it to send X-CSRFToken.
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
CORS_ALLOW_CREDENTIALS = True

TRUST_X_FORWARDED_FOR = env.bool("TRUST_X_FORWARDED_FOR", default=False)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
        "rest_framework.parsers.FormParser",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "user": "600/min",
        "login": "10/min",
        "register": "5/min",
        "password_reset": "5/hour",
        "email_verify": "10/hour",
        "exam_answer": "240/min",
        "newsletter": "10/hour",
        "payment": "30/min",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Hexacademy Nepal API",
    "DESCRIPTION": "CMS, LMS, examination and commerce API for Hexacademy Nepal.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "ENUM_NAME_OVERRIDES": {
        "ContentStatusEnum": "apps.cms.models.Page.Status",
        "EnrollmentStatusEnum": "apps.learning.models.Enrollment.Status",
        "MediaKindEnum": "apps.cms.models.MediaAsset.Kind",
        "ResourceKindEnum": "apps.catalog.models.LessonResource.Kind",
        "LanguageEnum": LANGUAGES,
        "QuestionKindEnum": "apps.assessments.models.Question.Kind",
        "QuestionStatusEnum": "apps.assessments.models.Question.Status",
        "ExamKindEnum": "apps.assessments.models.Exam.Kind",
        "ExamStatusEnum": "apps.assessments.models.Exam.Status",
        "AttemptStatusEnum": "apps.assessments.models.ExamAttempt.Status",
        "OrderStatusEnum": "apps.commerce.models.Order.Status",
        "PaymentStatusEnum": "apps.commerce.models.Payment.Status",
        "PaymentProviderEnum": "apps.commerce.models.Payment.Provider",
        "CouponKindEnum": "apps.commerce.models.Coupon.Kind",
    },
}

# --- Email
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Hexacademy Nepal <no-reply@hexacademynepal.com>")

# Public URL of the Next.js frontend, used in emails (verification, reset links).
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000").rstrip("/")

# Token lifetimes
EMAIL_VERIFICATION_TIMEOUT = timedelta(days=3)
PASSWORD_RESET_TIMEOUT = 60 * 60 * 2

# --- Celery
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=REDIS_URL or "memory://")
CELERY_RESULT_BACKEND = None
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=not bool(REDIS_URL))
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TIMEZONE = TIME_ZONE
# Periodic jobs are registered by each app as it lands (see the app's tasks.py
# and the matching entry here). Unknown task names would only produce errors.
CELERY_BEAT_SCHEDULE: dict[str, dict] = {
    "cms-publish-scheduled-pages": {"task": "apps.cms.tasks.publish_scheduled_pages", "schedule": 60.0},
    "assessments-expire-attempts": {"task": "apps.assessments.tasks.expire_overdue_attempts", "schedule": 60.0},
    "commerce-reconcile-payments": {"task": "apps.commerce.tasks.reconcile_pending_payments", "schedule": 300.0},
    "commerce-expire-orders": {"task": "apps.commerce.tasks.expire_stale_orders", "schedule": 300.0},
}

# --- Payments. Credentials are only read from the environment.
PAYMENTS = {
    "DEFAULT_CURRENCY": "NPR",
    "KHALTI": {
        "SECRET_KEY": env("KHALTI_SECRET_KEY", default=""),
        "BASE_URL": env("KHALTI_BASE_URL", default="https://dev.khalti.com/api/v2/"),
    },
    "ESEWA": {
        "PRODUCT_CODE": env("ESEWA_PRODUCT_CODE", default=""),
        "SECRET_KEY": env("ESEWA_SECRET_KEY", default=""),
        "FORM_URL": env("ESEWA_FORM_URL", default="https://rc-epay.esewa.com.np/api/epay/main/v2/form"),
        "STATUS_URL": env("ESEWA_STATUS_URL", default="https://rc.esewa.com.np/api/epay/transaction/status/"),
    },
    # The sandbox provider simulates a gateway locally; it is refused in production.
    "ENABLE_SANDBOX_PROVIDER": env.bool("PAYMENTS_ENABLE_SANDBOX", default=False),
    "SANDBOX_SECRET": env("PAYMENTS_SANDBOX_SECRET", default=""),
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "common.middleware.RequestIdLogFilter"}},
    "formatters": {
        "standard": {"format": "%(asctime)s %(levelname)s [%(name)s] [req:%(request_id)s] %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "standard", "filters": ["request_id"]},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING"},
    },
}
