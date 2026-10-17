from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from . import roles
from .models import UserProfile

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["headline", "bio", "avatar", "city", "timezone", "marketing_opt_in"]

    def validate_timezone(self, value):
        import zoneinfo

        if value not in zoneinfo.available_timezones():
            raise serializers.ValidationError("Unknown time zone.")
        return value


class MeSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(required=False)
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    email_verified = serializers.BooleanField(read_only=True)
    is_staff_member = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone",
            "email_verified",
            "date_joined",
            "roles",
            "permissions",
            "is_superuser",
            "is_staff_member",
            "profile",
        ]
        read_only_fields = ["id", "email", "date_joined", "is_superuser"]

    def get_roles(self, user) -> list[str]:
        return roles.role_slugs_for(user)

    def get_permissions(self, user) -> list[str]:
        # Superusers implicitly hold every permission; the frontend checks is_superuser.
        return sorted(user.get_all_permissions())

    def get_is_staff_member(self, user) -> bool:
        return user.has_perm("accounts.access_admin_panel")

    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", None)
        instance = super().update(instance, validated_data)
        if profile_data:
            try:
                profile = instance.profile
            except UserProfile.DoesNotExist:
                profile = UserProfile(user=instance)
                instance.profile = profile
            for key, value in profile_data.items():
                setattr(profile, key, value)
            profile.save()
        return instance


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    full_name = serializers.CharField(max_length=150, min_length=2)
    phone = serializers.RegexField(r"^\+?[0-9\- ]{7,20}$", required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    def validate(self, attrs):
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        validate_password(attrs["password"], user=candidate)
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, max_length=128)


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False, max_length=128)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "Your current password is incorrect."})
        validate_password(attrs["new_password"], user=user)
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False, max_length=128)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class EmailVerifySerializer(serializers.Serializer):
    token = serializers.CharField(max_length=500)


# --- Staff administration --------------------------------------------------


class AdminUserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    email_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "phone",
            "is_active",
            "email_verified",
            "date_joined",
            "last_login",
            "roles",
        ]
        read_only_fields = fields

    def get_roles(self, user) -> list[str]:
        return roles.role_slugs_for(user)


class UserStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class UserRolesSerializer(serializers.Serializer):
    roles = serializers.ListField(child=serializers.ChoiceField(choices=roles.ASSIGNABLE_ROLES), allow_empty=True)
