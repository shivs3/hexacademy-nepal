from smtplib import SMTPException

from celery import shared_task

from . import services


@shared_task(name="apps.commerce.tasks.reconcile_pending_payments", ignore_result=True)
def reconcile_pending_payments() -> int:
    return services.reconcile_pending_payments()


@shared_task(name="apps.commerce.tasks.expire_stale_orders", ignore_result=True)
def expire_stale_orders() -> int:
    return services.expire_stale_orders()


@shared_task(
    name="apps.commerce.tasks.send_access_request_email",
    ignore_result=True,
    autoretry_for=(SMTPException, OSError),
    retry_backoff=30,
    retry_backoff_max=600,
    max_retries=6,
)
def send_access_request_email(request_id: int) -> bool:
    from . import access_requests

    return access_requests.deliver_email(request_id)
