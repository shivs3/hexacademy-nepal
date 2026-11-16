"""Background work for the catalog: rendering lesson PDFs into page images."""

from celery import shared_task


@shared_task(
    bind=True,
    name="apps.catalog.tasks.render_resource_pages",
    ignore_result=True,
    max_retries=3,
    acks_late=True,
)
def render_resource_pages(self, resource_id: int) -> None:
    from . import resources

    try:
        resources.render_resource(resource_id)
    except OSError as exc:  # storage or network trouble: try again, then give up visibly
        if self.request.retries >= self.max_retries:
            resources.mark_render_failed(resource_id)
            raise
        raise self.retry(exc=exc, countdown=30 * 2**self.request.retries) from exc
    except Exception:
        resources.mark_render_failed(resource_id)
        raise
