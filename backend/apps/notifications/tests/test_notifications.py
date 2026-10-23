import pytest
from django.db import IntegrityError, transaction

from apps.notifications import services
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db

URL = "/api/v1/me/notifications/"


def test_notify_dedupes_and_skips_inactive(make_user):
    a, b = make_user(), make_user(is_active=False)
    created = services.notify([a, a, b], kind="general", title="Hello")
    assert len(created) == 1 and created[0].user == a


def test_users_only_see_and_mark_their_own(client_for):
    me, other = client_for(), client_for()
    mine = services.notify([me.user], kind="general", title="Mine")[0]
    theirs = services.notify([other.user], kind="general", title="Theirs")[0]
    res = me.get(URL)
    assert [n["title"] for n in res.json()["results"]] == ["Mine"]
    assert me.get(f"{URL}unread-count/").json() == {"unread": 1}
    assert me.post(f"{URL}read/", {"ids": [theirs.pk]}, format="json").json() == {"updated": 0}
    theirs.refresh_from_db()
    assert theirs.read_at is None
    assert me.post(f"{URL}read/", {}, format="json").json() == {"updated": 1}
    mine.refresh_from_db()
    assert mine.read_at is not None
    assert me.get(URL, {"unread": "true"}).json()["results"] == []


def test_anonymous_refused(api_client):
    assert api_client.get(URL).status_code in (401, 403)


def test_email_needs_verified_address(make_user, mailoutbox, django_capture_on_commit_callbacks):
    verified, unverified = make_user(), make_user(verified=False)
    with django_capture_on_commit_callbacks(execute=True):
        services.notify([verified, unverified], kind="general", title="Hi", link="/dashboard", email=True)
    assert [m.to for m in mailoutbox] == [[verified.email]]
    assert "/dashboard" in mailoutbox[0].body
    assert Notification.objects.get(user=verified).emailed_at is not None
    assert Notification.objects.get(user=unverified).emailed_at is None


@pytest.mark.parametrize("link", ["https://evil.example", "//evil.example", "javascript:alert(1)"])
def test_links_must_be_internal(make_user, link):
    with pytest.raises(IntegrityError), transaction.atomic():
        Notification.objects.create(user=make_user(), kind="general", title="x", link=link)
