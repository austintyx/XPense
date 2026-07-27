import base64
import re
from datetime import datetime, timedelta
from html.parser import HTMLParser

import httpx

from app.services.bank_senders import GMAIL_SENDER_FILTER
from app.services.oauth_http import raise_for_status_with_body

BANK_SENDER_QUERY = f"{GMAIL_SENDER_FILTER} newer_than:60d"
GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"

_SKIP_CONTENT_TAGS = {"style", "script"}


class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in _SKIP_CONTENT_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_CONTENT_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self._chunks.append(data)

    def text(self) -> str:
        return re.sub(r"\s+", " ", "".join(self._chunks)).strip()


def strip_html(html: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(html)
    return parser.text()


def _decode_base64url(data: str) -> str:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def list_bank_messages(access_token: str, query: str = BANK_SENDER_QUERY) -> list[dict]:
    response = httpx.get(
        f"{GMAIL_API_BASE}/messages",
        params={"q": query},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    raise_for_status_with_body(response)
    return response.json().get("messages", [])


def list_messages_from_sender(
    access_token: str, sender_email: str, around: datetime, window: timedelta = timedelta(days=1)
) -> list[dict]:
    """Bounded to a window around the transaction time (not "now") so this works correctly for
    both a live sync (transaction just happened) and a backfill against an older stored row --
    Gmail's after:/before: operators accept Unix timestamps directly."""
    start = int((around - window).timestamp())
    end = int((around + window).timestamp())
    return list_bank_messages(access_token, query=f"from:{sender_email} after:{start} before:{end}")


def list_bank_messages_since(access_token: str, since: datetime) -> list[dict]:
    """A manual historical backfill can easily span months, so unlike list_bank_messages (a
    single unpaginated page, fine for the normal small incremental/60-day window) this follows
    nextPageToken until exhausted -- a single-page scan here would silently miss older mail,
    the same class of bug list_messages_from_sender's docstring already documents for Graph."""
    query = f"{GMAIL_SENDER_FILTER} after:{int(since.timestamp())}"
    messages: list[dict] = []
    page_token: str | None = None
    while True:
        params = {"q": query, "maxResults": 500}
        if page_token is not None:
            params["pageToken"] = page_token
        response = httpx.get(
            f"{GMAIL_API_BASE}/messages",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        raise_for_status_with_body(response)
        body = response.json()
        messages.extend(body.get("messages", []))
        page_token = body.get("nextPageToken")
        if not page_token:
            return messages


def fetch_message(access_token: str, message_id: str) -> dict:
    response = httpx.get(
        f"{GMAIL_API_BASE}/messages/{message_id}",
        params={"format": "full"},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    raise_for_status_with_body(response)
    return response.json()


def extract_plain_text(message: dict) -> str:
    payload = message.get("payload", {})

    def _walk(part: dict) -> str | None:
        mime_type = part.get("mimeType", "")
        body_data = part.get("body", {}).get("data")
        if mime_type == "text/plain" and body_data:
            return _decode_base64url(body_data)
        if mime_type == "text/html" and body_data:
            return strip_html(_decode_base64url(body_data))
        for sub_part in part.get("parts", []) or []:
            result = _walk(sub_part)
            if result:
                return result
        return None

    return _walk(payload) or ""


def get_sender(message: dict) -> str:
    headers = message.get("payload", {}).get("headers", [])
    for header in headers:
        if header.get("name", "").lower() == "from":
            return header.get("value", "")
    return ""
