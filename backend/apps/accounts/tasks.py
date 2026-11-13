"""Account emails go out from the worker, so a slow or failing mail server never blocks a request."""

from smtplib import SMTPException

from celery import shared_task
from django.contrib.auth import get_user_model

RETRYABLE = (SMTPException, OSError)  # OSError covers timeouts and refused connections


@shared_task(
    name="apps.accounts.tasks.send_verification_email",
    ignore_result=True,
    autoretry_for=RETRYABLE,
    retry_backoff=30,
    retry_backoff_max=600,
    max_retries=6,
)
def send_verification_email(user_id: int) -> None:
    from . import services

    user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
    if user is not None and not user.email_verified:
        services.deliver_verification_email(user)


@shared_task(
    name="apps.accounts.tasks.send_password_reset_email",
    ignore_result=True,
    autoretry_for=RETRYABLE,
    retry_backoff=30,
    retry_backoff_max=300,
    max_retries=4,
)
def send_password_reset_email(user_id: int) -> None:
    from . import services

    user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
    if user is not None:
        services.deliver_password_reset(user)
