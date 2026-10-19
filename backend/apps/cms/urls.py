from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, views

router = SimpleRouter()
router.register("admin/cms/pages", admin_views.AdminPageViewSet, basename="admin-cms-pages")
router.register("admin/cms/media", admin_views.AdminMediaViewSet, basename="admin-cms-media")
router.register("admin/cms/blog/posts", admin_views.AdminBlogPostViewSet, basename="admin-cms-blog-posts")
router.register("admin/cms/blog/categories", admin_views.AdminBlogCategoryViewSet, basename="admin-cms-blog-categories")
router.register("admin/cms/newsletter", admin_views.AdminNewsletterViewSet, basename="admin-cms-newsletter")

urlpatterns = [
    # Public
    path("site-settings/", views.SiteSettingsView.as_view(), name="site-settings"),
    path("menus/<str:location>/", views.MenuView.as_view(), name="menu"),
    path("home-page/", views.HomePageView.as_view(), name="home-page"),
    path("pages/<slug:slug>/", views.PageView.as_view(), name="page"),
    path("blog/posts/", views.BlogPostListView.as_view(), name="blog-posts"),
    path("blog/posts/<slug:slug>/", views.BlogPostDetailView.as_view(), name="blog-post"),
    path("blog/categories/", views.BlogCategoryListView.as_view(), name="blog-categories"),
    path("seo/sitemap/", views.SitemapView.as_view(), name="seo-sitemap"),
    path("newsletter/subscribe/", views.NewsletterSubscribeView.as_view(), name="newsletter-subscribe"),
    # Staff
    path("admin/cms/overview/", admin_views.CmsOverviewView.as_view(), name="admin-cms-overview"),
    path("admin/cms/section-types/", admin_views.SectionTypesView.as_view(), name="admin-cms-section-types"),
    path(
        "admin/cms/references/<slug:key>/",
        admin_views.SectionReferenceOptionsView.as_view(),
        name="admin-cms-section-references",
    ),
    path("admin/cms/site-settings/", admin_views.AdminSiteSettingsView.as_view(), name="admin-cms-site-settings"),
    path("admin/cms/menus/", admin_views.AdminMenuListView.as_view(), name="admin-cms-menus"),
    path("admin/cms/menus/<str:location>/", admin_views.AdminMenuDetailView.as_view(), name="admin-cms-menu"),
    path("admin/cms/blog/authors/", admin_views.BlogAuthorOptionsView.as_view(), name="admin-cms-blog-authors"),
    *router.urls,
]
