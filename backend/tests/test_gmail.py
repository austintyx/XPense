import base64
from datetime import datetime, timezone

import httpx

from app.services.gmail import extract_plain_text, get_sender, list_bank_messages_since, strip_html


def test_strip_html_removes_tags_and_collapses_whitespace():
    html = "<div>Hello   <b>World</b>\n\n<p>!</p></div>"
    assert strip_html(html) == "Hello World !"


def test_extract_plain_text_prefers_text_plain_part():
    body = base64.urlsafe_b64encode(b"S$6.00 to CHICKEN RICE").decode()
    message = {
        "payload": {
            "mimeType": "multipart/alternative",
            "parts": [
                {"mimeType": "text/plain", "body": {"data": body}},
                {"mimeType": "text/html", "body": {"data": "ignored"}},
            ],
        }
    }
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_extract_plain_text_falls_back_to_html():
    body = base64.urlsafe_b64encode(b"<p>S$6.00 to <b>CHICKEN RICE</b></p>").decode()
    message = {
        "payload": {
            "mimeType": "multipart/alternative",
            "parts": [
                {"mimeType": "text/html", "body": {"data": body}},
            ],
        }
    }
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_get_sender_reads_from_header():
    message = {
        "payload": {
            "headers": [
                {"name": "Subject", "value": "Alert"},
                {"name": "From", "value": "DBS Bank <alerts@dbs.com.sg>"},
            ]
        }
    }
    assert get_sender(message) == "DBS Bank <alerts@dbs.com.sg>"


def test_list_bank_messages_since_follows_next_page_token_until_exhausted(monkeypatch):
    pages = {
        None: {"messages": [{"id": "m1"}, {"id": "m2"}], "nextPageToken": "page2"},
        "page2": {"messages": [{"id": "m3"}]},
    }
    seen_tokens = []

    def fake_get(url, params=None, headers=None):
        token = params.get("pageToken")
        seen_tokens.append(token)
        return httpx.Response(200, json=pages[token], request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)

    result = list_bank_messages_since("fake-token", datetime(2026, 1, 1, tzinfo=timezone.utc))

    assert [m["id"] for m in result] == ["m1", "m2", "m3"]
    assert seen_tokens == [None, "page2"]


def test_list_bank_messages_since_stops_after_a_single_page_with_no_token(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "get",
        lambda url, params=None, headers=None: httpx.Response(
            200, json={"messages": [{"id": "m1"}]}, request=httpx.Request("GET", url)
        ),
    )

    result = list_bank_messages_since("fake-token", datetime(2026, 1, 1, tzinfo=timezone.utc))

    assert [m["id"] for m in result] == ["m1"]
