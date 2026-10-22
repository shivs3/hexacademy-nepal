"""Khalti ePayment (KPG-2), per https://docs.khalti.com/khalti-epayment/.

- initiate: POST {base}epayment/initiate/ with amount in paisa; returns pidx and payment_url.
- lookup:   POST {base}epayment/lookup/ {pidx}; only status "Completed" is a success.
Authentication is the merchant secret key in `Authorization: Key <secret>`.
Khalti sends the learner back to return_url with query parameters, which are
ignored here: the lookup API is the only authority. There are no webhooks.
"""

from datetime import datetime
from decimal import Decimal

from django.conf import settings
from django.utils.dateparse import parse_datetime

from .base import Initiation, PaymentProvider, ProviderError, Verification
from .http import request_json

STATUS_MAP = {
    "Completed": "completed",
    "Pending": "pending",
    "Initiated": "pending",
    "Expired": "expired",
    "User canceled": "cancelled",
    "Refunded": "refunded",
    "Partially Refunded": "refunded",
}


def to_paisa(amount: Decimal) -> int:
    return int((amount * 100).to_integral_exact())


class KhaltiProvider(PaymentProvider):
    key = "khalti"
    label = "Khalti"
    min_amount = Decimal("10.00")  # Khalti rejects totals below Rs 10

    @property
    def _config(self) -> dict:
        return settings.PAYMENTS["KHALTI"]

    def is_configured(self) -> bool:
        return bool(self._config["SECRET_KEY"] and self._config["BASE_URL"])

    def _post(self, path: str, body: dict) -> tuple[int, dict]:
        base = self._config["BASE_URL"].rstrip("/") + "/"
        headers = {"Authorization": f"Key {self._config['SECRET_KEY']}"}
        return request_json("POST", base + path, headers=headers, body=body)

    def initiate(self, payment, *, return_url: str, website_url: str) -> Initiation:
        order = payment.order
        body = {
            "return_url": return_url,
            "website_url": website_url,
            "amount": to_paisa(payment.amount),
            "purchase_order_id": payment.reference,
            "purchase_order_name": f"Hexacademy order {order.number}",
            "customer_info": {"name": order.user.full_name or order.user.email, "email": order.user.email},
        }
        status, data = self._post("epayment/initiate/", body)
        if status != 200 or not data.get("pidx") or not data.get("payment_url"):
            raise ProviderError(f"Khalti did not start the payment ({data.get('error_key') or status}).")
        expires = parse_datetime(data["expires_at"]) if isinstance(data.get("expires_at"), str) else None
        return Initiation(
            kind="redirect",
            url=data["payment_url"],
            provider_reference=data["pidx"],
            expires_at=expires if isinstance(expires, datetime) else None,
            data={"pidx": data["pidx"], "expires_at": data.get("expires_at")},
        )

    def verify(self, payment) -> Verification:
        if not payment.provider_reference:
            return Verification(status="not_found", amount=None)
        status, data = self._post("epayment/lookup/", {"pidx": payment.provider_reference})
        raw = data.get("status")
        if not isinstance(raw, str) or (status != 200 and raw not in STATUS_MAP):
            raise ProviderError(f"Khalti lookup failed ({data.get('error_key') or status}).")
        total = data.get("total_amount")
        amount = Decimal(int(total)) / 100 if isinstance(total, int) else None
        return Verification(
            status=STATUS_MAP.get(raw, "pending"),
            amount=amount,
            transaction_id=str(data.get("transaction_id") or ""),
            raw_status=raw,
            data={k: data.get(k) for k in ("pidx", "status", "total_amount", "transaction_id", "fee", "refunded")},
        )
