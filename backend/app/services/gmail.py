import base64
import re
from html.parser import HTMLParser

import httpx

BANK_SENDER_QUERY = "from:(dbs.com.sg OR uob.com.sg OR simplygo) newer_than:60d"
GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:
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
    response.raise_for_status()
    return response.json().get("messages", [])


def fetch_message(access_token: str, message_id: str) -> dict:
    response = httpx.get(
        f"{GMAIL_API_BASE}/messages/{message_id}",
        params={"format": "full"},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    response.raise_for_status()
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
