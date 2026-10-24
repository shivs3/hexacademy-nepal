"""Seed a small, clearly labelled demo catalog for development.

Idempotent: categories and courses are matched by slug and never overwritten.
Prices are in NPR; free and paid courses are mixed so checkout can be tried
with a sandbox provider. Courses are only published when `--instructor` names an existing account,
because a published course must have an instructor (see services.publish_problems);
without it they are left as drafts for an editor to finish.
"""

from decimal import Decimal

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
    ("mathematics", "Engineering Mathematics", "engineering"),
    ("entrance-preparation", "Entrance Preparation", None),
]

EXAM_LINK = (
    '<p>Try the free <a href="/dashboard/exams">IOE MSc Section A practice test (demo)</a> '
    "from your dashboard after signing in.</p>"
)

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
    {
        "slug": "demo-ioe-msc-entrance-preparation",
        "title": "IOE MSc Entrance Preparation (Demo)",
        "subtitle": "Demo course: Section A syllabus, exam strategy and timed practice for the TU IOE MSc entrance.",
        "summary": (
            "<p>A structured walk through the publicly described Section A syllabus that every stream shares: "
            "critical reasoning and engineering mathematics. Verify the current pattern against the official "
            "IOE entrance notice.</p>"
        ),
        "category": "entrance-preparation",
        "level": Course.Level.ADVANCED,
        "duration_text": "Self-paced",
        "price": "4500",
        "sale_price": "3500",
        "is_featured": True,
        "learning_outcomes": [
            "Explain the published exam pattern and how negative marking affects strategy",
            "Revise matrices, vector calculus, calculus and transforms at entrance level",
            "Answer critical-reasoning questions on assumptions and deduction",
        ],
        "prerequisites": ["A bachelor's degree in engineering, or final-year study"],
        "modules": [
            (
                "Exam pattern and strategy",
                [
                    (
                        "Understanding the exam pattern",
                        "<p>As publicly described, the entrance is a computer-based MCQ test of 100 marks in "
                        "2 hours: Section A (50 marks, common to all streams) and Section B (50 marks, "
                        "stream-specific). A wrong answer costs 10% of the question's marks.</p>" + EXAM_LINK,
                        True,
                    ),
                    (
                        "Negative marking and when to guess",
                        "<p>With four options and a 10% penalty, a blind guess has a positive expected score "
                        '(<span data-type="inline-math" data-latex="0.25 \\times 1 - 0.75 \\times 0.1 = 0.175">'
                        "</span> marks), and eliminating even one option improves it further.</p>",
                        False,
                    ),
                ],
            ),
            (
                "Section A mathematics",
                [
                    (
                        "Matrices, determinants and eigenvalues",
                        '<p>For a 2×2 matrix, the eigenvalues satisfy <span data-type="inline-math" '
                        'data-latex="\\lambda^2 - (\\operatorname{tr} A)\\lambda + \\det A = 0"></span>.</p>',
                        False,
                    ),
                    (
                        "Vector calculus essentials",
                        "<p>Gradient, divergence and curl, and when a line integral is path-independent.</p>",
                        False,
                    ),
                    (
                        "Laplace transforms and Fourier series",
                        '<p>Key pairs such as <span data-type="inline-math" data-latex="\\mathcal{L}\\{t^n\\} '
                        '= \\frac{n!}{s^{n+1}}"></span>, and the symmetry rules for Fourier coefficients.</p>',
                        False,
                    ),
                ],
            ),
            (
                "Critical reasoning",
                [
                    (
                        "Assumptions, strengtheners and weakeners",
                        "<p>How to find the unstated premise an argument depends on.</p>",
                        False,
                    ),
                    ("Deduction and patterns", "<p>Syllogisms, conditionals and number sequences.</p>", False),
                ],
            ),
        ],
    },
    {
        "slug": "demo-engineering-mathematics-calculus",
        "title": "Engineering Mathematics: Calculus (Demo)",
        "subtitle": "Demo course: limits, derivatives, integrals and first-order differential equations.",
        "category": "mathematics",
        "level": Course.Level.INTERMEDIATE,
        "duration_text": "Self-paced",
        "price": "2500",
        "learning_outcomes": ["Evaluate standard limits and integrals", "Solve separable and linear first-order ODEs"],
        "prerequisites": ["School-level calculus"],
        "modules": [
            (
                "Limits and derivatives",
                [
                    (
                        "Standard limits",
                        '<p><span data-type="inline-math" data-latex="\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1">'
                        "</span> and its consequences.</p>",
                        True,
                    ),
                    ("Partial derivatives", "<p>Differentiating functions of several variables.</p>", False),
                ],
            ),
            (
                "Integrals and ODEs",
                [
                    ("Integration by parts", "<p>Choosing u and dv.</p>", False),
                    ("First-order ODEs", "<p>Separable equations and integrating factors.</p>", False),
                ],
            ),
        ],
    },
    {
        "slug": "demo-machine-learning-foundations",
        "title": "Machine Learning Foundations (Demo)",
        "subtitle": "Demo course: supervised learning, model evaluation and a first project in Python.",
        "category": "ai-ml",
        "level": Course.Level.INTERMEDIATE,
        "duration_text": "Self-paced",
        "price": "6000",
        "is_featured": True,
        "learning_outcomes": [
            "Describe the supervised learning workflow",
            "Split data, train a model and evaluate it honestly",
        ],
        "prerequisites": ["Python basics", "Linear algebra basics"],
        "modules": [
            (
                "Supervised learning",
                [
                    ("What a model learns", "<p>Features, labels and a loss function.</p>", True),
                    (
                        "Linear regression",
                        '<p>Minimising <span data-type="inline-math" data-latex="\\sum_i (y_i - w^\\top x_i)^2">'
                        "</span>.</p>",
                        False,
                    ),
                ],
            ),
            (
                "Evaluation",
                [
                    ("Train, validation and test sets", "<p>Why a model must be judged on unseen data.</p>", False),
                    ("Overfitting", "<p>Recognising it and reducing it.</p>", False),
                ],
            ),
        ],
    },
    {
        "slug": "demo-data-structures-in-python",
        "title": "Data Structures in Python (Demo)",
        "subtitle": "Demo course: lists, stacks, queues, hash maps and trees, with their costs.",
        "category": "programming",
        "level": Course.Level.BEGINNER,
        "duration_text": "Self-paced",
        "price": "3000",
        "is_featured": True,
        "learning_outcomes": ["Choose a data structure for a task", "Reason about time complexity"],
        "prerequisites": ["Python basics"],
        "modules": [
            (
                "Linear structures",
                [
                    ("Lists and complexity", "<p>Indexing, appending and inserting.</p>", True),
                    ("Stacks and queues", "<p>Using <code>list</code> and <code>collections.deque</code>.</p>", False),
                ],
            ),
            (
                "Maps and trees",
                [
                    ("Hash maps", "<p>How <code>dict</code> gives average constant-time lookups.</p>", False),
                    ("Binary search trees", "<p>Ordered data and search.</p>", False),
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
            description=DEMO + spec.get("summary", ""),
            category=categories[spec["category"]],
            level=spec["level"],
            duration_text=spec["duration_text"],
            sequential=spec.get("sequential", False),
            is_featured=spec.get("is_featured", False),
            price=Decimal(spec.get("price", "0")),
            sale_price=Decimal(spec["sale_price"]) if "sale_price" in spec else None,
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
