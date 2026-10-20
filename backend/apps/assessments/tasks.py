from celery import shared_task

from . import attempts


@shared_task(name="apps.assessments.tasks.expire_overdue_attempts", ignore_result=True)
def expire_overdue_attempts() -> int:
    return attempts.expire_overdue_attempts()
