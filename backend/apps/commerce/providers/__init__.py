"""Payment provider registry. Bank transfer is not a gateway: it is handled by
services (learner submits details, finance approves) and has no provider class."""

from .base import Initiation, PaymentProvider, ProviderError, Verification
from .esewa import EsewaProvider
from .khalti import KhaltiProvider
from .sandbox import SandboxProvider

GATEWAYS: dict[str, PaymentProvider] = {p.key: p for p in (KhaltiProvider(), EsewaProvider(), SandboxProvider())}


def get_gateway(key: str) -> PaymentProvider | None:
    return GATEWAYS.get(key)


__all__ = ["GATEWAYS", "Initiation", "PaymentProvider", "ProviderError", "Verification", "get_gateway"]
