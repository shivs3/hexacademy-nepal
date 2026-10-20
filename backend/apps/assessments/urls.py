from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, views

router = SimpleRouter()
router.register("admin/assessments/subjects", admin_views.SubjectViewSet, basename="admin-assessments-subjects")
router.register("admin/assessments/topics", admin_views.TopicViewSet, basename="admin-assessments-topics")
router.register("admin/assessments/questions", admin_views.QuestionViewSet, basename="admin-assessments-questions")
router.register("admin/assessments/exams", admin_views.ExamViewSet, basename="admin-assessments-exams")

urlpatterns = [
    path("exams/", views.ExamListView.as_view(), name="exams"),
    path("exams/<slug:slug>/", views.ExamDetailView.as_view(), name="exam-detail"),
    path("exams/<slug:slug>/attempts/", views.StartAttemptView.as_view(), name="exam-start"),
    path("attempts/<int:pk>/", views.AttemptView.as_view(), name="attempt"),
    path("attempts/<int:pk>/answers/<int:question_id>/", views.AnswerView.as_view(), name="attempt-answer"),
    path("attempts/<int:pk>/advance/", views.AdvanceView.as_view(), name="attempt-advance"),
    path("attempts/<int:pk>/submit/", views.SubmitView.as_view(), name="attempt-submit"),
    path("attempts/<int:pk>/result/", views.AttemptResultView.as_view(), name="attempt-result"),
    path("me/exam-attempts/", views.MyAttemptsView.as_view(), name="my-exam-attempts"),
    path(
        "admin/assessments/course-options/",
        admin_views.ExamCourseOptionsView.as_view(),
        name="admin-assessments-courses",
    ),
    *router.urls,
]
