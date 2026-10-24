"""Server-side sanitisation and value validators for CMS content.

Rich text is cleaned with an explicit allowlist (nh3). Scripts, inline event
handlers, styles, iframes and unknown tags never survive. The frontend
sanitises again on render (defence in depth).
"""

import re
from urllib.parse import parse_qs, urlparse

import nh3
from django.core.exceptions import ValidationError

RICH_TEXT_TAGS = {
    "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark",
    "a", "ul", "ol", "li", "blockquote", "code", "pre", "hr",
    "table", "thead", "tbody", "tr", "th", "td",
    "span", "div",
}  # fmt: skip
RICH_TEXT_ATTRIBUTES = {
    "a": {"href", "title"},
    "ol": {"start"},
    "th": {"colspan", "rowspan"},
    "td": {"colspan", "rowspan"},
    "span": {"data-latex"},
    "div": {"data-latex"},
}
# Attributes restricted to fixed values (math nodes from the editor, new-tab links).
RICH_TEXT_ATTRIBUTE_VALUES = {
    "a": {"target": {"_blank"}},
    "span": {"data-type": {"inline-math"}},
    "div": {"data-type": {"block-math"}},
}
URL_SCHEMES = {"http", "https", "mailto", "tel"}


def clean_rich_text(html: str) -> str:
    if not html:
        return ""
    cleaned = nh3.clean(
        html,
        tags=RICH_TEXT_TAGS,
        clean_content_tags={"script", "style"},
        attributes=RICH_TEXT_ATTRIBUTES,
        tag_attribute_values=RICH_TEXT_ATTRIBUTE_VALUES,
        url_schemes=URL_SCHEMES,
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
    return cleaned.strip()


_MATH_WITH_CONTENT = re.compile(r'<(?:span|div)\b[^>]*\bdata-latex="[^"]*\S[^"]*"')


def rich_text_is_empty(html: str) -> bool:
    # A formula node has no text between its tags, but it is content (e.g. an option "√7").
    if _MATH_WITH_CONTENT.search(html or ""):
        return False
    return not re.sub(r"<[^>]+>|&nbsp;|\s", "", html or "")


_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_plain_text(value: str) -> str:
    return _CONTROL_CHARS.sub("", value or "").strip()


def validate_link(value: str) -> str:
    """Site-relative paths, http(s), mailto: and tel: only (no javascript: etc.)."""
    value = (value or "").strip()
    if not value:
        return ""
    if any(ch.isspace() for ch in value) or _CONTROL_CHARS.search(value):
        raise ValidationError("Links cannot contain spaces.")
    if value.startswith("/"):
        if value.startswith("//") or value.startswith("/\\"):
            raise ValidationError("Use a full https:// address for external links.")
        return value
    if value.startswith("#"):
        return value
    scheme = value.split(":", 1)[0].lower() if ":" in value else ""
    if scheme in {"http", "https"}:
        parsed = urlparse(value)
        if not parsed.netloc:
            raise ValidationError("Enter a complete web address.")
        return value
    if scheme in {"mailto", "tel"} and len(value) > len(scheme) + 1:
        return value
    raise ValidationError("Enter a site path such as /courses, or a full https:// address.")


_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_VIMEO_ID = re.compile(r"^\d{6,12}$")


def video_embed_url(value: str) -> str:
    """Return the privacy-friendly embed URL for a YouTube or Vimeo link."""
    parsed = urlparse((value or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValidationError("Enter a YouTube or Vimeo link.")
    host = (parsed.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    parts = [p for p in parsed.path.split("/") if p]
    video_id = None
    if host in {"youtube.com", "youtube-nocookie.com"}:
        if parts[:1] == ["watch"]:
            video_id = (parse_qs(parsed.query).get("v") or [None])[0]
        elif len(parts) >= 2 and parts[0] in {"embed", "shorts", "live"}:
            video_id = parts[1]
        if video_id and _YOUTUBE_ID.match(video_id):
            return f"https://www.youtube-nocookie.com/embed/{video_id}"
    elif host == "youtu.be":
        if parts and _YOUTUBE_ID.match(parts[0]):
            return f"https://www.youtube-nocookie.com/embed/{parts[0]}"
    elif host in {"vimeo.com", "player.vimeo.com"}:
        candidate = parts[-1] if parts else ""
        if _VIMEO_ID.match(candidate):
            return f"https://player.vimeo.com/video/{candidate}?dnt=1"
    raise ValidationError("Enter a YouTube or Vimeo link.")


_HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _luminance(hex_color: str) -> float:
    def channel(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def contrast_with_white(hex_color: str) -> float:
    return 1.05 / (_luminance(hex_color) + 0.05)


def validate_brand_color(value: str, *, min_contrast: float) -> str:
    """Hex colour that keeps white text on it legible (WCAG contrast ratio)."""
    if not _HEX.match(value or ""):
        raise ValidationError("Use a six-digit hex colour such as #102A43.")
    ratio = contrast_with_white(value)
    if ratio < min_contrast:
        raise ValidationError(
            f"White text on this colour has a contrast ratio of {ratio:.1f}:1; at least {min_contrast}:1 is required."
        )
    return value.upper()


RESERVED_SLUGS = frozenset(
    {
        "admin", "api", "blog", "certificates", "checkout", "courses", "dashboard", "django-admin",
        "exams", "forgot-password", "healthz", "login", "logout", "media", "newsletter", "preview",
        "readyz", "register", "reset-password", "robots.txt", "search", "sitemap.xml", "static",
        "verify-email", "_next",
    }
)  # fmt: skip


_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def validate_slug_format(value: str) -> str:
    """Lowercase words joined by single hyphens, so addresses stay predictable."""
    if not _SLUG.match(value or ""):
        raise ValidationError("Use lowercase letters, numbers and single hyphens.")
    return value


def validate_page_slug(value: str) -> str:
    validate_slug_format(value)
    if value in RESERVED_SLUGS:
        raise ValidationError("This address is reserved by the application. Choose another slug.")
    return value
