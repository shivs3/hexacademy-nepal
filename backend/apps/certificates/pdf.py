"""Render a certificate as a landscape A4 PDF with reportlab.

Rendered on request from the certificate's snapshot fields, so nothing is
stored. Only plain text from the database is drawn (no markup is parsed).
"""

from io import BytesIO

from django.conf import settings
from django.utils import timezone
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from .models import Certificate

NAVY = HexColor("#102A43")
TEAL = HexColor("#0A8BA7")
MINT = HexColor("#14B8A6")
TEXT = HexColor("#1F2937")
MUTED = HexColor("#52606D")


def verify_url(cert: Certificate) -> str:
    return f"{settings.FRONTEND_URL}/certificates/verify/{cert.number}"


def _fit(c: canvas.Canvas, text: str, font: str, size: float, max_width: float) -> float:
    while size > 10 and c.stringWidth(text, font, size) > max_width:
        size -= 1
    return size


def render(cert: Certificate, site_name: str = "Hexacademy Nepal") -> bytes:
    buf = BytesIO()
    width, height = landscape(A4)
    c = canvas.Canvas(buf, pagesize=(width, height))
    c.setTitle(f"{cert.template.heading} – {cert.course_title}")
    c.setAuthor(site_name)
    c.setSubject(f"Certificate {cert.number}")

    # Frame
    c.setStrokeColor(NAVY)
    c.setLineWidth(3)
    c.rect(12 * mm, 12 * mm, width - 24 * mm, height - 24 * mm)
    c.setStrokeColor(TEAL)
    c.setLineWidth(0.8)
    c.rect(16 * mm, 16 * mm, width - 32 * mm, height - 32 * mm)
    c.setFillColor(MINT)
    c.rect(16 * mm, height - 22 * mm, width - 32 * mm, 6 * mm, stroke=0, fill=1)

    cx = width / 2
    max_w = width - 60 * mm
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(cx, height - 42 * mm, site_name.upper())

    heading = cert.template.heading
    c.setFillColor(NAVY)
    size = _fit(c, heading, "Times-Bold", 34, max_w)
    c.setFont("Times-Bold", size)
    c.drawCentredString(cx, height - 62 * mm, heading)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 13)
    c.drawCentredString(cx, height - 80 * mm, "This is to certify that")

    c.setFillColor(TEXT)
    size = _fit(c, cert.recipient_name, "Times-BoldItalic", 30, max_w)
    c.setFont("Times-BoldItalic", size)
    c.drawCentredString(cx, height - 98 * mm, cert.recipient_name)
    c.setStrokeColor(TEAL)
    c.setLineWidth(0.6)
    c.line(cx - 80 * mm, height - 102 * mm, cx + 80 * mm, height - 102 * mm)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 13)
    c.drawCentredString(cx, height - 114 * mm, cert.template.statement)

    c.setFillColor(NAVY)
    size = _fit(c, cert.course_title, "Helvetica-Bold", 22, max_w)
    c.setFont("Helvetica-Bold", size)
    c.drawCentredString(cx, height - 128 * mm, cert.course_title)

    issued = timezone.localtime(cert.issued_at).strftime("%d %B %Y")
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 11)
    c.drawString(30 * mm, 42 * mm, f"Issued on {issued}")
    c.drawString(30 * mm, 36 * mm, f"Certificate no. {cert.number}")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8.5)
    c.drawString(30 * mm, 30 * mm, f"Verify at {verify_url(cert)}")

    if cert.template.signatory_name:
        sx = width - 30 * mm
        c.setStrokeColor(NAVY)
        c.line(sx - 70 * mm, 46 * mm, sx, 46 * mm)
        c.setFillColor(TEXT)
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(sx, 40 * mm, cert.template.signatory_name)
        if cert.template.signatory_title:
            c.setFont("Helvetica", 10)
            c.setFillColor(MUTED)
            c.drawRightString(sx, 34 * mm, cert.template.signatory_title)

    if cert.template.footer_note:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Oblique", 9)
        c.drawCentredString(cx, 22 * mm, cert.template.footer_note[:200])

    if cert.status == Certificate.Status.REVOKED:
        c.saveState()
        c.setFillColor(HexColor("#B91C1C"))
        c.setFont("Helvetica-Bold", 60)
        c.translate(cx, height / 2)
        c.rotate(20)
        c.drawCentredString(0, 0, "REVOKED")
        c.restoreState()

    c.showPage()
    c.save()
    return buf.getvalue()
