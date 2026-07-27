from datetime import datetime, timezone

import httpx

from app.services.graph import extract_plain_text, get_sender, list_bank_messages_since


def test_extract_plain_text_returns_text_content_directly():
    message = {"body": {"contentType": "text", "content": "S$6.00 to CHICKEN RICE"}}
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_extract_plain_text_strips_html_content():
    message = {"body": {"contentType": "html", "content": "<p>S$6.00 to <b>CHICKEN RICE</b></p>"}}
    assert extract_plain_text(message) == "S$6.00 to CHICKEN RICE"


def test_get_sender_formats_name_and_address():
    message = {"from": {"emailAddress": {"name": "DBS Bank", "address": "alerts@dbs.com.sg"}}}
    assert get_sender(message) == "DBS Bank <alerts@dbs.com.sg>"


def test_get_sender_falls_back_to_address_only():
    message = {"from": {"emailAddress": {"name": "", "address": "alerts@dbs.com.sg"}}}
    assert get_sender(message) == "alerts@dbs.com.sg"


_NEXT_LINK = "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc"


def _graph_message(msg_id: str, address: str) -> dict:
    return {"id": msg_id, "from": {"emailAddress": {"address": address}}}


def test_list_bank_messages_since_follows_odata_next_link_and_filters_non_bank_senders(monkeypatch):
    pages = {
        "https://graph.microsoft.com/v1.0/me/messages": {
            "value": [
                _graph_message("m1", "ibanking.alert@dbs.com"),
                _graph_message("m2", "spam@example.com"),
            ],
            "@odata.nextLink": _NEXT_LINK,
        },
        _NEXT_LINK: {"value": [_graph_message("m3", "unialerts@uobgroup.com")]},
    }
    seen_urls = []

    def fake_get(url, params=None, headers=None):
        seen_urls.append(url)
        return httpx.Response(200, json=pages[url], request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", fake_get)

    result = list_bank_messages_since("fake-token", datetime(2026, 1, 1, tzinfo=timezone.utc))

    assert [m["id"] for m in result] == ["m1", "m3"]
    assert seen_urls == ["https://graph.microsoft.com/v1.0/me/messages", _NEXT_LINK]


def test_list_bank_messages_since_stops_when_no_next_link(monkeypatch):
    monkeypatch.setattr(
        httpx,
        "get",
        lambda url, params=None, headers=None: httpx.Response(
            200, json={"value": [_graph_message("m1", "ibanking.alert@dbs.com")]}, request=httpx.Request("GET", url)
        ),
    )

    result = list_bank_messages_since("fake-token", datetime(2026, 1, 1, tzinfo=timezone.utc))

    assert [m["id"] for m in result] == ["m1"]
