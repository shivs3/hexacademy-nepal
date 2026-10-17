"""Gunicorn settings. Values can be overridden with GUNICORN_* environment variables."""

import multiprocessing
import os

bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:8000")  # noqa: S104 - container-internal; only Nginx can reach it
workers = int(os.environ.get("GUNICORN_WORKERS", min(multiprocessing.cpu_count() * 2 + 1, 9)))
threads = int(os.environ.get("GUNICORN_THREADS", 2))
worker_class = "gthread"
timeout = int(os.environ.get("GUNICORN_TIMEOUT", 60))
graceful_timeout = 30
keepalive = 5
max_requests = 1000
max_requests_jitter = 100
accesslog = "-"
errorlog = "-"
# Query strings can carry one-time tokens (password reset, email verification); log the path only.
access_log_format = '%(h)s "%(m)s %(U)s %(H)s" %(s)s %(b)s %(M)sms "%({x-request-id}o)s"'
forwarded_allow_ips = os.environ.get("GUNICORN_FORWARDED_ALLOW_IPS", "*")
