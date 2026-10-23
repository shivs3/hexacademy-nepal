from celery import shared_task

from . import services


@shared_task(name="apps.notifications.tasks.send_notification_emails", ignore_result=True)
def send_notification_emails(ids: list[int]) -> int:
    return services.send_emails(ids)
