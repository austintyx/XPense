from datetime import datetime, timedelta

import httpx

from app.services.bank_senders import GRAPH_SENDER_QUERY
from app.services.gmail import strip_html
from app.services.oauth_http import raise_for_status_with_body

# Matches gmail.py's four-function interface (list_bank_messages, fetch_message,
# extract_plain_text, get_sender) so services/sync.py can treat both providers identically.
BANK_SENDER_QUERY = GRAPH_SENDER_QUERY
GRAPH_API_BASE = "https://graph.microsoft.com/v1.0/me"


def list_bank_messages(access_token: str, query: str = BANK_SENDER_QUERY) -> list[dict]:
    response = httpx.get(
        f"{GRAPH_API_BASE}/messages",
        params={"$search": query, "$select": "id"},
        headers={"Authorization": f"Bearer {access_token}", "ConsistencyLevel": "eventual"},
    )
    raise_for_status_with_body(response)
    return response.json().get("value", [])


def list_messages_from_sender(
    access_token: str, sender_email: str, around: datetime, window: timedelta = timedelta(days=1)
) -> list[dict]:
    """$search is unreliable for structured from:/subject: matching on at least some Outlook/Live
    accounts (observed returning unrelated inbox mail for a from:/subject: query in practice), and
    filtering directly on a nested property like from/emailAddress/address can't be combined with
    $orderby (triggers Graph's "InefficientFilter" error) -- so on a high-volume mailbox, an
    unordered from:-filtered scan can burn through its $top cap on old mail and never reach a
    recent message (observed: 1898 total messages from one sender, an unordered $top:50 scan
    surfaced only 2018-2020 mail). receivedDateTime is a native, indexed property that *does*
    support $filter + $orderby together, so bound the search to a window around the transaction
    time (sorted newest-first) and match the sender client-side instead."""
    start = (around - window).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (around + window).strftime("%Y-%m-%dT%H:%M:%SZ")
    response = httpx.get(
        f"{GRAPH_API_BASE}/messages",
        params={
            "$filter": f"receivedDateTime ge {start} and receivedDateTime le {end}",
            "$orderby": "receivedDateTime desc",
            "$select": "id,from",
            "$top": 50,
        },
        headers={"Authorization": f"Bearer {access_token}", "ConsistencyLevel": "eventual"},
    )
    raise_for_status_with_body(response)
    messages = response.json().get("value", [])
    return [
        {"id": m["id"]}
        for m in messages
        if sender_email in m.get("from", {}).get("emailAddress", {}).get("address", "").lower()
    ]


def fetch_message(access_token: str, message_id: str) -> dict:
    response = httpx.get(
        f"{GRAPH_API_BASE}/messages/{message_id}",
        params={"$select": "body,from"},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    raise_for_status_with_body(response)
    return response.json()


def extract_plain_text(message: dict) -> str:
    body = message.get("body", {})
    content = body.get("content", "") or ""
    if body.get("contentType", "").lower() == "html":
        return strip_html(content)
    return content.strip()


def get_sender(message: dict) -> str:
    email = message.get("from", {}).get("emailAddress", {})
    name = email.get("name") or ""
    address = email.get("address") or ""
    return f"{name} <{address}>" if name else address
