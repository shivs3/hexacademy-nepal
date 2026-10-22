"""eSewa ePay v2, per https://developer.esewa.com.np/pages/Epay.

- initiate: the browser POSTs a signed HTML form to FORM_URL.
  signature = base64(HMAC-SHA256(secret, "total_amount=..,transaction_uuid=..,product_code=..")).
- status:   GET STATUS_URL?product_code=&total_amount=&transaction_uuid=; only "COMPLETE" is a success.
The base64 response eSewa appends to success_url is ignored: the status API,
queried with values the server already knows, is the only authority.
"""

import base64
import hashlib
import hmac
from decimal import Decimal, InvalidOperation

from django.conf import settings

from .base import Initiation, PaymentProvider, ProviderError, Verification
from .http import request_json

SIGNED_FIELDS = "total_amount,transaction_uuid,product_code"
STATUS_MAP = {
    "COMPLETE": "completed",
    "PENDING": "pending",
    "AMBIGUOUS": "pending",
    "NOT_FOUND": "not_found",
    "CANCELED": "cancelled",
    "FULL_REFUND": "refunded",
    "PARTIAL_REFUND": "refunded",
}


def format_amount(amount: Decimal) -> str:
    """'1000' for whole rupees, '1000.50' otherwise. The same string is signed and sent."""
    return str(amount.quantize(Decimal(1))) if amount == amount.to_integral_value() else f"{amount:.2f}"


def sign(message: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


class EsewaProvider(PaymentProvider):
    key = "esewa"
    label = "eSewa"

    @property
    def _config(self) -> dict:
        return settings.PAYMENTS["ESEWA"]

    def is_configured(self) -> bool:
        c = self._config
        return bool(c["PRODUCT_CODE"] and c["SECRET_KEY"] and c["FORM_URL"] and c["STATUS_URL"])

    def initiate(self, payment, *, return_url: str, website_url: str) -> Initiation:
        c = self._config
        total = format_amount(payment.amount)
        message = f"total_amount={total},transaction_uuid={payment.reference},product_code={c['PRODUCT_CODE']}"
        fields = {
            "amount": total,
            "tax_amount": "0",
            "product_service_charge": "0",
            "product_delivery_charge": "0",
            "total_amount": total,
            "transaction_uuid": payment.reference,
            "product_code": c["PRODUCT_CODE"],
            "success_url": return_url,
            "failure_url": f"{return_url}?result=failed",
            "signed_field_names": SIGNED_FIELDS,
            "signature": sign(message, c["SECRET_KEY"]),
        }
        return Initiation(kind="form", url=c["FORM_URL"], fields=fields, data={"transaction_uuid": payment.reference})

    def verify(self, payment) -> Verification:
        c = self._config
        params = {
            "product_code": c["PRODUCT_CODE"],
            "total_amount": format_amount(payment.amount),
            "transaction_uuid": payment.reference,
        }
        status, data = request_json("GET", c["STATUS_URL"], params=params)
        raw = data.get("status")
        if status != 200 or not isinstance(raw, str):
            raise ProviderError(f"eSewa status check failed (HTTP {status}).")
        if data.get("transaction_uuid") not in (None, payment.reference):
            raise ProviderError("eSewa answered for a different transaction.")
        try:
            amount = Decimal(str(data["total_amount"])) if data.get("total_amount") is not None else None
        except (InvalidOperation, ValueError):
            amount = None
        return Verification(
            status=STATUS_MAP.get(raw, "pending"),
            amount=amount,
            transaction_id=str(data.get("ref_id") or ""),
            raw_status=raw,
            data={k: data.get(k) for k in ("product_code", "transaction_uuid", "total_amount", "status", "ref_id")},
        )
