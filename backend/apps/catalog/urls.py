from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, views

router = SimpleRouter()
router.register("admin/catalog/categories", admin_views.AdminCategoryViewSet, basename="admin-catalog-categories")
router.register("admin/catalog/courses", admin_views.AdminCourseViewSet, basename="admin-catalog-courses")
router.register("admin/catalog/modules", admin_views.AdminModuleViewSet, basename="admin-catalog-modules")
router.register("admin/catalog/lessons", admin_views.AdminLessonViewSet, basename="admin-catalog-lessons")
router.register("admin/catalog/resources", admin_views.AdminResourceViewSet, basename="admin-catalog-resources")

urlpatterns = [
    # Public
    path("courses/", views.CourseListView.as_view(), name="courses"),
    path("courses/<slug:slug>/", views.CourseDetailView.as_view(), name="course"),
    path("course-categories/", views.CategoryListView.as_view(), name="course-categories"),
    path("instructors/", views.InstructorListView.as_view(), name="instructors"),
    path("seo/course-sitemap/", views.CourseSitemapView.as_view(), name="seo-course-sitemap"),
    # Staff
    path(
        "admin/catalog/team-candidates/", admin_views.TeamCandidatesView.as_view(), name="admin-catalog-team-candidates"
    ),
    *router.urls,
]
