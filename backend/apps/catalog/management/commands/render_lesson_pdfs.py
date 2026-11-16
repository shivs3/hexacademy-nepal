"""Render lesson PDFs that are waiting or failed, here instead of in the worker.

Useful after deploying the page viewer (existing PDFs are marked pending) or
when the worker was down. `--all` re-renders every lesson PDF.
"""

from django.core.management.base import BaseCommand

from apps.catalog import resources
from apps.catalog.models import LessonResource


class Command(BaseCommand):
    help = "Render lesson PDFs into page images (pending and failed ones, or --all)."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true", help="Re-render every lesson PDF.")

    def handle(self, *args, **options):
        pdfs = LessonResource.objects.filter(kind=LessonResource.Kind.FILE, mime_type="application/pdf")
        if not options["all"]:
            pdfs = pdfs.exclude(render_status=LessonResource.RenderStatus.READY)
        ids = list(pdfs.order_by("pk").values_list("pk", flat=True))
        for pk in ids:
            resources.render_resource(pk)
            resource = LessonResource.objects.filter(pk=pk).first()
            if resource is None:
                continue
            if resource.render_status == LessonResource.RenderStatus.READY:
                self.stdout.write(f"#{pk} {resource.title}: {resource.page_count} pages")
            else:
                self.stdout.write(self.style.WARNING(f"#{pk} {resource.title}: {resource.render_error}"))
        self.stdout.write(self.style.SUCCESS(f"Done: {len(ids)} PDF(s)."))
