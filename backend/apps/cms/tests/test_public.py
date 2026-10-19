from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import roles
from apps.cms.models import BlogCategory, BlogPost, NewsletterSubscriber, SiteSettings

pytestmark = pytest.mark.django_db


@pytest.fixture
def anon():
    return APIClient()


def test_site_settings_public_view_and_announcement_window(anon, editor):
    res = editor.patch(
        "/api/v1/admin/cms/site-settings/",
        {
            "tagline": "Learn by doing",
            "announcement_enabled": True,
            "announcement_text": "Admissions open",
            "announcement_starts_at": (timezone.now() + timedelta(days=1)).isoformat(),
        },
        format="json",
    )
    assert res.status_code == 200, res.json()
    body = anon.get("/api/v1/site-settings/").json()
    assert body["tagline"] == "Learn by doing"
    assert body["announcement"] is None  # not started yet
    assert "updated_by" not in body

    editor.patch("/api/v1/admin/cms/site-settings/", {"announcement_starts_at": None}, format="json")
    assert anon.get("/api/v1/site-settings/").json()["announcement"]["text"] == "Admissions open"


def test_site_settings_validation(editor):
    res = editor.patch(
        "/api/v1/admin/cms/site-settings/",
        {
            "color_primary": "#14B8A6",
            "announcement_link_url": "javascript:alert(1)",
            "social_links": [{"platform": "facebook", "url": "http://insecure.example"}],
        },
        format="json",
    )
    assert res.status_code == 400
    details = res.json()["error"]["details"]
    assert {"color_primary", "announcement_link_url", "social_links"} <= set(details)
    assert SiteSettings.load().color_primary == "#102A43"


def test_menus_hide_unpublished_pages_and_hidden_items(anon, editor, make_page):
    live = make_page("about", publish=True)
    draft = make_page("secret")
    res = editor.put(
        "/api/v1/admin/cms/menus/header/",
        {
            "items": [
                {"label": "About", "page": live["id"]},
                {"label": "Secret", "page": draft["id"]},
                {"label": "Hidden", "url": "/x", "is_visible": False},
                {"label": "Learn", "children": [{"label": "Blog", "url": "/blog"}]},
            ]
        },
        format="json",
    )
    assert res.status_code == 200, res.json()
    items = anon.get("/api/v1/menus/header/").json()["items"]
    assert [i["label"] for i in items] == ["About", "Learn"]
    assert items[0]["url"] == "/about"
    assert items[1]["children"] == [{"label": "Blog", "url": "/blog", "open_in_new_tab": False, "children": []}]
    assert anon.get("/api/v1/menus/unknown/").status_code == 404


def test_menu_validation(editor):
    bad = {"items": [{"label": "X", "url": "javascript:alert(1)"}, {"label": "Empty"}]}
    res = editor.put("/api/v1/admin/cms/menus/footer/", bad, format="json")
    assert res.status_code == 400
    deep = {"items": [{"label": "A", "children": [{"label": "B", "children": [{"label": "C", "url": "/c"}]}]}]}
    assert editor.put("/api/v1/admin/cms/menus/footer/", deep, format="json").status_code == 400

    child_error = {
        "items": [{"label": "A", "children": [{"label": "B", "url": "/b"}, {"label": "C", "url": "ftp://x"}]}]
    }
    details = editor.put("/api/v1/admin/cms/menus/footer/", child_error, format="json").json()["error"]["details"]
    # Child errors stay under "children" so the editor can point at the right link.
    assert "url" in details["items"]["0"]["children"]["1"]


def _post(slug, status="published", published_at=None, **extra):
    return BlogPost.objects.create(
        title=slug.title(),
        slug=slug,
        body="<p>Some words here</p>",
        status=status,
        published_at=published_at if published_at is not None else timezone.now() - timedelta(hours=1),
        **extra,
    )


def test_blog_only_lists_published_and_due_posts(anon):
    cat = BlogCategory.objects.create(name="AI", slug="ai")
    live = _post("live")
    live.categories.add(cat)
    _post("future", published_at=timezone.now() + timedelta(days=1))
    _post("draft", status="draft")
    _post("archived", status="archived")

    listing = anon.get("/api/v1/blog/posts/").json()
    assert [p["slug"] for p in listing["results"]] == ["live"]
    assert "body" not in listing["results"][0]
    assert anon.get("/api/v1/blog/posts/live/").json()["body"] == "<p>Some words here</p>"
    for slug in ("future", "draft", "archived"):
        assert anon.get(f"/api/v1/blog/posts/{slug}/").status_code == 404
    assert anon.get("/api/v1/blog/posts/", {"category": "ai"}).json()["count"] == 1
    assert anon.get("/api/v1/blog/categories/").json() == [
        {"name": "AI", "slug": "ai", "description": "", "post_count": 1}
    ]


def test_blog_author_payload_has_no_email(anon, make_user):
    author = make_user("content_editor")
    _post("by-author", author=author)
    body = anon.get("/api/v1/blog/posts/by-author/").json()
    assert body["author"]["name"] == author.full_name
    assert "email" not in body["author"]


def test_blog_admin_workflow(editor):
    res = editor.post(
        "/api/v1/admin/cms/blog/posts/",
        {"title": "Hello", "slug": "hello", "body": "<p>Hi<script>x</script></p>", "status": "published"},
        format="json",
    )
    assert res.status_code == 201, res.json()
    post = res.json()
    assert post["status"] == "draft"  # status is only changed through publish actions
    assert post["body"] == "<p>Hi</p>"

    future = (timezone.now() + timedelta(days=2)).isoformat()
    res = editor.post(f"/api/v1/admin/cms/blog/posts/{post['id']}/publish/", {"publish_at": future}, format="json")
    assert res.json()["is_scheduled"] is True
    assert APIClient().get("/api/v1/blog/posts/hello/").status_code == 404

    assert editor.delete(f"/api/v1/admin/cms/blog/posts/{post['id']}/").status_code == 400
    editor.post(f"/api/v1/admin/cms/blog/posts/{post['id']}/unpublish/")
    assert editor.delete(f"/api/v1/admin/cms/blog/posts/{post['id']}/").status_code == 204


def test_blog_preview_is_staff_only(editor, client_for):
    post = BlogPost.objects.create(title="Secret", slug="secret-draft", body="<p>Some words here</p>")
    url = f"/api/v1/admin/cms/blog/posts/{post.pk}/preview/"
    body = editor.get(url).json()
    assert body["slug"] == "secret-draft" and body["body"] == "<p>Some words here</p>"
    assert body["published_at"] is None
    assert APIClient().get(url).status_code in (401, 403)
    assert client_for(roles.STUDENT).get(url).status_code == 403


def test_republishing_does_not_revive_an_old_schedule(editor):
    post = BlogPost.objects.create(title="P", slug="p", body="<p>x</p>")
    url = f"/api/v1/admin/cms/blog/posts/{post.pk}"
    future = (timezone.now() + timedelta(days=3)).isoformat()
    assert editor.post(f"{url}/publish/", {"publish_at": future}, format="json").json()["is_scheduled"] is True
    editor.post(f"{url}/unpublish/")
    res = editor.post(f"{url}/publish/", {}, format="json").json()
    assert res["is_scheduled"] is False
    assert APIClient().get("/api/v1/blog/posts/p/").status_code == 200

    # Republishing an already-published post keeps its original date.
    first = res["published_at"]
    editor.post(f"{url}/unpublish/")
    assert editor.post(f"{url}/publish/", {}, format="json").json()["published_at"] == first


def test_blog_author_must_be_staff(editor, make_user):
    student = make_user("student")
    res = editor.post("/api/v1/admin/cms/blog/posts/", {"title": "T", "slug": "t", "author": student.pk}, format="json")
    assert res.status_code == 400
    assert "author" in res.json()["error"]["details"]


def test_sitemap_lists_only_indexable_published_content(anon, make_page):
    make_page("about", publish=True)
    make_page("draft")
    make_page("hidden", publish=True, noindex=True)
    _post("live")
    _post("draft-post", status="draft")
    body = anon.get("/api/v1/seo/sitemap/").json()
    assert [p["path"] for p in body["pages"]] == ["/about"]
    assert [p["path"] for p in body["posts"]] == ["/blog/live"]


def test_newsletter_subscribe_is_idempotent_and_requires_consent(anon):
    url = "/api/v1/newsletter/subscribe/"
    assert anon.post(url, {"email": "a@example.com", "consent": False}, format="json").status_code == 400
    for email in ("a@example.com", "A@Example.com"):
        res = anon.post(url, {"email": email, "consent": True, "source": "https://evil"}, format="json")
        assert res.status_code == 202
    assert NewsletterSubscriber.objects.count() == 1
    assert NewsletterSubscriber.objects.get().source == ""


def test_newsletter_export_is_permissioned_and_formula_safe(client_for, editor):
    NewsletterSubscriber.objects.create(email="x@example.com", source="=HYPERLINK()")
    assert client_for("support_staff").get("/api/v1/admin/cms/newsletter/").status_code == 403
    res = editor.get("/api/v1/admin/cms/newsletter/export/")
    assert res.status_code == 200
    assert res["Content-Type"].startswith("text/csv")
    assert "'=HYPERLINK()" in res.content.decode()


def test_newsletter_requires_csrf_for_anonymous_browsers():
    client = APIClient(enforce_csrf_checks=True)
    res = client.post("/api/v1/newsletter/subscribe/", {"email": "b@example.com", "consent": True}, format="json")
    assert res.status_code == 403


@pytest.mark.parametrize("slug", ["Upper", "under_score", "double--hyphen", "-edge"])
def test_slugs_must_be_lowercase_hyphenated(editor, slug):
    for url, body in (
        ("/api/v1/admin/cms/blog/posts/", {"title": "T", "slug": slug}),
        ("/api/v1/admin/cms/blog/categories/", {"name": "C", "slug": slug}),
        ("/api/v1/admin/cms/pages/", {"title": "P", "slug": slug, "sections": []}),
    ):
        res = editor.post(url, body, format="json")
        assert res.status_code == 400, (url, slug)
        assert "slug" in res.json()["error"]["details"]
