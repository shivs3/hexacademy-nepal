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


@pytest.fixture
def make_course(db):
    """A course with one module and `lessons` published lessons (ORM only, no API)."""
    from django.utils import timezone

    from apps.catalog.models import Course, CourseInstructor, CourseModule, Lesson

    def _make(*, slug=None, status="published", price=0, lessons=2, instructor=None, ta=None, **extra):
        n = next(_seq)
        course = Course.objects.create(
            title=extra.pop("title", f"Course {n}"),
            slug=slug or f"course-{n}",
            subtitle=extra.pop("subtitle", "Demo course"),
            status=status,
            published_at=timezone.now() if status != "draft" else None,
            price=price,
            **extra,
        )
        module = CourseModule.objects.create(course=course, title="Module 1", position=0)
        for i in range(lessons):
            Lesson.objects.create(
                course=course, module=module, title=f"Lesson {i + 1}", body="<p>Body</p>", position=i, is_published=True
            )
        if instructor:
            CourseInstructor.objects.create(course=course, user=instructor, role="instructor")
        if ta:
            CourseInstructor.objects.create(course=course, user=ta, role="teaching_assistant")
        return course

    return _make


@pytest.fixture
def assert_constant_queries():
    """Fails when a GET's query count grows with the number of rows (N+1).

    `build(n)` adds n rows; the endpoint is measured after 2 and after 8.
    """
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    def count(client, url) -> int:
        with CaptureQueriesContext(connection) as ctx:
            res = client.get(url)
        assert res.status_code == 200, res.content
        return len(ctx.captured_queries)

    def _assert(build, client, url, small=2, large=8):
        build(small)
        client.get(url)  # warm per-process caches (content types, permissions)
        first = count(client, url)
        build(large - small)
        second = count(client, url)
        assert second == first, f"{url}: {first} queries for {small} rows, {second} for {large}"

    return _assert
