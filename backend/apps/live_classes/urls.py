from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, views

router = SimpleRouter()
router.register("admin/live-classes/batches", admin_views.AdminBatchViewSet, basename="admin-live-batches")
router.register("admin/live-classes/sessions", admin_views.AdminSessionViewSet, basename="admin-live-sessions")

urlpatterns = [
    path("me/class-sessions/", views.MySessionsView.as_view(), name="my-class-sessions"),
    path("class-sessions/<int:pk>/", views.SessionDetailView.as_view(), name="class-session"),
    path("class-sessions/<int:pk>/join/", views.JoinView.as_view(), name="class-session-join"),
    path(
        "admin/live-classes/courses/",
        admin_views.ScheduleCourseOptionsView.as_view(),
        name="admin-live-course-options",
    ),
    *router.urls,
]
