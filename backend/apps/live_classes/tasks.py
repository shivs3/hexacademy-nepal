from celery import shared_task

from . import services


@shared_task(name="apps.live_classes.tasks.send_class_reminders", ignore_result=True)
def send_class_reminders() -> int:
    return services.send_due_reminders()
