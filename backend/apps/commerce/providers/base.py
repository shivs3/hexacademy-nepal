"""Provider interface.

A provider turns a Payment into something the browser can follow (a redirect
or an auto-submitted form) and, later, asks the provider's own API whether the
payment really completed. Nothing a browser sends back is trusted: only
`verify()` results drive order state.
"""

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Literal

VerifiedStatus = Literal["completed", "pending", "failed", "cancelled", "expired", "refunded", "not_found"]


class ProviderError(Exception):
    """The provider could not be reached or refused the request. Messages are
    safe to log and show to staff; they never contain credentials."""


@dataclass(frozen=True)
class Initiation:
    kind: Literal["redirect", "form", "none"]
    url: str = ""
    fields: dict[str, str] = field(default_factory=dict)
    provider_reference: str | None = None
    expires_at: datetime | None = None
    data: dict = field(default_factory=dict)  # sanitised provider response, for the event log


@dataclass(frozen=True)
class Verification:
    status: VerifiedStatus
    amount: Decimal | None  # in rupees, as reported by the provider
    transaction_id: str = ""
    raw_status: str = ""
    data: dict = field(default_factory=dict)


class PaymentProvider:
    key: str = ""
    label: str = ""
    # Smallest total the provider accepts, in rupees.
    min_amount = Decimal("0.01")

    def is_configured(self) -> bool:
        raise NotImplementedError

    def initiate(self, payment, *, return_url: str, website_url: str) -> Initiation:
        raise NotImplementedError

    def verify(self, payment) -> Verification:
        raise NotImplementedError
