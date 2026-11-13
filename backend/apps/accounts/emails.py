"""Account emails (verification, password reset): plain text plus a simple branded HTML part.

Links carry single-purpose tokens, so the bodies are never logged.
"""

from __future__ import annotations

from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

NAVY = "#102A43"
TEAL = "#0A8BA7"
INK = "#1F2937"
MUTED = "#52606D"
PAGE = "#F5F8FC"


def site_name() -> str:
    try:
        from apps.cms.models import SiteSettings

        return SiteSettings.load().site_name or "Hexacademy Nepal"
    except Exception:  # noqa: BLE001 - an email must not fail over branding
        return "Hexacademy Nepal"


CARD = "max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E4E9F0"
BAR = f"background:{NAVY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:600"
BUTTON = (
    f"display:inline-block;background:{TEAL};color:#ffffff;text-decoration:none;"
    "font-weight:600;padding:12px 22px;border-radius:8px"
)
TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0"'


def _html(*, site: str, heading: str, paragraphs: list[str], button: str, link: str, footer: str) -> str:
    body = "".join(
        f'<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:{INK}">{escape(p)}</p>' for p in paragraphs
    )
    href = escape(link, quote=True)
    small = f"margin:0 0 8px;font-size:13px;color:{MUTED}"
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:{PAGE};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table {TABLE} style="background:{PAGE};padding:24px 12px">
<tr><td align="center">
<table {TABLE} style="{CARD}">
<tr><td style="{BAR}">{escape(site)}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:{NAVY}">{escape(heading)}</h1>
{body}
<p style="margin:24px 0"><a href="{href}" style="{BUTTON}">{escape(button)}</a></p>
<p style="{small}">If the button doesn't work, copy this link into your browser:</p>
<p style="{small};word-break:break-all"><a href="{href}" style="color:{TEAL}">{escape(link)}</a></p>
<p style="{small};margin-top:16px">{escape(footer)}</p>
</td></tr></table>
</td></tr></table>
</body></html>"""


def _send(*, to: str, subject: str, greeting: str, paragraphs: list[str], button: str, link: str, footer: str):
    site = site_name()
    text = "\n\n".join([greeting, *paragraphs, link, footer, f"— {site}"])
    msg = EmailMultiAlternatives(subject=subject, body=text, from_email=settings.DEFAULT_FROM_EMAIL, to=[to])
    msg.attach_alternative(
        _html(site=site, heading=subject, paragraphs=[greeting, *paragraphs], button=button, link=link, footer=footer),
        "text/html",
    )
    msg.send()


def send_verification(user, link: str) -> None:
    days = settings.EMAIL_VERIFICATION_TIMEOUT.days
    _send(
        to=user.email,
        subject=f"Verify your email for {site_name()}",
        greeting=f"Hello {user.get_short_name()},",
        paragraphs=[
            "Please confirm that this is your email address. You need a verified email to buy courses, "
            "enroll and take exams, and to receive class reminders and certificates.",
        ],
        button="Verify my email",
        link=link,
        footer=f"This link works for {days} days. If you did not create an account, you can ignore this email.",
    )


def send_password_reset(user, link: str) -> None:
    _send(
        to=user.email,
        subject=f"Reset your {site_name()} password",
        greeting=f"Hello {user.get_short_name()},",
        paragraphs=["We received a request to reset your password. Use the button below to choose a new one."],
        button="Choose a new password",
        link=link,
        footer="This link works for 2 hours. If you did not ask for this, you can ignore this email; "
        "your password stays the same.",
    )
