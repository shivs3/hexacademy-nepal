import pytest
from django.core.exceptions import ValidationError

from apps.cms import sanitize, sections

pytestmark = pytest.mark.django_db


def test_rich_text_strips_scripts_handlers_and_bad_urls():
    dirty = (
        '<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a>'
        '<a href="https://ok.example" target="_blank">ok</a><img src=x onerror=alert(1)>'
        '<iframe src="https://evil"></iframe>'
        '<span style="color:red" data-type="inline-math" data-latex="x^2">x</span></p>'
    )
    clean = sanitize.clean_rich_text(dirty)
    assert "script" not in clean and "onclick" not in clean and "onerror" not in clean
    assert "javascript:" not in clean and "<img" not in clean and "iframe" not in clean and "style" not in clean
    assert 'href="https://ok.example"' in clean and 'rel="noopener noreferrer"' in clean
    assert 'data-type="inline-math"' in clean and 'data-latex="x^2"' in clean


@pytest.mark.parametrize(
    ("html", "empty"),
    [
        ("", True),
        ("<p> &nbsp;</p>", True),
        ('<span data-type="inline-math" data-latex=" "></span>', True),
        ('<span data-type="inline-math" data-latex="\\sqrt{7}"></span>', False),
        ('<p><span data-type="inline-math" data-latex="x^2"></span></p>', False),
        ("<p>text</p>", False),
    ],
)
def test_rich_text_is_empty_counts_formulas_as_content(html, empty):
    assert sanitize.rich_text_is_empty(sanitize.clean_rich_text(html)) is empty


def test_rich_text_restricts_data_type_values():
    assert "data-type" not in sanitize.clean_rich_text('<span data-type="evil">x</span>')


@pytest.mark.parametrize(
    "value",
    ["/courses", "/courses?level=1#top", "https://example.com/a", "mailto:hi@example.com", "tel:+97798", "#faq"],
)
def test_valid_links(value):
    assert sanitize.validate_link(value) == value


@pytest.mark.parametrize(
    "value", ["javascript:alert(1)", "//evil.com", "/\\evil.com", "data:text/html,x", "https://", "ftp://x", "a b"]
)
def test_invalid_links(value):
    with pytest.raises(ValidationError):
        sanitize.validate_link(value)


@pytest.mark.parametrize(
    ("url", "embed"),
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
        ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"),
        ("https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"),
    ],
)
def test_video_embed_urls(url, embed):
    assert sanitize.video_embed_url(url) == embed


@pytest.mark.parametrize("url", ["https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=bad", "x"])
def test_video_rejects_other_hosts(url):
    with pytest.raises(ValidationError):
        sanitize.video_embed_url(url)


def test_brand_color_contrast():
    assert sanitize.validate_brand_color("#102a43", min_contrast=4.5) == "#102A43"
    with pytest.raises(ValidationError):
        sanitize.validate_brand_color("#14B8A6", min_contrast=4.5)  # mint is too light for white text
    with pytest.raises(ValidationError):
        sanitize.validate_brand_color("red", min_contrast=1)


def test_clean_sections_normalises_and_drops_unknown_keys():
    raw = [
        {
            "type": "features",
            "data": {
                "heading": "  Why   learn  ",
                "evil": "<script>",
                "items": [{"title": "Live classes", "icon": "video", "bogus": 1}],
            },
        }
    ]
    [section] = sections.clean_sections(raw)
    assert section["id"] and section["hidden"] is False
    assert section["data"]["heading"] == "Why learn"
    assert "evil" not in section["data"]
    assert section["data"]["items"] == [{"icon": "video", "title": "Live classes", "text": ""}]
    assert section["data"]["columns"] == "3"


def test_clean_sections_reports_dotted_paths():
    raw = [
        {"type": "hero", "data": {}},
        {"type": "faq", "data": {"items": [{"question": "Q?", "answer": ""}]}},
        {"type": "nope", "data": {}},
        {"type": "cta", "data": {"heading": "Go", "button_label": "Go", "button_url": "javascript:alert(1)"}},
    ]
    with pytest.raises(ValidationError) as exc:
        sections.clean_sections(raw)
    errors = exc.value.message_dict
    assert "sections.0.heading" in errors
    assert "sections.1.items.0.answer" in errors
    assert "sections.2.type" in errors
    assert "sections.3.button_url" in errors


def test_image_fields_must_reference_existing_images(image):
    ok = sections.clean_sections([{"type": "image_text", "data": {"heading": "H", "image": image.pk}}])
    assert ok[0]["data"]["image"] == image.pk
    with pytest.raises(ValidationError) as exc:
        sections.clean_sections([{"type": "image_text", "data": {"heading": "H", "image": 999999}}])
    assert "sections.0.image" in exc.value.message_dict


def test_public_sections_hide_hidden_and_resolve_media(image):
    stored = sections.clean_sections(
        [
            {"type": "image_text", "data": {"heading": "Shown", "image": image.pk}},
            {"type": "cta", "hidden": True, "data": {"heading": "x", "button_label": "x", "button_url": "/x"}},
            {"type": "video", "data": {"video_url": "https://youtu.be/dQw4w9WgXcQ"}},
        ]
    )
    from apps.cms.media import media_map

    out = sections.public_sections(stored, media_map(sections.image_ids(stored)))
    assert [s["type"] for s in out] == ["image_text", "video"]
    assert out[0]["data"]["image"]["alt"] == "A teal square"
    assert out[1]["data"]["video_url"]["embed_url"].startswith("https://www.youtube-nocookie.com/embed/")


def test_section_type_descriptions_cover_every_type():
    described = {d["type"] for d in sections.describe_section_types()}
    assert described == set(sections.SECTION_TYPES)
