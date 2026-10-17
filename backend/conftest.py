import itertools

import pytest
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.accounts.models import User, UserProfile

_seq = itertools.count(1)
DEFAULT_PASSWORD = "Correct-Horse-42"


@pytest.fixture(autouse=True)
def _clear_cache():
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def make_user(db):
    def _make(*role_slugs, email=None, password=DEFAULT_PASSWORD, verified=True, **extra):
        from django.utils import timezone

        n = next(_seq)
        user = User.objects.create_user(
            email=email or f"user{n}@example.com",
            password=password,
            full_name=extra.pop("full_name", f"Test User {n}"),
            email_verified_at=timezone.now() if verified else None,
            **extra,
        )
        UserProfile.objects.create(user=user)
        for slug in role_slugs or (roles.STUDENT,):
            if slug == roles.SUPER_ADMIN:
                user.is_superuser = True
                user.is_staff = True
                user.save()
            else:
                user.groups.add(Group.objects.get(name=roles.group_name(slug)))
        return User.objects.get(pk=user.pk)  # fresh instance: no stale permission cache

    return _make


@pytest.fixture
def client_for(make_user):
    """Returns an authenticated APIClient for a new user with the given roles."""

    def _client(*role_slugs, **kwargs):
        user = make_user(*role_slugs, **kwargs)
        client = APIClient()
        client.force_authenticate(user=user)
        client.user = user
        return client

    return _client
