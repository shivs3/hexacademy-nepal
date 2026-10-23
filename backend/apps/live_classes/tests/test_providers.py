import pytest
from django.core.exceptions import ValidationError

from apps.live_classes import providers


@pytest.mark.parametrize(
    "url, meeting_id",
    [
        ("https://meet.google.com/abc-defg-hij", "abc-defg-hij"),
        ("  https://meet.google.com/abc-defg-hij  ", "abc-defg-hij"),
        ("https://meet.google.com/abc-defg-hij?authuser=0", "abc-defg-hij"),
    ],
)
def test_google_meet_accepts_meeting_links(url, meeting_id):
    link = providers.get("google_meet").parse(url)
    assert link.meeting_id == meeting_id
    assert link.url.startswith("https://meet.google.com/abc-defg-hij")


@pytest.mark.parametrize(
    "url",
    [
        "http://meet.google.com/abc-defg-hij",
        "https://meet.google.com.evil.example/abc-defg-hij",
        "https://evil.example/meet.google.com/abc-defg-hij",
        "https://meet.google.com/",
        "https://meet.google.com/lookup/abc",
        "javascript:alert(1)",
        "",
    ],
)
def test_google_meet_rejects_other_links(url):
    with pytest.raises(ValidationError):
        providers.get("google_meet").parse(url)


@pytest.mark.parametrize(
    "url, meeting_id",
    [
        ("https://zoom.us/j/1234567890", "1234567890"),
        ("https://us02web.zoom.us/j/12345678901?pwd=abcDEF", "12345678901"),
        ("https://hexacademy.zoom.us/w/123456789", "123456789"),
        ("https://zoom.us/my/hexacademy", "hexacademy"),
    ],
)
def test_zoom_accepts_join_links(url, meeting_id):
    link = providers.get("zoom").parse(url)
    assert link.meeting_id == meeting_id
    if "pwd=" in url:
        assert "pwd=abcDEF" in link.url  # the passcode link still works for learners


@pytest.mark.parametrize(
    "url",
    [
        "https://zoom.us/s/1234567890",  # host start link: never give it to learners
        "https://zoom.us.evil.example/j/1234567890",
        "https://evilzoom.us/j/1234567890",
        "https://zoom.us/j/12ab",
        "http://zoom.us/j/1234567890",
        "https://meet.google.com/abc-defg-hij",
    ],
)
def test_zoom_rejects_other_links(url):
    with pytest.raises(ValidationError):
        providers.get("zoom").parse(url)


def test_unknown_provider_is_a_validation_error():
    with pytest.raises(ValidationError) as exc:
        providers.get("teams")
    assert "provider" in exc.value.message_dict
