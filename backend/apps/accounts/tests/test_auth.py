import re

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts import services
from apps.accounts.models import User
from apps.audit.models import AuditLog
from conftest import DEFAULT_PASSWORD

pytestmark = pytest.mark.django_db


def test_register_creates_student_logs_in_and_sends_verification(api_client, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        res = api_client.post(
            "/api/v1/auth/register/",
            {"email": "New@Example.com", "full_name": "Sita Sharma", "password": "A-strong-pass-99"},
            format="json",
        )
    assert res.status_code == 201, res.content
    assert res.data["email"] == "new@example.com"
    assert res.data["roles"] == ["student"]
    assert res.data["email_verified"] is False
    assert len(mail.outbox) == 1 and "verify-email?token=" in mail.outbox[0].body
    # Session cookie was issued: /me works with the same client.
    assert api_client.get("/api/v1/users/me/").status_code == 200


def test_register_rejects_duplicate_email_case_insensitively(api_client, make_user):
    make_user(email="taken@example.com")
    res = api_client.post(
        "/api/v1/auth/register/",
        {"email": "TAKEN@example.com", "full_name": "X Y", "password": "A-strong-pass-99"},
        format="json",
    )
    assert res.status_code == 400
    assert res.data["error"]["code"] == "email_taken"


def test_register_rejects_weak_password(api_client):
    res = api_client.post(
        "/api/v1/auth/register/", {"email": "a@example.com", "full_name": "Ab", "password": "12345678"}, format="json"
    )
    assert res.status_code == 400
    assert res.data["error"]["code"] == "validation_error"


def test_login_and_logout(api_client, make_user):
    make_user(email="ram@example.com")
    res = api_client.post(
        "/api/v1/auth/login/", {"email": "RAM@example.com", "password": DEFAULT_PASSWORD}, format="json"
    )
    assert res.status_code == 200
    assert api_client.get("/api/v1/users/me/").data["email"] == "ram@example.com"
    assert api_client.post("/api/v1/auth/logout/").status_code == 204
    assert api_client.get("/api/v1/users/me/").status_code == 403


def test_login_wrong_password_is_generic_and_audited(api_client, make_user):
    make_user(email="ram@example.com")
    res = api_client.post("/api/v1/auth/login/", {"email": "ram@example.com", "password": "nope"}, format="json")
    assert res.status_code == 400
    assert res.data["error"]["code"] == "invalid_credentials"
    entry = AuditLog.objects.get(action="auth.login_failed")
    assert "password" not in entry.metadata


def test_inactive_user_cannot_login(api_client, make_user):
    make_user(email="off@example.com", is_active=False)
    res = api_client.post(
        "/api/v1/auth/login/", {"email": "off@example.com", "password": DEFAULT_PASSWORD}, format="json"
    )
    assert res.status_code == 400


def test_login_requires_csrf_token():
    client = APIClient(enforce_csrf_checks=True)
    res = client.post("/api/v1/auth/login/", {"email": "a@example.com", "password": "x"}, format="json")
    assert res.status_code == 403
    token = client.get("/api/v1/auth/csrf/").data["csrf_token"]
    res = client.post(
        "/api/v1/auth/login/", {"email": "a@example.com", "password": "x"}, format="json", HTTP_X_CSRFTOKEN=token
    )
    assert res.status_code == 400  # passes CSRF, fails credentials


def test_login_is_rate_limited_per_email(api_client, make_user, settings):
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "login": "3/min"},
    }
    from rest_framework.throttling import SimpleRateThrottle

    original = SimpleRateThrottle.THROTTLE_RATES
    SimpleRateThrottle.THROTTLE_RATES = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
    try:
        for _ in range(3):
            api_client.post("/api/v1/auth/login/", {"email": "v@example.com", "password": "bad"}, format="json")
        res = api_client.post("/api/v1/auth/login/", {"email": "v@example.com", "password": "bad"}, format="json")
        assert res.status_code == 429
        assert res.data["error"]["code"] == "throttled"
    finally:
        SimpleRateThrottle.THROTTLE_RATES = original


def test_email_verification_flow(api_client, make_user):
    user = make_user(verified=False)
    token = services.make_verification_token(user)
    res = api_client.post("/api/v1/auth/verify-email/", {"token": token}, format="json")
    assert res.status_code == 200
    user.refresh_from_db()
    assert user.email_verified


def test_email_verification_rejects_tampered_token(api_client, make_user):
    user = make_user(verified=False)
    token = services.make_verification_token(user) + "x"
    res = api_client.post("/api/v1/auth/verify-email/", {"token": token}, format="json")
    assert res.status_code == 400
    assert res.data["error"]["code"] == "token_invalid"


def test_password_reset_flow_does_not_enumerate(api_client, make_user):
    make_user(email="reset@example.com")
    res_unknown = api_client.post("/api/v1/auth/password-reset/", {"email": "ghost@example.com"}, format="json")
    res_known = api_client.post("/api/v1/auth/password-reset/", {"email": "reset@example.com"}, format="json")
    assert res_unknown.status_code == res_known.status_code == 202
    assert res_unknown.data == res_known.data
    assert len(mail.outbox) == 1

    match = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[0].body)
    uid, token = match.groups()
    res = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "Brand-new-pass-77"},
        format="json",
    )
    assert res.status_code == 204
    assert User.objects.get(email="reset@example.com").check_password("Brand-new-pass-77")
    # Token is single-use: password hash changed, so it no longer validates.
    res = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "Another-pass-88"},
        format="json",
    )
    assert res.status_code == 400


def test_profile_update_and_password_change(client_for):
    client = client_for()
    res = client.patch(
        "/api/v1/users/me/", {"full_name": "Hari Bahadur", "profile": {"city": "Pokhara"}}, format="json"
    )
    assert res.status_code == 200
    assert res.data["full_name"] == "Hari Bahadur" and res.data["profile"]["city"] == "Pokhara"
    # Email and roles are read-only through /me
    client.patch("/api/v1/users/me/", {"email": "evil@example.com", "roles": ["finance_manager"]}, format="json")
    client.user.refresh_from_db()
    assert client.user.email != "evil@example.com"
    assert not client.user.has_perm("accounts.access_admin_panel")

    res = client.post(
        "/api/v1/users/me/password/",
        {"current_password": DEFAULT_PASSWORD, "new_password": "Changed-pass-55"},
        format="json",
    )
    assert res.status_code == 204


def test_error_envelope_for_unauthenticated(api_client):
    res = api_client.get("/api/v1/users/me/")
    assert res.status_code == 403
    assert res.data["error"]["code"] == "not_authenticated"
