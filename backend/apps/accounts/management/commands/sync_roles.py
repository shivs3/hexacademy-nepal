from django.core.management.base import BaseCommand, CommandError

from apps.accounts.role_sync import sync_roles


class Command(BaseCommand):
    help = "Create or update role groups and their permissions from apps.accounts.roles."

    def handle(self, *args, **options):
        try:
            sync_roles(strict=True)
        except LookupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS("Roles synchronised."))
