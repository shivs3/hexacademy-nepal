from celery import shared_task

from . import services


@shared_task(name="apps.commerce.tasks.reconcile_pending_payments", ignore_result=True)
def reconcile_pending_payments() -> int:
    return services.reconcile_pending_payments()


@shared_task(name="apps.commerce.tasks.expire_stale_orders", ignore_result=True)
def expire_stale_orders() -> int:
    return services.expire_stale_orders()
