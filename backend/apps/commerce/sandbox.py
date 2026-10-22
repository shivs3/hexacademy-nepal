"""Sandbox gateway controls and its signed webhook.

The webhook mirrors how a real gateway notification must be handled: the
signature and timestamp are checked, each event id is accepted once, and the
payload is only a hint to re-verify. Payment state still comes from
`services.verify_payment`, never from the webhook body.

Signature: hex HMAC-SHA256(PAYMENTS_SANDBOX_SECRET, "<timestamp>.<raw body>"),
sent as `X-Sandbox-Signature`, with the Unix timestamp in `X-Sandbox-Timestamp`.
"""

import hashlib
import hmac
import json
import secrets
import time

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from common.exceptions import ConflictError, DomainError

from . import services
from .models import Payment, SandboxCharge, WebhookEvent

TOLERANCE_SECONDS = 300


def enabled() -> bool:
    return bool(settings.PAYMENTS["ENABLE_SANDBOX_PROVIDER"])


def sign(body: bytes, timestamp: str, secret: str | None = None) -> str:
    key = (secret if secret is not None else settings.PAYMENTS["SANDBOX_SECRET"]).encode()
    return hmac.new(key, timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


@transaction.atomic
def simulate(payment: Payment, outcome: str) -> SandboxCharge:
    """What the learner does on the test gateway page: pay or cancel."""
    charge = SandboxCharge.objects.select_for_update().filter(payment=payment).first()
    if charge is None:
        raise DomainError("No sandbox charge for this payment.", code="not_found", status_code=404)
    if charge.status != SandboxCharge.Status.INITIATED:
        raise ConflictError("This test payment has already been completed or cancelled.", code="already_processed")
    if outcome == "complete":
        charge.status, charge.transaction_id = SandboxCharge.Status.COMPLETED, f"sbxtx_{secrets.token_hex(8)}"
    else:
        charge.status = SandboxCharge.Status.CANCELLED
    charge.save(update_fields=["status", "transaction_id"])
    return charge


def handle_webhook(body: bytes, *, signature: str, timestamp: str) -> str:
    """Returns "processed", "duplicate" or "ignored"; raises DomainError for rejected deliveries."""
    secret = settings.PAYMENTS["SANDBOX_SECRET"]
    if not secret:
        raise DomainError("Webhooks are not configured.", code="not_configured", status_code=404)
    try:
        sent_at = int(timestamp)
    except (TypeError, ValueError):
        sent_at = 0
    if abs(time.time() - sent_at) > TOLERANCE_SECONDS:
        raise DomainError("Stale or missing timestamp.", code="invalid_signature", status_code=401)
    if not signature or not hmac.compare_digest(sign(body, timestamp, secret), signature):
        raise DomainError("Invalid signature.", code="invalid_signature", status_code=401)
    try:
        payload = json.loads(body or b"{}")
    except ValueError:
        raise DomainError("Malformed JSON.", code="invalid_payload") from None
    event_id, reference = str(payload.get("event_id") or ""), str(payload.get("reference") or "")
    if not event_id or not reference:
        raise DomainError("event_id and reference are required.", code="invalid_payload")

    payment = Payment.objects.filter(reference=reference, provider=Payment.Provider.SANDBOX).first()
    try:
        with transaction.atomic():
            event = WebhookEvent.objects.create(
                provider="sandbox",
                event_id=event_id[:100],
                payment=payment,
                payload={"event_id": event_id, "reference": reference},
            )
    except IntegrityError:
        return "duplicate"
    if payment is None:
        return "ignored"
    services.verify_payment(payment, source="webhook")
    WebhookEvent.objects.filter(pk=event.pk).update(processed_at=timezone.now())
    return "processed"
