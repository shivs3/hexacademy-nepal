"""Operational plumbing: health probes, request ids, structured logs, client IPs."""

import json
import logging
import sys
from unittest import mock

import pytest
from django.test import override_settings
from rest_framework.settings import api_settings
from rest_framework.test import APIRequestFactory
from rest_framework.throttling import AnonRateThrottle

from common.logging import JsonFormatter
from common.middleware import RequestIdLogFilter

pytestmark = pytest.mark.django_db


def test_liveness_and_readiness(client):
    assert client.get("/healthz/").json() == {"status": "ok"}
    assert client.get("/readyz/").json() == {"status": "ok", "database": "ok", "cache": "ok"}


def test_readiness_fails_when_the_cache_is_down(client):
    with mock.patch("common.health.cache.set", side_effect=ConnectionError("redis down")):
        res = client.get("/readyz/")
    assert res.status_code == 503
    assert res.json() == {"status": "unavailable", "database": "ok", "cache": "error"}


def test_request_id_is_echoed_when_well_formed_and_replaced_otherwise(client):
    assert client.get("/healthz/", HTTP_X_REQUEST_ID="abcdef12-3456").headers["X-Request-ID"] == "abcdef12-3456"
    generated = client.get("/healthz/", HTTP_X_REQUEST_ID="bad id\r\nx").headers["X-Request-ID"]
    assert len(generated) == 32 and generated.isalnum()


def test_json_formatter_emits_one_parseable_line_with_extras():
    record = logging.makeLogRecord(
        {"name": "apps.commerce", "levelname": "WARNING", "msg": "Payment %s mismatched", "args": ("P-1",)}
    )
    record.order_id = 42
    RequestIdLogFilter().filter(record)
    try:
        raise ValueError("boom")
    except ValueError:
        record.exc_info = sys.exc_info()
    line = JsonFormatter().format(record)
    assert "\n" not in line.split('"exception"')[0]
    entry = json.loads(line)
    assert entry["message"] == "Payment P-1 mismatched"
    assert entry["level"] == "WARNING" and entry["logger"] == "apps.commerce"
    assert entry["request_id"] == "-" and entry["order_id"] == 42
    assert "ValueError: boom" in entry["exception"]
    assert "args" not in entry and "msg" not in entry


@override_settings(REST_FRAMEWORK={**api_settings.user_settings, "NUM_PROXIES": 1})
def test_throttle_identity_uses_the_address_nginx_forwards():
    # Server renders all come from the Next server; with the production
    # NUM_PROXIES=1 each visitor still gets their own anonymous bucket.
    factory, throttle = APIRequestFactory(), AnonRateThrottle()
    a = factory.get("/", HTTP_X_FORWARDED_FOR="203.0.113.7", REMOTE_ADDR="10.0.0.5")
    b = factory.get("/", HTTP_X_FORWARDED_FOR="198.51.100.9", REMOTE_ADDR="10.0.0.5")
    assert throttle.get_ident(a) == "203.0.113.7"
    assert throttle.get_ident(b) == "198.51.100.9"
    # A visitor-supplied hop in front of Nginx's entry is ignored.
    spoofed = factory.get("/", HTTP_X_FORWARDED_FOR="6.6.6.6, 203.0.113.7", REMOTE_ADDR="10.0.0.5")
    assert throttle.get_ident(spoofed) == "203.0.113.7"
