from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from common.models import TimeStampedModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def normalize_email(self, email):
        return (email or "").strip().lower()

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True)
        extra.setdefault("email_verified_at", timezone.now())
        return self._create_user(email, password, **extra)

    def get_by_natural_key(self, username):
        return self.get(email__iexact=username)


class User(AbstractBaseUser, PermissionsMixin):
    """Email-based account. Roles are Django Groups; see apps.accounts.roles."""

    # Stored lower-cased (see save); the functional constraint guards raw writes too.
    email = models.EmailField(max_length=254, unique=True)
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True, help_text="Inactive accounts cannot sign in.")
    # is_staff only controls access to the low-level Django admin (super administrators).
    is_staff = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        constraints = [models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique")]
        permissions = [
            ("access_admin_panel", "Can open the staff administration dashboard"),
            ("view_user_directory", "Can list and view user accounts"),
            ("manage_user_status", "Can activate or deactivate user accounts"),
            ("assign_roles", "Can assign non-super-administrator roles"),
        ]

    def __str__(self):
        return self.email

    def save(self, *args, **kwargs):
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return self.full_name.split(" ")[0] if self.full_name else self.email


class UserProfile(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    headline = models.CharField(max_length=160, blank=True)
    bio = models.TextField(blank=True, max_length=4000)
    avatar = models.ImageField(upload_to="avatars/%Y/%m/", blank=True)
    city = models.CharField(max_length=100, blank=True)
    timezone = models.CharField(max_length=64, default="Asia/Kathmandu")
    marketing_opt_in = models.BooleanField(default=False)

    def __str__(self):
        return f"Profile of {self.user_id}"
