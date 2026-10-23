from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from apps.assessments.models import Exam
from apps.catalog.models import Course

from .models import Certificate, CertificateRule, CertificateTemplate
from .pdf import verify_url


class CertificateCourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ["id", "title", "slug"]


class MyCertificateSerializer(serializers.ModelSerializer):
    course = CertificateCourseSerializer(read_only=True)
    verify_url = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = [
            "number",
            "course",
            "recipient_name",
            "course_title",
            "issued_at",
            "status",
            "revoked_at",
            "verify_url",
        ]

    def get_verify_url(self, obj) -> str:
        return verify_url(obj)


class VerifiedCertificateSerializer(serializers.ModelSerializer):
    """Public verification: only what the printed certificate already shows."""

    heading = serializers.CharField(source="template.heading")

    class Meta:
        model = Certificate
        fields = ["number", "heading", "recipient_name", "course_title", "issued_at", "status", "revoked_at"]


class RequirementSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    met = serializers.BooleanField()


class EligibilitySerializer(serializers.Serializer):
    course = CertificateCourseSerializer()
    offered = serializers.BooleanField()
    eligible = serializers.BooleanField()
    requirements = RequirementSerializer(many=True)
    certificate = MyCertificateSerializer(allow_null=True)


# ---- staff ----


class TemplateSerializer(serializers.ModelSerializer):
    rule_count = serializers.IntegerField(read_only=True, default=0)
    certificate_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = CertificateTemplate
        fields = [
            "id",
            "name",
            "heading",
            "statement",
            "signatory_name",
            "signatory_title",
            "footer_note",
            "rule_count",
            "certificate_count",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


class ExamRefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exam
        fields = ["id", "title", "status", "pass_marks"]


class RuleSerializer(serializers.ModelSerializer):
    course = CertificateCourseSerializer(read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)
    required_exam = ExamRefSerializer(read_only=True, allow_null=True)
    issued_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = CertificateRule
        fields = [
            "id",
            "course",
            "is_enabled",
            "template",
            "template_name",
            "require_lessons",
            "required_exam",
            "require_assignments",
            "issued_count",
            "updated_at",
        ]


class RuleWriteSerializer(serializers.ModelSerializer):
    course = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(),
        validators=[
            UniqueValidator(CertificateRule.objects.all(), message="This course already has a certificate rule.")
        ],
    )
    required_exam = serializers.PrimaryKeyRelatedField(queryset=Exam.objects.all(), allow_null=True, required=False)

    class Meta:
        model = CertificateRule
        fields = ["course", "is_enabled", "template", "require_lessons", "required_exam", "require_assignments"]


class IssuedCountSerializer(serializers.Serializer):
    issued = serializers.IntegerField()


class AdminCertificateSerializer(serializers.ModelSerializer):
    course = CertificateCourseSerializer(read_only=True)
    user = serializers.SerializerMethodField()
    revoked_by_name = serializers.SerializerMethodField()
    verify_url = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = [
            "id",
            "number",
            "user",
            "course",
            "recipient_name",
            "course_title",
            "issued_at",
            "status",
            "revoked_at",
            "revoked_reason",
            "revoked_by_name",
            "verify_url",
        ]

    def get_user(self, obj) -> dict:
        return {"id": obj.user_id, "full_name": obj.user.full_name, "email": obj.user.email}

    def get_revoked_by_name(self, obj) -> str:
        return (obj.revoked_by.full_name or obj.revoked_by.email) if obj.revoked_by else ""

    def get_verify_url(self, obj) -> str:
        return verify_url(obj)


class RevokeSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, allow_blank=True)


class CourseOptionSerializer(serializers.ModelSerializer):
    exams = ExamRefSerializer(many=True, read_only=True)
    has_rule = serializers.BooleanField(read_only=True)

    class Meta:
        model = Course
        fields = ["id", "title", "slug", "status", "exams", "has_rule"]
