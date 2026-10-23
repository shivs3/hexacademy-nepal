"""Learner and public certificate endpoints.

- GET  /me/certificates/                       the learner's certificates
- GET  /me/certificates/progress/              offered certificates they are working towards
- GET  /me/courses/{slug}/certificate/         eligibility for one course
- POST /me/courses/{slug}/certificate/         claim: issue if the server finds the rule met
- GET  /me/certificates/{number}/pdf/          download (own certificates only)
- GET  /certificates/verify/{number}/          public verification
"""

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.catalog.models import Course
from apps.cms.models import SiteSettings
from apps.learning.models import Enrollment

from . import pdf, services
from .models import Certificate, CertificateRule
from .serializers import EligibilitySerializer, MyCertificateSerializer, VerifiedCertificateSerializer


def eligibility_payload(user, course: Course) -> dict:
    result = services.evaluate(user, course)
    return {
        "course": course,
        "offered": result.offered,
        "eligible": result.eligible and result.certificate is None,
        "requirements": result.requirements,
        "certificate": result.certificate,
    }


def pdf_response(cert: Certificate) -> HttpResponse:
    body = pdf.render(cert, SiteSettings.load().site_name)
    response = HttpResponse(body, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="certificate-{cert.number}.pdf"'
    response["Cache-Control"] = "private, no-store"
    return response


class MyCertificatesView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = MyCertificateSerializer
    pagination_class = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Certificate.objects.none()
        return Certificate.objects.filter(user=self.request.user).select_related("course")


class MyCertificateProgressView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=EligibilitySerializer(many=True))
    def get(self, request):
        course_ids = CertificateRule.objects.filter(
            is_enabled=True,
            course__enrollments__user=request.user,
            course__enrollments__status=Enrollment.Status.ACTIVE,
        ).values_list("course_id", flat=True)
        courses = Course.objects.filter(pk__in=course_ids).exclude(certificates__user=request.user).order_by("title")
        rows = [eligibility_payload(request.user, c) for c in courses]
        return Response(EligibilitySerializer(rows, many=True).data)


class CourseCertificateView(APIView):
    permission_classes = [IsAuthenticated]

    def _course(self, slug):
        # Only courses the learner is (or was) enrolled in; others look absent.
        return get_object_or_404(Course, slug=slug, enrollments__user=self.request.user)

    @extend_schema(responses=EligibilitySerializer)
    def get(self, request, slug):
        return Response(EligibilitySerializer(eligibility_payload(request.user, self._course(slug))).data)

    @extend_schema(request=None, responses={200: EligibilitySerializer, 201: EligibilitySerializer})
    def post(self, request, slug):
        course = self._course(slug)
        issued = services.issue_if_eligible(request.user, course)
        code = status.HTTP_201_CREATED if issued else status.HTTP_200_OK
        return Response(EligibilitySerializer(eligibility_payload(request.user, course)).data, status=code)


class MyCertificatePdfView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    def get(self, request, number):
        cert = get_object_or_404(Certificate.objects.select_related("template"), number=number, user=request.user)
        return pdf_response(cert)


class VerifyThrottle(AnonRateThrottle):
    scope = "certificate_verify"


class VerifyCertificateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [VerifyThrottle]

    @extend_schema(responses=VerifiedCertificateSerializer)
    def get(self, request, number):
        cert = get_object_or_404(Certificate.objects.select_related("template"), number=number.strip().upper())
        return Response(VerifiedCertificateSerializer(cert).data)
