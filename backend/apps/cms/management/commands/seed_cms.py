"""Seed demo CMS content for development and first-run installs.

Idempotent: existing pages, menus, posts and already-filled settings are left
untouched, so running it again never overwrites an administrator's edits. The
one exception is content this script created earlier and nobody has changed
since (it still matches an older seed exactly): that is upgraded to the
current demo content, with the previous version kept in the page history.
Every seeded page carries a visible "demo content" notice until it is replaced.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.cms import services
from apps.cms.models import BlogCategory, BlogPost, Menu, Page, SiteSettings
from apps.cms.sanitize import clean_rich_text
from apps.cms.sections import clean_sections

DEMO_NOTICE = (
    "<p><strong>Demo content.</strong> This page was created by the setup script. "
    "Replace it from the admin dashboard before launch.</p>"
)

SETTINGS = {
    "tagline": "Online courses, live classes and exam practice",
    "footer_text": "Demo footer text. Edit it under Admin → Site settings.",
    "auth_panel_heading": "Learn at your own pace",
    "auth_panel_text": "Sign in to continue your courses, join live classes and practise for exams.",
    "default_meta_description": "Hexacademy Nepal offers online courses, live classes and exam practice.",
}

IOE_SOURCES = (
    "<ul>"
    '<li><a href="https://edusanjal.com/exam/msc-entrance-tu-ioe/">Edusanjal: MSc entrance (TU IOE)</a></li>'
    '<li><a href="https://www.ioenotes.edu.np/ioe-msc-entrance-syllabus">IOE Notes: MSc entrance syllabus</a></li>'
    "</ul>"
)


def _legal(title: str) -> list[dict]:
    return [
        {
            "type": "rich_text",
            "data": {
                "heading": title,
                "body": DEMO_NOTICE + "<p>Publish your organisation's actual policy text here.</p>",
            },
        }
    ]


HOME_SECTIONS = [
    {
        "type": "hero",
        "data": {
            "eyebrow": "Demo content",
            "heading": "Learn engineering, programming and AI online",
            "subheading": (
                "Self-paced courses, live classes and timed MCQ practice, including a free IOE MSc entrance "
                "Section A practice test. Replace this banner from Admin → Pages before launch."
            ),
            "primary_cta_label": "Browse courses",
            "primary_cta_url": "/courses",
            "secondary_cta_label": "Create a free account",
            "secondary_cta_url": "/register",
            "theme": "dark",
        },
    },
    {
        "type": "featured_courses",
        "data": {
            "heading": "Featured courses",
            "intro": "Demo courses marked as featured in the catalog.",
            "source": "featured",
            "limit": 6,
            "cta_label": "See all courses",
            "cta_url": "/courses",
        },
    },
    {
        "type": "stats",
        "data": {
            "heading": "The IOE MSc entrance at a glance",
            "intro": "As publicly described; check the current official IOE notice before relying on it.",
            "items": [
                {"value": "100", "label": "Full marks", "note": "Section A 50 + Section B 50"},
                {"value": "2 hrs", "label": "Exam duration", "note": "Computer-based MCQ test"},
                {"value": "10%", "label": "Deducted per wrong answer", "note": "Of that question's marks"},
                {"value": "45", "label": "Questions in our demo Section A test", "note": "Free practice on this site"},
            ],
        },
    },
    {
        "type": "course_categories",
        "data": {"heading": "Explore by subject", "intro": "", "show_counts": True},
    },
    {
        "type": "features",
        "data": {
            "heading": "How you learn here",
            "intro": "Demo description of the platform's features; adjust it to your actual offering.",
            "columns": "3",
            "items": [
                {"icon": "video", "title": "Recorded lessons", "text": "Self-paced lessons with notes and files."},
                {"icon": "users", "title": "Live classes", "text": "Scheduled sessions on Google Meet or Zoom."},
                {
                    "icon": "clipboard-check",
                    "title": "Timed practice tests",
                    "text": "Server-timed MCQ exams with negative marking, autosave and instant results.",
                },
                {"icon": "trending-up", "title": "Progress tracking", "text": "Progress saved across devices."},
                {"icon": "calculator", "title": "Maths that renders", "text": "Formulas typeset with KaTeX."},
                {"icon": "award", "title": "Certificates", "text": "Verifiable certificates when you qualify."},
            ],
        },
    },
    {
        "type": "instructors",
        "data": {"heading": "Instructors", "intro": "Profiles come from instructors' accounts.", "limit": 4},
    },
    {
        "type": "testimonials",
        "data": {
            "heading": "What learners say (sample)",
            "intro": (
                "These are placeholder testimonials for the demo, not real people. Replace them with genuine "
                "quotes you have permission to publish, or remove this section."
            ),
            "items": [
                {
                    "quote": "Sample quote: the timed tests showed me which calculus topics I needed to revise.",
                    "name": "Sample learner A",
                    "role": "Demo placeholder — replace with a real, consented quote",
                },
                {
                    "quote": "Sample quote: seeing the explanation after each question made revision faster.",
                    "name": "Sample learner B",
                    "role": "Demo placeholder — replace with a real, consented quote",
                },
                {
                    "quote": "Sample quote: I could pause a lesson on my phone and continue on my laptop.",
                    "name": "Sample learner C",
                    "role": "Demo placeholder — replace with a real, consented quote",
                },
            ],
        },
    },
    {
        "type": "faq",
        "data": {
            "heading": "Frequently asked questions",
            "items": [
                {
                    "question": "Is the IOE MSc practice test official?",
                    "answer": (
                        "<p>No. It is a demo practice paper of original questions that follows the publicly "
                        "described Section A pattern. Always check the official IOE entrance notice.</p>"
                    ),
                },
                {
                    "question": "How is the practice test timed?",
                    "answer": (
                        "<p>The server sets the deadline when you start. Answers save as you go, so a refresh "
                        "or a dropped connection does not lose your work.</p>"
                    ),
                },
                {
                    "question": "Can I try a course before paying?",
                    "answer": "<p>Yes. Lessons marked as previews are open to everyone, and some courses are free.</p>",
                },
                {
                    "question": "Is this real content?",
                    "answer": "<p>No. This page is demo content; replace it with real answers before launch.</p>",
                },
            ],
        },
    },
    {
        "type": "newsletter",
        "data": {
            "heading": "Get study tips and new course announcements",
            "text": "Occasional emails only.",
            "button_label": "Subscribe",
            "consent_text": (
                "I agree to receive occasional emails from Hexacademy Nepal. I can unsubscribe at any time."
            ),
        },
    },
    {
        "type": "cta",
        "data": {
            "heading": "Ready to practise?",
            "text": "Create a free account and take the demo IOE MSc Section A practice test.",
            "button_label": "Create an account",
            "button_url": "/register",
            "secondary_label": "Contact us",
            "secondary_url": "/contact",
            "theme": "accent",
        },
    },
]

ABOUT_SECTIONS = [
    {
        "type": "rich_text",
        "data": {
            "heading": "About Hexacademy Nepal",
            "body": DEMO_NOTICE
            + (
                "<p>Hexacademy Nepal is an online learning platform for engineering, programming, artificial "
                "intelligence and machine learning, with recorded courses, live classes and timed exam "
                "practice.</p><p>Describe your organisation, team and teaching approach here.</p>"
            ),
        },
    },
    {
        "type": "cta",
        "data": {
            "heading": "Questions?",
            "text": "Get in touch with the team.",
            "button_label": "Contact us",
            "button_url": "/contact",
            "theme": "light",
        },
    },
]

PAGES = [
    {"slug": "home", "title": "Home", "home": True, "sections": HOME_SECTIONS},
    {"slug": "about", "title": "About", "sections": ABOUT_SECTIONS},
    {
        "slug": "contact",
        "title": "Contact",
        "sections": [{"type": "contact", "data": {"heading": "Contact us", "extra": DEMO_NOTICE}}],
    },
    {"slug": "terms", "title": "Terms of service", "sections": _legal("Terms of service")},
    {"slug": "privacy", "title": "Privacy policy", "sections": _legal("Privacy policy")},
]

# Earlier seeds' content, upgraded only while it is still exactly as seeded.
PREVIOUS_SECTIONS = {
    "home": [
        [
            {
                "type": "hero",
                "data": {
                    "eyebrow": "Demo content",
                    "heading": "Learn engineering, programming and AI online",
                    "subheading": "Replace this banner from Admin → Pages before launch.",
                    "primary_cta_label": "Create an account",
                    "primary_cta_url": "/register",
                    "secondary_cta_label": "Read the blog",
                    "secondary_cta_url": "/blog",
                },
            },
            {
                "type": "features",
                "data": {
                    "heading": "What the platform supports",
                    "intro": "Describe your actual offering here.",
                    "items": [
                        {"icon": "video", "title": "Recorded lessons", "text": "Self-paced video courses."},
                        {"icon": "users", "title": "Live classes", "text": "Scheduled sessions on Meet or Zoom."},
                        {"icon": "clipboard-check", "title": "Exam practice", "text": "Timed MCQ tests with results."},
                    ],
                },
            },
            {
                "type": "faq",
                "data": {
                    "heading": "Frequently asked questions",
                    "items": [
                        {
                            "question": "Is this real content?",
                            "answer": "<p>No. This FAQ is demo content; replace it with real answers.</p>",
                        }
                    ],
                },
            },
            {
                "type": "cta",
                "data": {
                    "heading": "Questions about a course?",
                    "text": "Get in touch with the team.",
                    "button_label": "Contact us",
                    "button_url": "/contact",
                },
            },
        ]
    ],
    "about": [[{"type": "rich_text", "data": {"heading": "About Hexacademy Nepal", "body": DEMO_NOTICE}}]],
}

MENUS = {
    "header": (
        "Main navigation",
        [("Courses", "/courses"), ("Blog", "/blog"), ("About", "about"), ("Contact", "contact")],
    ),
    "footer": (
        "Footer",
        [("Courses", "/courses"), ("About", "about"), ("Blog", "/blog"), ("Contact", "contact")],
    ),
    "legal": ("Legal", [("Terms of service", "terms"), ("Privacy policy", "privacy")]),
}
PREVIOUS_MENUS = {
    "header": [[("About", "about"), ("Blog", "/blog"), ("Contact", "contact")]],
    "footer": [[("About", "about"), ("Blog", "/blog"), ("Contact", "contact")]],
}

BLOG_CATEGORIES = [
    ("exam-preparation", "Exam preparation"),
    ("platform-guides", "Platform guides"),
]

POSTS = [
    {
        "slug": "demo-ioe-msc-entrance-exam-pattern",
        "title": "IOE MSc entrance: exam pattern and Section A syllabus (Demo)",
        "excerpt": "Demo post: how the TU IOE MSc entrance is publicly described, and what Section A covers.",
        "category": "exam-preparation",
        "body": (
            "<p><strong>Demo post.</strong> Created by the setup script; review or replace it before launch. "
            "The pattern below is summarised from public sources, not from an official IOE document. Check the "
            "current entrance notice before relying on it.</p>"
            "<h2>Format</h2>"
            "<p>The entrance is described as a computer-based multiple-choice test of 100 marks in 2 hours, in "
            "English. Each wrong answer deducts 10% of that question's marks, and non-programmable calculators "
            "are allowed.</p>"
            "<h2>Section A (50 marks, all streams)</h2>"
            "<ul><li>Critical reasoning: 5 questions × 2 marks</li>"
            "<li>Mathematics: 40 questions × 1 mark</li></ul>"
            "<p>The mathematics questions are described as covering basic mathematics (3), algebra including "
            "matrices and eigenvalues (8), vector analysis (6), calculus and differential equations (12), "
            "statistics and probability (3), trigonometry and logarithms (4), and Laplace transforms and "
            "Fourier series (4).</p>"
            "<h2>Section B (50 marks, by stream)</h2>"
            "<p>Fifty one-mark questions from the candidate's chosen stream at bachelor's level. We have not "
            "seeded Section B practice because we could not verify its current syllabus.</p>"
            '<p>Try the free <a href="/dashboard/exams">Section A practice test (demo)</a>.</p>'
            "<h2>Sources</h2>" + IOE_SOURCES
        ),
    },
    {
        "slug": "demo-how-practice-tests-work",
        "title": "How practice tests work on Hexacademy (Demo)",
        "excerpt": "Demo post: timing, autosave, negative marking and results in the exam engine.",
        "category": "platform-guides",
        "body": (
            "<p><strong>Demo post.</strong> Created by the setup script; edit it to match your exams.</p>"
            "<h2>Timing</h2><p>When you start, the server records your deadline. The countdown on screen "
            "follows that deadline, so changing your device clock does not add time.</p>"
            "<h2>Saving answers</h2><p>Each answer is saved as you choose it. If the page reloads or your "
            "connection drops, reopen the test to continue where you left off.</p>"
            "<h2>Marking</h2><p>Where an exam uses negative marking, a wrong answer deducts the marks shown "
            "for that question; an unanswered question scores zero.</p>"
            "<h2>Results</h2><p>Practice tests can show your score, correct answers and explanations as soon as "
            "you submit. Formal exams may release results later.</p>"
        ),
    },
    {
        "slug": "demo-weekly-plan-engineering-mathematics",
        "title": "A weekly revision plan for engineering mathematics (Demo)",
        "excerpt": "Demo post: one way to split entrance-level mathematics revision across a week.",
        "category": "exam-preparation",
        "body": (
            "<p><strong>Demo post.</strong> Created by the setup script; replace it with your own advice.</p>"
            "<ul><li>Monday: matrices, determinants and eigenvalues</li>"
            "<li>Tuesday: vector algebra, gradient, divergence and curl</li>"
            "<li>Wednesday: limits, derivatives and partial derivatives</li>"
            "<li>Thursday: integration and differential equations</li>"
            "<li>Friday: Laplace transforms and Fourier series</li>"
            "<li>Saturday: probability, statistics, trigonometry and logarithms</li>"
            "<li>Sunday: a timed practice test, then review every wrong answer</li></ul>"
        ),
    },
]


def _content(sections: list[dict]) -> list[tuple]:
    """Sections without their generated ids, for comparing with seeded content."""
    return [(s["type"], s.get("hidden", False), s["data"]) for s in sections]


def _menu_entries(menu: Menu) -> list[tuple[str, str]]:
    return [
        (item.label, item.page.slug if item.page_id else item.url)
        for item in menu.items.filter(parent=None).select_related("page").order_by("position")
    ]


class Command(BaseCommand):
    help = "Create demo CMS pages, menus, posts and site settings without overwriting existing content."

    @transaction.atomic
    def handle(self, *args, **options):
        settings = SiteSettings.load()
        blank = {k: v for k, v in SETTINGS.items() if not getattr(settings, k)}
        if blank:
            services.update_site_settings(data=blank, actor=None)
        self.stdout.write(f"Site settings: filled {len(blank)} empty field(s).")

        pages = {spec["slug"]: self._page(spec) for spec in PAGES}
        home = pages["home"]
        if not Page.objects.filter(is_home=True).exists() and home.status == Page.Status.PUBLISHED:
            services.set_home_page(home, actor=None)

        for location, (title, entries) in MENUS.items():
            menu = Menu.objects.filter(location=location).first()
            upgrade = bool(menu and menu.items.exists())
            if upgrade and _menu_entries(menu) not in PREVIOUS_MENUS.get(location, []):
                continue
            items = [
                {"label": label, "url": target} if target.startswith("/") else {"label": label, "page": pages[target]}
                for label, target in entries
            ]
            services.replace_menu(location, title=title, items=items, actor=None)
            self.stdout.write(f"Menu {location}: {'upgraded untouched demo menu' if upgrade else 'created'}.")

        self._posts()
        self.stdout.write(self.style.SUCCESS("CMS seed complete."))

    def _page(self, spec: dict) -> Page:
        sections = clean_sections(spec["sections"])
        page = Page.objects.filter(slug=spec["slug"]).select_related("published_version").first()
        if page is None:
            page = services.create_page(
                data={"title": spec["title"], "slug": spec["slug"], "sections": sections}, actor=None
            )
            self.stdout.write(f"Page /{spec['slug']}: created and published.")
            return services.publish_page(page, actor=None)
        previous = [_content(clean_sections(s)) for s in PREVIOUS_SECTIONS.get(spec["slug"], [])]
        published = _content(page.published_version.sections) if page.published_version else None
        if _content(page.sections) in previous and published in previous and page.status == Page.Status.PUBLISHED:
            page = services.update_page(page, data={"sections": sections}, actor=None, note="Demo content upgrade")
            page = services.publish_page(page, actor=None)
            self.stdout.write(f"Page /{spec['slug']}: upgraded untouched demo content.")
        return page

    def _posts(self):
        categories = {
            slug: BlogCategory.objects.get_or_create(slug=slug, defaults={"name": name})[0]
            for slug, name in BLOG_CATEGORIES
        }
        for spec in POSTS:
            if BlogPost.objects.filter(slug=spec["slug"]).exists():
                continue
            post = BlogPost.objects.create(
                slug=spec["slug"], title=spec["title"], excerpt=spec["excerpt"], body=clean_rich_text(spec["body"])
            )
            post.categories.add(categories[spec["category"]])
            services.publish_post(post, actor=None)
            self.stdout.write(f"Post {spec['slug']}: created and published.")
