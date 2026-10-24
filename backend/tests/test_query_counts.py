"""List endpoints must not issue a query per row (N+1).

Each case builds the same data at two sizes and requires the query count to
stay constant, so a regression fails here rather than as a slow page.
"""

import pytest
from django.utils import timezone

from apps.accounts import roles
from apps.catalog.models import Category
from apps.cms.models import BlogCategory, BlogPost, Page
from apps.learning import services as learning
from apps.notifications.services import notify

pytestmark = pytest.mark.django_db


def test_course_catalog(assert_constant_queries, api_client, make_course, make_user):
    category = Category.objects.create(name="Programming", slug="programming")

    def build(n):
        for _ in range(n):
            make_course(category=category, instructor=make_user(roles.INSTRUCTOR), lessons=3)

    assert_constant_queries(build, api_client, "/api/v1/courses/")


def test_course_detail_outline(assert_constant_queries, api_client, make_course, make_user):
    from apps.catalog.models import CourseModule, Lesson

    course = make_course(slug="deep", instructor=make_user(roles.INSTRUCTOR))

    def build(n):
        for i in range(n):
            module = CourseModule.objects.create(course=course, title=f"M{i}", position=10 + i)
            Lesson.objects.create(course=course, module=module, title="L", position=0, is_published=True)
            Lesson.objects.create(course=course, module=module, title="L2", position=1, is_published=True)

    assert_constant_queries(build, api_client, "/api/v1/courses/deep/")


def test_course_categories(assert_constant_queries, api_client, make_course):
    parent = Category.objects.create(name="Engineering", slug="engineering")

    def build(n):
        for _ in range(n):
            k = Category.objects.count()
            child = Category.objects.create(name=f"Child {k}", slug=f"child-{k}", parent=parent)
            make_course(category=child)

    assert_constant_queries(build, api_client, "/api/v1/course-categories/")


def test_blog_posts(assert_constant_queries, api_client, make_user):
    category = BlogCategory.objects.create(name="News", slug="news")

    def build(n):
        for _ in range(n):
            post = BlogPost.objects.create(
                title="Post",
                slug=f"post-{BlogPost.objects.count()}",
                author=make_user(roles.CONTENT_EDITOR),
                status=BlogPost.Status.PUBLISHED,
                published_at=timezone.now(),
            )
            post.categories.add(category)

    assert_constant_queries(build, api_client, "/api/v1/blog/posts/")


def test_my_enrollments(assert_constant_queries, client_for, make_course, make_user):
    me = client_for()

    def build(n):
        for _ in range(n):
            learning.enroll_free(me.user, make_course(instructor=make_user(roles.INSTRUCTOR), lessons=3))

    assert_constant_queries(build, me, "/api/v1/me/enrollments/")


def test_admin_course_list(assert_constant_queries, client_for, make_course, make_user):
    admin = client_for(roles.CONTENT_EDITOR)

    def build(n):
        for _ in range(n):
            make_course(instructor=make_user(roles.INSTRUCTOR))

    assert_constant_queries(build, admin, "/api/v1/admin/catalog/courses/")


def test_staff_enrollments_pages_and_posts(assert_constant_queries, client_for, make_course, make_user):
    staff, editor = client_for(roles.SUPER_ADMIN), client_for(roles.CONTENT_EDITOR)

    def enrollments(n):
        for _ in range(n):
            learning.enroll_free(make_user(), make_course())

    def pages(n):
        for _ in range(n):
            k = Page.objects.count()
            res = editor.post(
                "/api/v1/admin/cms/pages/", {"title": f"P{k}", "slug": f"p-{k}", "sections": []}, format="json"
            )
            assert res.status_code == 201, res.content

    def posts(n):
        for _ in range(n):
            k = BlogPost.objects.count()
            res = editor.post(
                "/api/v1/admin/cms/blog/posts/", {"title": f"Post {k}", "slug": f"post-{k}"}, format="json"
            )
            assert res.status_code == 201, res.content

    assert_constant_queries(enrollments, staff, "/api/v1/admin/learning/enrollments/")
    assert_constant_queries(pages, editor, "/api/v1/admin/cms/pages/")
    assert_constant_queries(posts, editor, "/api/v1/admin/cms/blog/posts/")


def test_my_notifications(assert_constant_queries, client_for):
    me = client_for()

    def build(n):
        for i in range(n):
            notify([me.user], kind="general", title=f"Notice {i}")

    assert_constant_queries(build, me, "/api/v1/me/notifications/")
