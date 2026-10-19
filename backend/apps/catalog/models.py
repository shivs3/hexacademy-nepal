"""Catalog domain: categories, courses, the people who teach them, and the
curriculum (modules, lessons, resources).

Courses go live by status. Unlike CMS pages they are not versioned: edits to a
published course's description or curriculum are visible immediately, while
new lessons stay hidden until the author publishes them (see ADR-015).
Prices are fixed-precision decimals in NPR; never floats.
"""

import uuid
from decimal import Decimal
from pathlib import PurePosixPath

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.cms.models import MediaAsset, SeoFields
from common.models import TimeStampedModel


class Category(TimeStampedModel):
    """Two levels: top-level categories and their subcategories."""

    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=90, unique=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    description = models.CharField(max_length=300, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(
                fields=["parent", "name"], nulls_distinct=False, name="catalog_category_unique_name"
            ),
            models.CheckConstraint(condition=~Q(parent=F("id")), name="catalog_category_not_own_parent"),
        ]

    def __str__(self):
        return self.name


class Course(SeoFields, TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class Level(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"
        ALL = "all_levels", "All levels"

    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=160, unique=True)
    subtitle = models.CharField(max_length=220, blank=True)
    description = models.TextField(blank=True)  # sanitised rich text
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="courses")
    thumbnail = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    level = models.CharField(max_length=20, choices=Level.choices, default=Level.BEGINNER)
    language = models.CharField(max_length=10, choices=settings.LANGUAGES, default="en")
    duration_text = models.CharField(
        max_length=60, blank=True, help_text="Shown as the course length, e.g. “8 weeks, 4 hours a week”."
    )
    learning_outcomes = models.JSONField(default=list, blank=True)  # list[str]
    prerequisites = models.JSONField(default=list, blank=True)  # list[str]
    is_featured = models.BooleanField(default=False)
    sequential = models.BooleanField(default=False, help_text="Learners must complete lessons in order.")

    price = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0"), validators=[MinValueValidator(Decimal("0"))]
    )
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    sale_ends_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ["-published_at", "-created_at"]
        indexes = [models.Index(fields=["status", "-published_at"]), models.Index(fields=["category", "status"])]
        constraints = [
            models.CheckConstraint(condition=Q(price__gte=0), name="catalog_course_price_non_negative"),
            models.CheckConstraint(
                condition=Q(sale_price__isnull=True) | (Q(sale_price__gte=0) & Q(sale_price__lt=F("price"))),
                name="catalog_course_sale_below_price",
            ),
            models.CheckConstraint(
                condition=~Q(status="published") | Q(published_at__isnull=False),
                name="catalog_course_published_has_date",
            ),
        ]
        permissions = [
            ("manage_catalog", "Can manage every course, category and instructor assignment"),
            ("publish_courses", "Can publish, unpublish and archive courses"),
            ("author_assigned_courses", "Can create courses and edit the courses they teach"),
        ]

    def __str__(self):
        return self.title

    @property
    def is_published(self) -> bool:
        return self.status == self.Status.PUBLISHED

    def current_price(self, now=None) -> Decimal:
        """The price a learner pays right now (the sale price while the sale lasts)."""
        now = now or timezone.now()
        if self.sale_price is not None and (self.sale_ends_at is None or self.sale_ends_at > now):
            return self.sale_price
        return self.price

    def is_free(self, now=None) -> bool:
        return self.current_price(now) == 0


class CourseInstructor(models.Model):
    class Role(models.TextChoices):
        INSTRUCTOR = "instructor", "Instructor"
        TEACHING_ASSISTANT = "teaching_assistant", "Teaching assistant"

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="instructor_links")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="teaching_links")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.INSTRUCTOR)
    is_public = models.BooleanField(default=True, help_text="Show this person on the public course page.")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["course", "user"], name="catalog_courseinstructor_unique")]

    def __str__(self):
        return f"{self.user_id} teaches {self.course_id} ({self.role})"


class CourseModule(TimeStampedModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    title = models.CharField(max_length=160)
    description = models.CharField(max_length=500, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        indexes = [models.Index(fields=["course", "position"])]

    def __str__(self):
        return self.title


class Lesson(TimeStampedModel):
    # `course` duplicates module.course so access checks and progress counts are
    # single-table lookups; the service layer keeps the two in step.
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="lessons")
    module = models.ForeignKey(CourseModule, on_delete=models.CASCADE, related_name="lessons")
    title = models.CharField(max_length=160)
    summary = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)  # sanitised rich text, may contain maths nodes
    video_url = models.CharField(max_length=500, blank=True, help_text="YouTube or Vimeo link.")
    duration_minutes = models.PositiveIntegerField(default=0)
    is_preview = models.BooleanField(default=False, help_text="Anyone can open this lesson from the course page.")
    is_published = models.BooleanField(default=False)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        indexes = [models.Index(fields=["module", "position"]), models.Index(fields=["course", "is_published"])]

    def __str__(self):
        return self.title


def private_storage():
    from django.core.files.storage import storages

    return storages["private"]


def resource_upload_to(instance: "LessonResource", filename: str) -> str:
    ext = PurePosixPath(filename).suffix.lower()[:10]
    return f"lessons/{instance.lesson.course_id}/{uuid.uuid4().hex}{ext}"


class LessonResource(TimeStampedModel):
    class Kind(models.TextChoices):
        FILE = "file", "File"
        LINK = "link", "Link"

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="resources")
    title = models.CharField(max_length=160)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    # Private storage: files are only reachable through the authorised download endpoint.
    file = models.FileField(upload_to=resource_upload_to, storage=private_storage, max_length=255, blank=True)
    original_name = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    url = models.URLField(max_length=500, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(kind="file") & ~Q(file="") & Q(url="")) | (Q(kind="link") & Q(file="") & ~Q(url="")),
                name="catalog_lessonresource_file_xor_link",
            )
        ]

    def __str__(self):
        return self.title
