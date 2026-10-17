from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError

from apps.accounts import roles
from apps.audit import services as audit


class Command(BaseCommand):
    help = "Grant or revoke a role from the command line (the only way to grant super_admin)."

    def add_arguments(self, parser):
        parser.add_argument("email")
        parser.add_argument("--role", required=True, choices=roles.ALL_ROLE_SLUGS)
        parser.add_argument("--revoke", action="store_true")

    def handle(self, email, role, revoke, **options):
        User = get_user_model()  # noqa: N806
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f"No user with email {email}.")
        if role == roles.SUPER_ADMIN:
            user.is_superuser = not revoke
            user.is_staff = not revoke
            user.save(update_fields=["is_superuser", "is_staff"])
        else:
            group, _ = Group.objects.get_or_create(name=roles.group_name(role))
            (user.groups.remove if revoke else user.groups.add)(group)
        audit.record("account.role_revoked_cli" if revoke else "account.role_granted_cli", target=user, role=role)
        self.stdout.write(self.style.SUCCESS(f"{'Revoked' if revoke else 'Granted'} {role} for {user.email}."))
