"""A local stand-in for a payment gateway, for development and automated tests.

It keeps its "gateway-side" state in SandboxCharge, sends the learner to a
clearly labelled test page in the frontend, and is verified the same way as a
real gateway: by asking the provider (here, reading SandboxCharge) rather than
trusting the browser. Production settings refuse to start with it enabled.
"""

import secrets

from django.conf import settings

from .base import Initiation, PaymentProvider, Verification

STATUS_MAP = {"initiated": "pending", "completed": "completed", "cancelled": "cancelled"}


class SandboxProvider(PaymentProvider):
    key = "sandbox"
    label = "Test payment (sandbox)"

    def is_configured(self) -> bool:
        return bool(settings.PAYMENTS["ENABLE_SANDBOX_PROVIDER"])

    def initiate(self, payment, *, return_url: str, website_url: str) -> Initiation:
        from ..models import SandboxCharge

        charge = SandboxCharge.objects.create(
            token=f"sbx_{secrets.token_hex(12)}", payment=payment, amount=payment.amount
        )
        return Initiation(
            kind="redirect",
            url=f"{settings.FRONTEND_URL}/checkout/sandbox/{payment.reference}",
            provider_reference=charge.token,
            data={"token": charge.token},
        )

    def verify(self, payment) -> Verification:
        from ..models import SandboxCharge

        charge = SandboxCharge.objects.filter(payment=payment).first()
        if charge is None:
            return Verification(status="not_found", amount=None)
        return Verification(
            status=STATUS_MAP[charge.status],
            amount=charge.amount,
            transaction_id=charge.transaction_id,
            raw_status=charge.status,
            data={"token": charge.token, "status": charge.status, "amount": str(charge.amount)},
        )
