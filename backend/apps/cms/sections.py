"""Section types for the page builder.

Each section type declares its fields once, here. The same declaration is used
to validate and normalise editor input, to resolve media for public output,
and (via the admin `section-types` endpoint) to render the editor's forms. The
frontend has one React component per type and never receives raw HTML that
has not been sanitised.

Stored shape of a page's sections:
    [{"id": "a1b2…", "type": "hero", "hidden": false, "data": {...}}, ...]

Other apps contribute section types with ``register_section_type`` (the
catalog adds featured courses, categories, instructors and collections). Fields
of kind ``ref``/``refs`` point at records owned by another app; that app
registers a ``Reference`` that validates ids and lists options for the editor.
A section type's ``resolve`` hook turns stored ids into public data at read
time, so unpublished records never appear on a page.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any

from django.core.exceptions import ValidationError

from . import sanitize

MAX_SECTIONS_PER_PAGE = 40
_SECTION_ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


@dataclass(frozen=True)
class Field:
    name: str
    kind: str  # text | textarea | richtext | link | image | video | select | boolean | integer | list | ref | refs
    label: str
    required: bool = False
    max_length: int | None = None
    help: str = ""
    choices: tuple[tuple[str, str], ...] = ()
    default: Any = None
    fields: tuple[Field, ...] = ()  # item fields for kind="list"
    min_items: int = 0
    max_items: int | None = None
    min_value: int | None = None
    max_value: int | None = None
    ref: str = ""  # reference type for kind="ref"/"refs"

    def describe(self) -> dict:
        out: dict[str, Any] = {"name": self.name, "kind": self.kind, "label": self.label, "required": self.required}
        for attr in ("max_length", "default", "max_items", "min_value", "max_value"):
            if getattr(self, attr) is not None:
                out[attr] = getattr(self, attr)
        if self.help:
            out["help"] = self.help
        if self.choices:
            out["choices"] = [{"value": v, "label": label} for v, label in self.choices]
        if self.kind == "list":
            out["min_items"] = self.min_items
            out["fields"] = [f.describe() for f in self.fields]
        if self.kind in {"ref", "refs"}:
            out["ref"] = self.ref
        return out


@dataclass(frozen=True)
class SectionType:
    key: str
    label: str
    description: str
    fields: tuple[Field, ...] = field(default_factory=tuple)
    # Adds computed public data (e.g. course cards) to the resolved section data.
    resolve: Callable[[dict], dict] | None = None

    def describe(self) -> dict:
        return {
            "type": self.key,
            "label": self.label,
            "description": self.description,
            "fields": [f.describe() for f in self.fields],
        }


ICONS = tuple(
    (name, name.replace("-", " ").capitalize())
    for name in (
        "graduation-cap", "book-open", "video", "clipboard-check", "award", "users", "laptop", "brain",
        "code", "cpu", "calculator", "calendar", "message-circle", "shield-check", "target",
        "trending-up", "globe", "clock", "file-text", "headphones",
    )
)  # fmt: skip
THEMES = (("light", "Light"), ("dark", "Dark (navy)"), ("accent", "Accent (teal)"))


def cta_fields(prefix: str, label: str) -> tuple[Field, Field]:
    return (
        Field(f"{prefix}_label", "text", f"{label} label", max_length=40),
        Field(f"{prefix}_url", "link", f"{label} link", help="A site path such as /courses, or https://…"),
    )


HEADING = Field("heading", "text", "Heading", max_length=120)
INTRO = Field("intro", "textarea", "Introduction", max_length=400)

SECTION_TYPES: dict[str, SectionType] = {
    s.key: s
    for s in (
        SectionType(
            "hero",
            "Hero banner",
            "Large headline with calls to action and an optional image.",
            (
                Field("eyebrow", "text", "Eyebrow text", max_length=60),
                Field("heading", "text", "Heading", required=True, max_length=120),
                Field("subheading", "textarea", "Subheading", max_length=300),
                *cta_fields("primary_cta", "Primary button"),
                *cta_fields("secondary_cta", "Secondary button"),
                Field("image", "image", "Image"),
                Field("theme", "select", "Background", choices=THEMES[:2], default="light"),
            ),
        ),
        SectionType(
            "rich_text",
            "Rich text",
            "Formatted text with headings, lists, links and maths.",
            (
                HEADING,
                Field("body", "richtext", "Content", required=True, max_length=50_000),
                Field("width", "select", "Width", choices=(("narrow", "Narrow"), ("wide", "Wide")), default="narrow"),
            ),
        ),
        SectionType(
            "features",
            "Benefits / features",
            "A grid of short benefit statements with icons.",
            (
                HEADING,
                INTRO,
                Field("columns", "select", "Columns", choices=(("2", "2"), ("3", "3"), ("4", "4")), default="3"),
                Field(
                    "items",
                    "list",
                    "Items",
                    min_items=1,
                    max_items=12,
                    fields=(
                        Field("icon", "select", "Icon", choices=ICONS, default="graduation-cap"),
                        Field("title", "text", "Title", required=True, max_length=80),
                        Field("text", "textarea", "Text", max_length=300),
                    ),
                ),
            ),
        ),
        SectionType(
            "testimonials",
            "Testimonials",
            "Quotes from learners.",
            (
                HEADING,
                INTRO,
                Field(
                    "items",
                    "list",
                    "Testimonials",
                    min_items=1,
                    max_items=12,
                    help="Publish only genuine testimonials you have permission to use.",
                    fields=(
                        Field("quote", "textarea", "Quote", required=True, max_length=600),
                        Field("name", "text", "Name", required=True, max_length=80),
                        Field("role", "text", "Role or course", max_length=100),
                        Field("photo", "image", "Photo"),
                    ),
                ),
            ),
        ),
        SectionType(
            "faq",
            "FAQ",
            "Expandable questions and answers (also published as FAQ structured data).",
            (
                HEADING,
                INTRO,
                Field(
                    "items",
                    "list",
                    "Questions",
                    min_items=1,
                    max_items=40,
                    fields=(
                        Field("question", "text", "Question", required=True, max_length=200),
                        Field("answer", "richtext", "Answer", required=True, max_length=5_000),
                    ),
                ),
            ),
        ),
        SectionType(
            "stats",
            "Statistics",
            "A row of key figures.",
            (
                HEADING,
                INTRO,
                Field(
                    "items",
                    "list",
                    "Figures",
                    min_items=1,
                    max_items=6,
                    help="Publish only figures you can verify.",
                    fields=(
                        Field("value", "text", "Value", required=True, max_length=20),
                        Field("label", "text", "Label", required=True, max_length=80),
                        Field("note", "text", "Source or note", max_length=120),
                    ),
                ),
            ),
        ),
        SectionType(
            "image_text",
            "Image and text",
            "An image beside formatted text.",
            (
                Field("heading", "text", "Heading", required=True, max_length=120),
                Field("body", "richtext", "Text", max_length=10_000),
                Field("image", "image", "Image", required=True),
                Field(
                    "image_position",
                    "select",
                    "Image position",
                    choices=(("left", "Left"), ("right", "Right")),
                    default="right",
                ),
                *cta_fields("cta", "Button"),
            ),
        ),
        SectionType(
            "video",
            "Video",
            "An embedded YouTube or Vimeo video.",
            (
                HEADING,
                INTRO,
                Field("video_url", "video", "Video link", required=True, help="YouTube or Vimeo address."),
                Field("caption", "text", "Caption", max_length=200),
            ),
        ),
        SectionType(
            "cta",
            "Call to action",
            "A short prompt with one or two buttons.",
            (
                Field("heading", "text", "Heading", required=True, max_length=120),
                Field("text", "textarea", "Text", max_length=300),
                Field("button_label", "text", "Button label", required=True, max_length=40),
                Field("button_url", "link", "Button link", required=True),
                *cta_fields("secondary", "Secondary button"),
                Field("theme", "select", "Style", choices=THEMES, default="dark"),
            ),
        ),
        SectionType(
            "newsletter",
            "Newsletter signup",
            "Collects email addresses for the newsletter with explicit consent.",
            (
                Field("heading", "text", "Heading", required=True, max_length=120),
                Field("text", "textarea", "Text", max_length=300),
                Field("button_label", "text", "Button label", max_length=40, default="Subscribe"),
                Field(
                    "consent_text",
                    "textarea",
                    "Consent statement",
                    required=True,
                    max_length=300,
                    default=(
                        "I agree to receive occasional emails from Hexacademy Nepal. I can unsubscribe at any time."
                    ),
                ),
            ),
        ),
        SectionType(
            "contact",
            "Contact information",
            "Contact details from the site settings, with optional extra text.",
            (
                HEADING,
                INTRO,
                Field("show_email", "boolean", "Show email", default=True),
                Field("show_phone", "boolean", "Show phone", default=True),
                Field("show_address", "boolean", "Show address", default=True),
                Field("extra", "richtext", "Additional information", max_length=5_000),
            ),
        ),
    )
}


@dataclass(frozen=True)
class Reference:
    """A kind of record that sections may point at, owned by another app."""

    key: str
    existing_ids: Callable[[set[int]], set[int]]  # which of these ids exist
    # Editor choices [{"id", "label", "description"}], by search text or (when ids is given) for those ids.
    options: Callable[[str, set[int] | None], Iterable[dict]]


REFERENCES: dict[str, Reference] = {}


def register_reference(reference: Reference):
    REFERENCES[reference.key] = reference


def register_section_type(section_type: SectionType):
    for f in section_type.fields:
        assert f.kind not in {"ref", "refs"} or f.ref, f"{section_type.key}.{f.name} needs a ref type"
    SECTION_TYPES[section_type.key] = section_type


def describe_section_types() -> list[dict]:
    return [s.describe() for s in SECTION_TYPES.values()]


class _Collector:
    def __init__(self):
        self.errors: dict[str, list[str]] = {}
        self.image_refs: list[tuple[str, int]] = []
        self.refs: list[tuple[str, str, int]] = []  # (path, reference type, id)

    def add(self, path: str, message: str):
        self.errors.setdefault(path, []).append(message)


def _clean_value(f: Field, raw: Any, path: str, out: _Collector) -> Any:  # noqa: C901 - flat dispatch on kind
    empty = raw is None or raw == "" or raw == []
    if empty:
        if f.required:
            out.add(path, "This field is required.")
        if f.kind in {"list", "refs"}:
            return []
        if f.kind == "boolean":
            return bool(f.default)
        return f.default if f.kind == "select" else None if f.kind in {"image", "integer", "ref"} else ""

    if f.kind in {"text", "textarea", "link", "video"} and not isinstance(raw, str):
        out.add(path, "Enter text.")
        return ""

    if f.kind in {"text", "textarea"}:
        value = sanitize.clean_plain_text(raw)
        if f.kind == "text":
            value = " ".join(value.split())
        if f.max_length and len(value) > f.max_length:
            out.add(path, f"Use at most {f.max_length} characters.")
        if f.required and not value:
            out.add(path, "This field is required.")
        return value

    if f.kind == "richtext":
        if not isinstance(raw, str):
            out.add(path, "Enter text.")
            return ""
        if f.max_length and len(raw) > f.max_length:
            out.add(path, f"Content is too long (at most {f.max_length} characters of HTML).")
            return ""
        value = sanitize.clean_rich_text(raw)
        if f.required and sanitize.rich_text_is_empty(value):
            out.add(path, "This field is required.")
        return value

    if f.kind == "link":
        try:
            return sanitize.validate_link(raw)
        except ValidationError as exc:
            out.add(path, exc.messages[0])
            return ""

    if f.kind == "video":
        try:
            sanitize.video_embed_url(raw)
        except ValidationError as exc:
            out.add(path, exc.messages[0])
            return ""
        return raw.strip()

    if f.kind == "select":
        allowed = {v for v, _ in f.choices}
        value = str(raw)
        if value not in allowed:
            out.add(path, "Choose one of the listed options.")
            return f.default
        return value

    if f.kind == "boolean":
        if not isinstance(raw, bool):
            out.add(path, "Must be true or false.")
            return bool(f.default)
        return raw

    if f.kind in {"integer", "image"}:
        if isinstance(raw, bool) or not isinstance(raw, int):
            out.add(path, "Must be a whole number." if f.kind == "integer" else "Choose a file from the media library.")
            return None
        if f.kind == "image":
            out.image_refs.append((path, raw))
            return raw
        if f.min_value is not None and raw < f.min_value:
            out.add(path, f"Must be at least {f.min_value}.")
        if f.max_value is not None and raw > f.max_value:
            out.add(path, f"Must be at most {f.max_value}.")
        return raw

    if f.kind == "ref":
        if isinstance(raw, bool) or not isinstance(raw, int):
            out.add(path, "Choose one of the listed options.")
            return None
        out.refs.append((path, f.ref, raw))
        return raw

    if f.kind == "refs":
        if not isinstance(raw, list) or any(isinstance(v, bool) or not isinstance(v, int) for v in raw):
            out.add(path, "Choose from the listed options.")
            return []
        ids = list(dict.fromkeys(raw))  # de-duplicate, keep order
        if len(ids) < f.min_items:
            out.add(path, f"Choose at least {f.min_items}.")
        if f.max_items is not None and len(ids) > f.max_items:
            out.add(path, f"Choose at most {f.max_items}.")
            ids = ids[: f.max_items]
        out.refs.extend((f"{path}.{i}", f.ref, v) for i, v in enumerate(ids))
        return ids

    if f.kind == "list":
        if not isinstance(raw, list):
            out.add(path, "Must be a list.")
            return []
        if len(raw) < f.min_items:
            out.add(path, f"Add at least {f.min_items} item(s).")
        if f.max_items is not None and len(raw) > f.max_items:
            out.add(path, f"Use at most {f.max_items} items.")
            raw = raw[: f.max_items]
        items = []
        for i, item in enumerate(raw):
            if not isinstance(item, dict):
                out.add(f"{path}.{i}", "Invalid item.")
                continue
            items.append(_clean_fields(f.fields, item, f"{path}.{i}", out))
        return items

    raise AssertionError(f"Unhandled field kind {f.kind}")


def _clean_fields(fields: tuple[Field, ...], data: dict, path: str, out: _Collector) -> dict:
    # Unknown keys are dropped: only declared fields are ever stored.
    return {f.name: _clean_value(f, data.get(f.name), f"{path}.{f.name}", out) for f in fields}


def clean_sections(raw: Any) -> list[dict]:
    """Validate and normalise a page's sections. Raises ValidationError with
    dotted paths (``sections.2.items.0.title``) mapped to messages."""
    out = _Collector()
    if not isinstance(raw, list):
        raise ValidationError({"sections": ["Must be a list of sections."]})
    if len(raw) > MAX_SECTIONS_PER_PAGE:
        raise ValidationError({"sections": [f"A page can have at most {MAX_SECTIONS_PER_PAGE} sections."]})

    cleaned: list[dict] = []
    seen_ids: set[str] = set()
    for i, section in enumerate(raw):
        path = f"sections.{i}"
        if not isinstance(section, dict):
            out.add(path, "Invalid section.")
            continue
        stype = SECTION_TYPES.get(section.get("type"))
        if stype is None:
            out.add(f"{path}.type", "Unknown section type.")
            continue
        section_id = section.get("id")
        if not isinstance(section_id, str) or not _SECTION_ID.match(section_id) or section_id in seen_ids:
            section_id = uuid.uuid4().hex[:12]
        seen_ids.add(section_id)
        data = section.get("data") if isinstance(section.get("data"), dict) else {}
        cleaned.append(
            {
                "id": section_id,
                "type": stype.key,
                "hidden": bool(section.get("hidden", False)),
                "data": _clean_fields(stype.fields, data, path, out),
            }
        )

    if out.image_refs:
        from .models import MediaAsset

        ids = {ref for _, ref in out.image_refs}
        found = set(MediaAsset.objects.filter(pk__in=ids, kind=MediaAsset.Kind.IMAGE).values_list("pk", flat=True))
        for path, ref in out.image_refs:
            if ref not in found:
                out.add(path, "This image no longer exists in the media library.")

    by_type: dict[str, set[int]] = {}
    for _, ref_type, ref_id in out.refs:
        by_type.setdefault(ref_type, set()).add(ref_id)
    for ref_type, ids in by_type.items():
        reference = REFERENCES.get(ref_type)
        found = reference.existing_ids(ids) if reference else set()
        for path, t, ref_id in out.refs:
            if t == ref_type and ref_id not in found:
                out.add(path, "This item no longer exists.")

    if out.errors:
        raise ValidationError(out.errors)
    return cleaned


# --- Public output ---------------------------------------------------------


def _walk_images(fields: tuple[Field, ...], data: dict, acc: set[int]):
    for f in fields:
        value = data.get(f.name)
        if f.kind == "image" and isinstance(value, int):
            acc.add(value)
        elif f.kind == "list" and isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    _walk_images(f.fields, item, acc)


def image_ids(sections: list[dict]) -> set[int]:
    acc: set[int] = set()
    for s in sections:
        stype = SECTION_TYPES.get(s.get("type"))
        if stype:
            _walk_images(stype.fields, s.get("data") or {}, acc)
    return acc


def _resolve(fields: tuple[Field, ...], data: dict, media: dict[int, dict]) -> dict:
    out = {}
    for f in fields:
        value = data.get(f.name)
        if f.kind == "image":
            value = media.get(value) if isinstance(value, int) else None
        elif f.kind == "video" and value:
            try:
                value = {"url": value, "embed_url": sanitize.video_embed_url(value)}
            except ValidationError:
                value = None
        elif f.kind == "list":
            value = [_resolve(f.fields, item, media) for item in value or [] if isinstance(item, dict)]
        out[f.name] = value
    return out


def public_sections(sections: list[dict], media: dict[int, dict]) -> list[dict]:
    """Visible sections with media references resolved to URLs. Section types
    that no longer exist are skipped rather than breaking the page."""
    result = []
    for s in sections or []:
        stype = SECTION_TYPES.get(s.get("type"))
        if stype is None or s.get("hidden"):
            continue
        data = _resolve(stype.fields, s.get("data") or {}, media)
        if stype.resolve:
            data = stype.resolve(data)
        result.append({"id": s.get("id"), "type": stype.key, "data": data})
    return result
