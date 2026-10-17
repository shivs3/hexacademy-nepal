import pytest
from django.core.management import call_command

from apps.accounts import roles
from apps.accounts.role_sync import sync_roles
from apps.audit.models import AuditLog

pytestmark = pytest.mark.django_db


def test_role_map_references_only_existing_permissions():
    sync_roles(strict=True)


def test_student_cannot_view_user_directory(client_for):
    assert client_for(roles.STUDENT).get("/api/v1/admin/users/").status_code == 403


def test_support_staff_can_list_and_deactivate_but_not_assign_roles(client_for, make_user):
    support = client_for(roles.SUPPORT_STAFF)
    target = make_user()
    assert support.get("/api/v1/admin/users/").status_code == 200

    res = support.post(f"/api/v1/admin/users/{target.pk}/status/", {"is_active": False}, format="json")
    assert res.status_code == 200 and res.data["is_active"] is False
    assert AuditLog.objects.filter(action="account.status_changed", target_id=str(target.pk)).exists()

    res = support.put(f"/api/v1/admin/users/{target.pk}/roles/", {"roles": ["instructor"]}, format="json")
    assert res.status_code == 403


def test_finance_manager_cannot_view_user_directory(client_for):
    assert client_for(roles.FINANCE_MANAGER).get("/api/v1/admin/users/").status_code == 403


def test_super_admin_assigns_roles_but_cannot_grant_super_admin(client_for, make_user):
    admin = client_for(roles.SUPER_ADMIN)
    target = make_user()
    res = admin.put(f"/api/v1/admin/users/{target.pk}/roles/", {"roles": ["instructor", "student"]}, format="json")
    assert res.status_code == 200
    assert sorted(res.data["roles"]) == ["instructor", "student"]

    res = admin.put(f"/api/v1/admin/users/{target.pk}/roles/", {"roles": ["super_admin"]}, format="json")
    assert res.status_code == 400
    target.refresh_from_db()
    assert not target.is_superuser


def test_support_staff_cannot_deactivate_super_admin(client_for, make_user):
    support = client_for(roles.SUPPORT_STAFF)
    boss = make_user(roles.SUPER_ADMIN)
    res = support.post(f"/api/v1/admin/users/{boss.pk}/status/", {"is_active": False}, format="json")
    assert res.status_code == 403


def test_deactivated_user_session_stops_working(api_client, make_user, client_for):
    from conftest import DEFAULT_PASSWORD

    user = make_user(email="soon-off@example.com")
    api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_PASSWORD}, format="json")
    assert api_client.get("/api/v1/users/me/").status_code == 200
    client_for(roles.SUPPORT_STAFF).post(f"/api/v1/admin/users/{user.pk}/status/", {"is_active": False}, format="json")
    assert api_client.get("/api/v1/users/me/").status_code == 403


def test_grant_role_command_is_audited(make_user):
    user = make_user()
    call_command("grant_role", user.email, role="super_admin")
    user.refresh_from_db()
    assert user.is_superuser
    assert AuditLog.objects.filter(action="account.role_granted_cli", target_id=str(user.pk)).exists()


def test_audit_log_is_immutable(make_user):
    entry = AuditLog.objects.create(action="test")
    with pytest.raises(RuntimeError):
        entry.save()
    with pytest.raises(RuntimeError):
        entry.delete()
