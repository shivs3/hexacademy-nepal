from django.apps import AppConfig


class CatalogConfig(AppConfig):
    name = "apps.catalog"
    label = "catalog"
    verbose_name = "Course catalog"

    def ready(self):
        from . import cms_sections

        cms_sections.register()
