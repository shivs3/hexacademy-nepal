from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, assignment_views, views

router = SimpleRouter()
router.register("admin/learning/enrollments", admin_views.AdminEnrollmentViewSet, basename="admin-learning-enrollments")
router.register(
    "admin/learning/assignments", assignment_views.AdminAssignmentViewSet, basename="admin-learning-assignments"
)
router.register(
    "admin/learning/submissions", assignment_views.AdminSubmissionViewSet, basename="admin-learning-submissions"
)

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
    path(
        "admin/learning/assignment-courses/",
        assignment_views.AssignmentCourseOptionsView.as_view(),
        name="admin-learning-assignment-courses",
    ),
    path("me/assignments/", assignment_views.MyAssignmentsView.as_view(), name="my-assignments"),
    path("assignments/<int:pk>/", assignment_views.AssignmentDetailView.as_view(), name="assignment"),
    path("assignments/<int:pk>/submission/", assignment_views.SubmissionView.as_view(), name="assignment-submission"),
    path(
        "assignments/<int:pk>/submission/file/",
        assignment_views.SubmissionFileView.as_view(),
        name="assignment-submission-file",
    ),
    *router.urls,
]
