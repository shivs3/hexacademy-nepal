from celery import shared_task

from . import services


@shared_task(name="apps.cms.tasks.publish_scheduled_pages", ignore_result=True)
def publish_scheduled_pages() -> int:
    return services.publish_due_pages()
