"""Meeting providers.

Each provider knows how to validate a meeting link and read the meeting id
out of it. Today both work from links the instructor creates in their own
Google Meet or Zoom account ("instructor-managed links"). Creating meetings
through the providers' APIs needs OAuth apps, account plans and credentials
that are not set up yet; when they are, a provider gains `create_meeting`
and `supports_api = True` without the rest of the live-class code changing
(see docs/deployment.md, "Live classes").

Only the public shape of join links is relied on here; no provider API is
called.
"""

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError

from .models import ClassSession


@dataclass(frozen=True)
class MeetingLink:
    url: str
    meeting_id: str


class MeetingProvider:
    key: str
    label: str
    supports_api = False
    example = ""

    def parse(self, url: str) -> MeetingLink:
        raise NotImplementedError


def _split(url: str):
    parts = urlsplit(url.strip())
    if parts.scheme != "https" or not parts.hostname:
        raise ValidationError({"join_url": ["Use the full https:// meeting link."]})
    return parts


class GoogleMeet(MeetingProvider):
    key = ClassSession.Provider.GOOGLE_MEET
    label = "Google Meet"
    example = "https://meet.google.com/abc-defg-hij"
    _CODE = re.compile(r"^/([a-z]{3}-[a-z]{4}-[a-z]{3})/?$")

    def parse(self, url: str) -> MeetingLink:
        parts = _split(url)
        match = self._CODE.match(parts.path)
        if parts.hostname != "meet.google.com" or not match:
            raise ValidationError(
                {"join_url": [f"That is not a Google Meet link. It should look like {self.example}."]}
            )
        code = match.group(1)
        return MeetingLink(url=f"https://meet.google.com/{code}", meeting_id=code)


class Zoom(MeetingProvider):
    key = ClassSession.Provider.ZOOM
    label = "Zoom"
    example = "https://us02web.zoom.us/j/12345678901?pwd=…"
    _HOSTS = ("zoom.us", "zoom.com")
    _MEETING = re.compile(r"^/(?:j|w)/(\d{9,12})/?$")
    _PERSONAL = re.compile(r"^/my/([A-Za-z0-9._-]{1,64})/?$")

    def parse(self, url: str) -> MeetingLink:
        parts = _split(url)
        host = parts.hostname or ""
        if not any(host == h or host.endswith("." + h) for h in self._HOSTS):
            raise ValidationError({"join_url": [f"That is not a Zoom link. It should look like {self.example}."]})
        if match := self._MEETING.match(parts.path):
            meeting_id = match.group(1)
        elif match := self._PERSONAL.match(parts.path):
            meeting_id = match.group(1)
        else:
            raise ValidationError(
                {"join_url": ["Use the meeting's join link (zoom.us/j/…), not the start or host link."]}
            )
        # Keep the query string: Zoom puts the embedded passcode (pwd) there.
        clean = f"https://{host}{parts.path}" + (f"?{parts.query}" if parts.query else "")
        return MeetingLink(url=clean, meeting_id=meeting_id)


PROVIDERS: dict[str, MeetingProvider] = {p.key: p for p in (GoogleMeet(), Zoom())}


def get(key: str) -> MeetingProvider:
    try:
        return PROVIDERS[key]
    except KeyError:
        raise ValidationError({"provider": ["Choose Google Meet or Zoom."]}) from None
