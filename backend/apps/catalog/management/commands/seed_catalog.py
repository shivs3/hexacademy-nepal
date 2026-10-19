"""Seed a small, clearly labelled demo catalog for development.

Idempotent: categories and courses are matched by slug and never overwritten.
Courses are only published when `--instructor` names an existing account,
because a published course must have an instructor (see services.publish_problems);
without it they are left as drafts for an editor to finish.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalog import services
from apps.catalog.models import Category, Course, CourseInstructor, CourseModule, Lesson
from apps.cms.sanitize import clean_rich_text

DEMO = "<p><strong>Demo content.</strong> Created by the setup script; replace or archive it before launch.</p>"

CATEGORIES = [
    ("programming", "Programming", None),
    ("python", "Python", "programming"),
    ("ai-ml", "AI & Machine Learning", None),
    ("engineering", "Engineering", None),
]

COURSES = [
    {
        "slug": "demo-python-fundamentals",
        "title": "Python Fundamentals (Demo)",
        "subtitle": "Demo course: variables, control flow and functions in Python.",
        "category": "python",
        "level": Course.Level.BEGINNER,
        "duration_text": "Self-paced",
        "learning_outcomes": ["Write and run simple Python programs", "Use conditions, loops and functions"],
        "prerequisites": ["A computer with Python 3 installed"],
        "modules": [
            (
                "Getting started",
                [
                    ("Welcome to the course", "<p>What this demo course covers and how lessons work.</p>", True),
                    ("Variables and types", "<p>Numbers, strings and booleans.</p>", False),
                ],
            ),
            (
                "Control flow",
                [
                    ("Conditions", "<p>Using <code>if</code>, <code>elif</code> and <code>else</code>.</p>", False),
                    ("Loops", "<p><code>for</code> and <code>while</code> loops.</p>", False),
                ],
            ),
        ],
    },
    {
        "slug": "demo-linear-algebra-for-ml",
        "title": "Linear Algebra for Machine Learning (Demo)",
        "subtitle": "Demo course: vectors, matrices and why they matter for ML.",
        "category": "ai-ml",
        "level": Course.Level.INTERMEDIATE,
        "duration_text": "Self-paced",
        "sequential": True,
        "learning_outcomes": ["Compute dot products and matrix products"],
        "prerequisites": ["School-level algebra"],
        "modules": [
            (
                "Vectors",
                [
                    (
                        "Dot product",
                        '<p>For vectors a and b: <span data-type="inline-math" data-latex="a \\cdot b = '
                        '\\sum_i a_i b_i"></span>.</p>',
                        True,
                    ),
                    ("Norms", '<p>The length <span data-type="inline-math" data-latex="\\|a\\|"></span>.</p>', False),
                ],
            ),
        ],
    },
]


class Command(BaseCommand):
    help = "Create demo catalog categories and courses (labelled as demo content)."

    def add_arguments(self, parser):
        parser.add_argument("--instructor", help="Email of an existing account to list as instructor and publish.")

    @transaction.atomic
    def handle(self, *args, **options):
        instructor = None
        if email := options.get("instructor"):
            instructor = get_user_model().objects.filter(email__iexact=email).first()
            if instructor is None:
                raise CommandError(f"No account with email {email}.")

        categories = {}
        for slug, name, parent in CATEGORIES:
            categories[slug], _ = Category.objects.get_or_create(
                slug=slug, defaults={"name": name, "parent": categories.get(parent)}
            )

        for spec in COURSES:
            course = Course.objects.filter(slug=spec["slug"]).first()
            if course is None:
                course = self._create(spec, categories)
                self.stdout.write(f"Course {course.slug}: created as draft.")
            if instructor and course.status == Course.Status.DRAFT:
                CourseInstructor.objects.get_or_create(course=course, user=instructor)
                services.set_status(course, Course.Status.PUBLISHED, actor=instructor)
                self.stdout.write(f"Course {course.slug}: published with {instructor.email} as instructor.")

        if not instructor:
            self.stdout.write("Pass --instructor <email> to publish the demo courses.")
        self.stdout.write(self.style.SUCCESS("Catalog seed complete."))

    def _create(self, spec: dict, categories: dict) -> Course:
        course = Course.objects.create(
            slug=spec["slug"],
            title=spec["title"],
            subtitle=spec["subtitle"],
            description=DEMO,
            category=categories[spec["category"]],
            level=spec["level"],
            duration_text=spec["duration_text"],
            sequential=spec.get("sequential", False),
            learning_outcomes=spec["learning_outcomes"],
            prerequisites=spec["prerequisites"],
        )
        for m_pos, (title, lessons) in enumerate(spec["modules"], start=1):
            module = CourseModule.objects.create(course=course, title=title, position=m_pos)
            for l_pos, (lesson_title, body, preview) in enumerate(lessons, start=1):
                Lesson.objects.create(
                    course=course,
                    module=module,
                    title=lesson_title,
                    body=clean_rich_text(DEMO + body),
                    is_preview=preview,
                    is_published=True,
                    position=l_pos,
                )
        return course
