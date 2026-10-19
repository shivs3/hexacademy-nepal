from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, views

router = SimpleRouter()
router.register("admin/learning/enrollments", admin_views.AdminEnrollmentViewSet, basename="admin-learning-enrollments")

urlpatterns = [
    path("me/enrollments/", views.MyEnrollmentsView.as_view(), name="my-enrollments"),
    path("me/courses/<slug:slug>/", views.PlayerOutlineView.as_view(), name="my-course-outline"),
    path("courses/<slug:slug>/enroll/", views.EnrollView.as_view(), name="course-enroll"),
    path("lessons/<int:pk>/", views.LessonView.as_view(), name="lesson"),
    path("lessons/<int:pk>/progress/", views.LessonProgressView.as_view(), name="lesson-progress"),
    path(
        "lessons/<int:pk>/resources/<int:resource_id>/download/",
        views.LessonResourceDownloadView.as_view(),
        name="lesson-resource-download",
    ),
    path(
        "admin/learning/courses/",
        admin_views.EnrollmentCourseOptionsView.as_view(),
        name="admin-learning-course-options",
    ),
    *router.urls,
]
