from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"

    def ready(self):
        from django.db.models.signals import post_migrate

        from .role_sync import sync_roles_after_migrate

        post_migrate.connect(sync_roles_after_migrate, dispatch_uid="accounts.sync_roles")
