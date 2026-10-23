"""Create notifications and, optionally, email them.

Email goes only to active accounts with a verified address, after the
surrounding transaction commits, through a Celery task (eager when no broker
is configured). A failed email never undoes the in-app notice.
"""

import logging
from collections.abc import Iterable

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .models import Notification

logger = logging.getLogger(__name__)


def notify(users: Iterable, *, kind: str, title: str, body: str = "", link: str = "", email: bool = False):
    """One notification per distinct user. Returns the created rows."""
    seen, rows = set(), []
    for user in users:
        if user.pk in seen or not user.is_active:
            continue
        seen.add(user.pk)
        rows.append(Notification(user=user, kind=kind, title=title[:160], body=body[:500], link=link))
    created = Notification.objects.bulk_create(rows)
    if email and created:
        ids = [n.pk for n in created]
        transaction.on_commit(lambda: _queue_emails(ids))
    return created


def _queue_emails(ids: list[int]):
    from .tasks import send_notification_emails

    try:
        send_notification_emails.delay(ids)
    except Exception:  # broker down: the in-app notice still stands
        logger.exception("Could not queue %d notification emails", len(ids))


def send_emails(ids: list[int]) -> int:
    sent = 0
    qs = Notification.objects.filter(pk__in=ids, emailed_at__isnull=True).select_related("user")
    for n in qs:
        user = n.user
        if not (user.is_active and user.email_verified_at):
            continue
        link = f"\n\n{settings.FRONTEND_URL}{n.link}" if n.link else ""
        try:
            send_mail(
                subject=n.title,
                message=f"Hello {user.get_short_name()},\n\n{n.body}{link}\n\n— Hexacademy Nepal",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
            )
        except Exception:
            logger.exception("Notification email %s failed", n.pk)
            continue
        Notification.objects.filter(pk=n.pk).update(emailed_at=timezone.now())
        sent += 1
    return sent


def unread_count(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


def mark_read(user, ids: list[int] | None = None) -> int:
    qs = Notification.objects.filter(user=user, read_at__isnull=True)
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    return qs.update(read_at=timezone.now())
