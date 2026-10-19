import pytest
from django.contrib.auth.models import Group, Permission

from apps.accounts import roles

pytestmark = pytest.mark.django_db

STAFF_ENDPOINTS = [
    ("get", "/api/v1/admin/cms/pages/"),
    ("post", "/api/v1/admin/cms/pages/"),
    ("get", "/api/v1/admin/cms/section-types/"),
    ("get", "/api/v1/admin/cms/site-settings/"),
    ("patch", "/api/v1/admin/cms/site-settings/"),
    ("get", "/api/v1/admin/cms/menus/"),
    ("put", "/api/v1/admin/cms/menus/header/"),
    ("get", "/api/v1/admin/cms/blog/posts/"),
    ("get", "/api/v1/admin/cms/blog/categories/"),
    ("get", "/api/v1/admin/cms/newsletter/"),
    ("get", "/api/v1/admin/cms/overview/"),
]


@pytest.mark.parametrize("role", [roles.STUDENT, roles.FINANCE_MANAGER, roles.SUPPORT_STAFF, roles.INSTRUCTOR])
def test_non_editors_cannot_reach_cms_admin(client_for, role):
    client = client_for(role)
    for method, url in STAFF_ENDPOINTS:
        assert getattr(client, method)(url, {}, format="json").status_code == 403, (role, url)


def test_anonymous_gets_403_on_admin(api_client):
    assert api_client.get("/api/v1/admin/cms/pages/").status_code == 403


def test_editor_role_has_cms_permissions(client_for):
    client = client_for(roles.CONTENT_EDITOR)
    for method, url in STAFF_ENDPOINTS:
        if method == "get":
            assert client.get(url).status_code == 200, url


def test_publish_requires_publish_permission(make_user, make_page):
    from rest_framework.test import APIClient

    page = make_page("about")
    group = Group.objects.create(name="Writers")
    group.permissions.add(
        Permission.objects.get(codename="access_admin_panel"), Permission.objects.get(codename="manage_pages")
    )
    writer = make_user()
    writer.groups.add(group)
    client = APIClient()
    client.force_authenticate(writer)
    assert client.patch(f"/api/v1/admin/cms/pages/{page['id']}/", {"title": "New"}, format="json").status_code == 200
    assert client.post(f"/api/v1/admin/cms/pages/{page['id']}/publish/", {}, format="json").status_code == 403


def test_menu_editor_can_list_pages_but_not_edit(make_user, make_page):
    from rest_framework.test import APIClient

    page = make_page("about")
    group = Group.objects.create(name="Navigators")
    group.permissions.add(Permission.objects.get(codename="manage_menus"))
    user = make_user()
    user.groups.add(group)
    client = APIClient()
    client.force_authenticate(user)
    assert client.get("/api/v1/admin/cms/pages/").status_code == 200
    assert client.patch(f"/api/v1/admin/cms/pages/{page['id']}/", {"title": "X"}, format="json").status_code == 403


def test_preview_is_staff_only(client_for, make_page):
    page = make_page("about")
    assert client_for(roles.STUDENT).get(f"/api/v1/admin/cms/pages/{page['id']}/preview/").status_code == 403


def test_blog_writer_cannot_edit_live_post(make_user):
    from django.utils import timezone
    from rest_framework.test import APIClient

    from apps.cms.models import BlogPost

    draft = BlogPost.objects.create(title="Draft", slug="draft", body="<p>x</p>")
    live = BlogPost.objects.create(
        title="Live", slug="live", body="<p>x</p>", status=BlogPost.Status.PUBLISHED, published_at=timezone.now()
    )
    group = Group.objects.create(name="Blog writers")
    group.permissions.add(
        Permission.objects.get(codename="access_admin_panel"), Permission.objects.get(codename="manage_blog")
    )
    writer = make_user()
    writer.groups.add(group)
    client = APIClient()
    client.force_authenticate(writer)
    assert client.patch(f"/api/v1/admin/cms/blog/posts/{draft.pk}/", {"title": "New"}, format="json").status_code == 200
    assert client.patch(f"/api/v1/admin/cms/blog/posts/{live.pk}/", {"title": "New"}, format="json").status_code == 403
    assert client.post(f"/api/v1/admin/cms/blog/posts/{draft.pk}/publish/", {}, format="json").status_code == 403
    live.refresh_from_db()
    assert live.title == "Live"
