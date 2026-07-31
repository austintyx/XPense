from datetime import datetime, timedelta, timezone

import httpx

from app.services.bank_senders import GRAPH_SENDER_QUERY, is_allowlisted_sender
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


def list_bank_messages_since(access_token: str, since: datetime) -> list[dict]:
    """A manual historical backfill can easily span months, so unlike list_bank_messages (a
    single unpaginated page) this follows @odata.nextLink until exhausted. Confirmed via Graph's
    docs that $filter and $search cannot be combined on /messages at all, so -- same as
    list_messages_from_sender above -- this drops $search entirely and filters by the full bank
    sender allowlist client-side, bounded by the one thing that *does* support $filter+$orderby
    together: the native, indexed receivedDateTime property. Known tradeoff: without $search this
    scans the whole mailbox in the date range, not just bank senders -- acceptable for a
    synchronous request in practice, since the per-message body fetch stays cheap and gated by
    the allowlist regardless."""
    start = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    headers = {"Authorization": f"Bearer {access_token}", "ConsistencyLevel": "eventual"}

    messages: list[dict] = []
    url = f"{GRAPH_API_BASE}/messages"
    params: dict | None = {
        "$filter": f"receivedDateTime ge {start} and receivedDateTime le {end}",
        "$orderby": "receivedDateTime desc",
        "$select": "id,from",
        "$top": 100,
    }
    while url is not None:
        response = httpx.get(url, params=params, headers=headers)
        raise_for_status_with_body(response)
        body = response.json()
        messages.extend(
            {"id": m["id"]}
            for m in body.get("value", [])
            if is_allowlisted_sender(m.get("from", {}).get("emailAddress", {}).get("address", ""))
        )
        # @odata.nextLink is a complete, opaque URL (carries its own $skiptoken) -- follow it
        # directly rather than re-deriving params, but params was only needed for the first
        # request since the link already encodes the filter/orderby/select/top.
        url = body.get("@odata.nextLink")
        params = None
    return messages


def fetch_message(access_token: str, message_id: str) -> dict:
    response = httpx.get(
        f"{GRAPH_API_BASE}/messages/{message_id}",
        params={"$select": "body,from,receivedDateTime"},
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


def get_received_at(message: dict) -> datetime:
    """Graph's `receivedDateTime` (ISO8601 UTC, e.g. "2026-05-25T02:03:00Z") -- requires
    `receivedDateTime` in fetch_message's $select above, unlike Gmail's always-present
    internalDate. Used by parsers (currently only YouTrip) whose emails don't include a full date
    in the body, only a bare time-of-day."""
    return datetime.fromisoformat(message["receivedDateTime"].replace("Z", "+00:00"))
