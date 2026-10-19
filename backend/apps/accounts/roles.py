"""Role definitions.

Roles are implemented as Django Groups so the standard permission machinery
(`user.has_perm`) is the single source of truth. This module is the canonical
mapping of role -> capability permissions; `manage.py sync_roles` applies it.

Object-level rules (e.g. an instructor may only edit courses they teach) are
enforced separately in each domain's policy/service layer.

The super administrator role is not a group: it maps to `is_superuser` and can
only be granted from the command line (`manage.py grant_role --role super_admin`),
and every grant is written to the audit log.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Role:
    slug: str
    name: str
    description: str
    permissions: tuple[str, ...]
    staff: bool = True  # whether the role can open the staff dashboard


SUPER_ADMIN = "super_admin"
CONTENT_EDITOR = "content_editor"
INSTRUCTOR = "instructor"
TEACHING_ASSISTANT = "teaching_assistant"
FINANCE_MANAGER = "finance_manager"
SUPPORT_STAFF = "support_staff"
STUDENT = "student"

_ADMIN_PANEL = "accounts.access_admin_panel"

ROLES: dict[str, Role] = {
    CONTENT_EDITOR: Role(
        CONTENT_EDITOR,
        "Content Editor",
        "Manages website pages, blog, media, navigation and the public course catalog.",
        (
            _ADMIN_PANEL,
            "cms.manage_pages",
            "cms.publish_pages",
            "cms.manage_media",
            "cms.manage_menus",
            "cms.manage_site_settings",
            "cms.manage_blog",
            "cms.publish_blog",
            "cms.view_newsletter_subscribers",
            "catalog.manage_catalog",
            "catalog.publish_courses",
        ),
    ),
    INSTRUCTOR: Role(
        INSTRUCTOR,
        "Instructor",
        "Authors and teaches assigned courses, exams and live classes.",
        (_ADMIN_PANEL, "catalog.author_assigned_courses"),
    ),
    TEACHING_ASSISTANT: Role(
        TEACHING_ASSISTANT,
        "Teaching Assistant",
        "Supports instructors on assigned courses: reviews submissions and attendance.",
        (_ADMIN_PANEL,),
    ),
    FINANCE_MANAGER: Role(
        FINANCE_MANAGER,
        "Finance Manager",
        "Manages orders, payment verification, refunds, coupons and revenue reports.",
        (_ADMIN_PANEL,),
    ),
    SUPPORT_STAFF: Role(
        SUPPORT_STAFF,
        "Support Staff",
        "Helps learners: views accounts and orders, can activate or deactivate accounts.",
        (
            _ADMIN_PANEL,
            "accounts.view_user_directory",
            "accounts.manage_user_status",
            "learning.manage_enrollments",
            "learning.view_learner_progress",
        ),
    ),
    STUDENT: Role(STUDENT, "Student", "Learner account.", (), staff=False),
}

ASSIGNABLE_ROLES = tuple(ROLES.keys())
ALL_ROLE_SLUGS = (SUPER_ADMIN, *ASSIGNABLE_ROLES)


def group_name(slug: str) -> str:
    return ROLES[slug].name


def role_slugs_for(user) -> list[str]:
    if not user or not user.is_authenticated:
        return []
    by_name = {r.name: r.slug for r in ROLES.values()}
    slugs = [by_name[name] for name in user.groups.values_list("name", flat=True) if name in by_name]
    if user.is_superuser:
        slugs.insert(0, SUPER_ADMIN)
    return slugs
