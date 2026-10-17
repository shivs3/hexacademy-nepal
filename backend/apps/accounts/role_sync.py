from django.contrib.auth.models import Group, Permission

from . import roles


def sync_roles(*, strict: bool = False) -> list[str]:
    """Create/update a Group per role with exactly the mapped permissions.

    Returns permission strings that could not be found. With strict=True a
    missing permission raises, which catches typos in roles.py.
    """
    missing: list[str] = []
    for role in roles.ROLES.values():
        group, _ = Group.objects.get_or_create(name=role.name)
        perms = []
        for dotted in role.permissions:
            app_label, codename = dotted.split(".", 1)
            perm = Permission.objects.filter(content_type__app_label=app_label, codename=codename).first()
            if perm is None:
                missing.append(dotted)
                continue
            perms.append(perm)
        group.permissions.set(perms)
    if strict and missing:
        raise LookupError(f"Unknown permissions in role map: {', '.join(sorted(set(missing)))}")
    return missing


def sync_roles_after_migrate(**kwargs):
    # Runs after each app's post_migrate; permissions of later apps appear progressively.
    sync_roles(strict=False)
