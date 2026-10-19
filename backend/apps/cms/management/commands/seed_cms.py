"""Seed demo CMS content for development and first-run installs.

Idempotent: existing pages, non-empty menus and already-filled settings are left
untouched, so running it again never overwrites an administrator's edits. Every
seeded page carries a visible "demo content" notice until it is replaced.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.cms import services
from apps.cms.models import Menu, Page, SiteSettings
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


PAGES = [
    {
        "slug": "home",
        "title": "Home",
        "home": True,
        "sections": [
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
        ],
    },
    {
        "slug": "about",
        "title": "About",
        "sections": [{"type": "rich_text", "data": {"heading": "About Hexacademy Nepal", "body": DEMO_NOTICE}}],
    },
    {
        "slug": "contact",
        "title": "Contact",
        "sections": [{"type": "contact", "data": {"heading": "Contact us", "extra": DEMO_NOTICE}}],
    },
    {"slug": "terms", "title": "Terms of service", "sections": _legal("Terms of service")},
    {"slug": "privacy", "title": "Privacy policy", "sections": _legal("Privacy policy")},
]

MENUS = {
    "header": ("Main navigation", [("About", "about"), ("Blog", "/blog"), ("Contact", "contact")]),
    "footer": ("Footer", [("About", "about"), ("Blog", "/blog"), ("Contact", "contact")]),
    "legal": ("Legal", [("Terms of service", "terms"), ("Privacy policy", "privacy")]),
}


class Command(BaseCommand):
    help = "Create demo CMS pages, menus and site settings without overwriting existing content."

    @transaction.atomic
    def handle(self, *args, **options):
        settings = SiteSettings.load()
        blank = {k: v for k, v in SETTINGS.items() if not getattr(settings, k)}
        if blank:
            services.update_site_settings(data=blank, actor=None)
        self.stdout.write(f"Site settings: filled {len(blank)} empty field(s).")

        pages = {}
        for spec in PAGES:
            page = Page.objects.filter(slug=spec["slug"]).first()
            if page is None:
                page = services.create_page(
                    data={"title": spec["title"], "slug": spec["slug"], "sections": clean_sections(spec["sections"])},
                    actor=None,
                )
                page = services.publish_page(page, actor=None)
                self.stdout.write(f"Page /{spec['slug']}: created and published.")
            pages[spec["slug"]] = page
            if spec.get("home") and not Page.objects.filter(is_home=True).exists() and page.status == "published":
                services.set_home_page(page, actor=None)

        for location, (title, entries) in MENUS.items():
            menu = Menu.objects.filter(location=location).first()
            if menu and menu.items.exists():
                continue
            items = [
                {"label": label, "url": target} if target.startswith("/") else {"label": label, "page": pages[target]}
                for label, target in entries
            ]
            services.replace_menu(location, title=title, items=items, actor=None)
            self.stdout.write(f"Menu {location}: created.")

        self.stdout.write(self.style.SUCCESS("CMS seed complete."))
