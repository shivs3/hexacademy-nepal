"""Every staff endpoint refuses callers without the right role.

The routes come from the URL resolver, so a new admin endpoint is covered as
soon as it is registered. Object ids point at nothing: the role check must
reject the request before any lookup or validation runs.
"""

import re

import pytest
from django.urls import URLResolver, get_resolver
from rest_framework.test import APIClient

from apps.accounts import roles

pytestmark = pytest.mark.django_db

METHODS = ("get", "post", "put", "patch", "delete")


def _walk(patterns, prefix=""):
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from _walk(p.url_patterns, prefix + str(p.pattern))
        else:
            yield prefix + str(p.pattern)


def _concrete(route):
    path = route.replace("^", "").replace("$", "")
    path = re.sub(r"\(\?P<[^>]+>[^)]+\)", "1", path)  # router regex groups
    path = re.sub(r"<str:location>", "header", path)
    path = re.sub(r"<(?:\w+:)?\w+>", "1", path)  # path converters
    return "/" + path


ADMIN_PATHS = sorted(
    {_concrete(r) for r in _walk(get_resolver().url_patterns) if r.startswith("api/v1/") and "admin/" in r}
)


def _statuses(client, prefix=""):
    return {
        (method, path): getattr(client, method)(path, {}, format="json").status_code
        for path in ADMIN_PATHS
        if path.startswith(prefix)
        for method in METHODS
    }


def _leaks(statuses, allowed):
    return {k: v for k, v in statuses.items() if v not in allowed}


def test_the_audit_sees_every_admin_module():
    modules = {p.split("/")[4] for p in ADMIN_PATHS}
    assert len(ADMIN_PATHS) > 100
    assert {"users", "cms", "catalog", "learning", "assessments", "commerce", "live-classes", "certificates"} <= modules


def test_anonymous_callers_are_refused_everywhere():
    # 405 means the route has no handler for that method, so nothing ran.
    assert _leaks(_statuses(APIClient()), {401, 403, 405}) == {}


def test_students_are_refused_everywhere(client_for):
    assert _leaks(_statuses(client_for(roles.STUDENT)), {403, 405}) == {}


@pytest.mark.parametrize(
    ("role", "prefix"),
    [
        # Finance never sees questions, answer keys or exam results.
        (roles.FINANCE_MANAGER, "/api/v1/admin/assessments/"),
        # Editors never see orders, payment settings or revenue.
        (roles.CONTENT_EDITOR, "/api/v1/admin/commerce/"),
        # Account administration is for super admins (and support, for status).
        (roles.CONTENT_EDITOR, "/api/v1/admin/users/"),
        (roles.FINANCE_MANAGER, "/api/v1/admin/users/"),
        (roles.EXAM_COORDINATOR, "/api/v1/admin/commerce/"),
        (roles.INSTRUCTOR, "/api/v1/admin/commerce/"),
        (roles.INSTRUCTOR, "/api/v1/admin/cms/"),
        (roles.TEACHING_ASSISTANT, "/api/v1/admin/assessments/"),
        (roles.TEACHING_ASSISTANT, "/api/v1/admin/commerce/"),
        (roles.TEACHING_ASSISTANT, "/api/v1/admin/cms/"),
        (roles.SUPPORT_STAFF, "/api/v1/admin/assessments/"),
        (roles.SUPPORT_STAFF, "/api/v1/admin/cms/"),
        (roles.FINANCE_MANAGER, "/api/v1/admin/cms/"),
        (roles.EXAM_COORDINATOR, "/api/v1/admin/cms/"),
    ],
)
def test_roles_are_kept_out_of_other_domains(client_for, role, prefix):
    statuses = _statuses(client_for(role), prefix)
    assert statuses
    assert _leaks(statuses, {403, 405}) == {}
