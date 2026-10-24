import pytest
from django.utils import timezone

from apps.accounts import roles
from apps.certificates.models import Certificate, CertificateTemplate
from apps.certificates.services import new_number

pytestmark = pytest.mark.django_db


def test_learner_and_staff_certificate_lists(assert_constant_queries, client_for, make_course):
    me, staff = client_for(), client_for(roles.SUPER_ADMIN)
    template = CertificateTemplate.objects.create(name="Standard", signatory_name="Demo Signatory")

    def build(n):
        for _ in range(n):
            course = make_course()
            Certificate.objects.create(
                number=new_number(), user=me.user, course=course, template=template,
                recipient_name=me.user.full_name, course_title=course.title, issued_at=timezone.now(),
            )  # fmt: skip

    assert_constant_queries(build, me, "/api/v1/me/certificates/")
    assert_constant_queries(build, staff, "/api/v1/admin/certificates/issued/")
