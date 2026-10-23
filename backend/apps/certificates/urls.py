from django.urls import path
from rest_framework.routers import SimpleRouter

from . import admin_views, views

router = SimpleRouter()
router.register("admin/certificates/templates", admin_views.AdminTemplateViewSet, basename="admin-cert-templates")
router.register("admin/certificates/rules", admin_views.AdminRuleViewSet, basename="admin-cert-rules")
router.register("admin/certificates/issued", admin_views.AdminCertificateViewSet, basename="admin-certificates")

urlpatterns = [
    path("me/certificates/", views.MyCertificatesView.as_view(), name="my-certificates"),
    path("me/certificates/progress/", views.MyCertificateProgressView.as_view(), name="my-certificate-progress"),
    path("me/certificates/<str:number>/pdf/", views.MyCertificatePdfView.as_view(), name="my-certificate-pdf"),
    path("me/courses/<slug:slug>/certificate/", views.CourseCertificateView.as_view(), name="my-course-certificate"),
    path("certificates/verify/<str:number>/", views.VerifyCertificateView.as_view(), name="certificate-verify"),
    path("admin/certificates/courses/", admin_views.CourseOptionsView.as_view(), name="admin-cert-course-options"),
    *router.urls,
]
