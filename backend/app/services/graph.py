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


def list_messages_from_sender(access_token: str, sender_email: str) -> list[dict]:
    """$search is unreliable for structured from:/subject: matching on at least some Outlook/Live
    accounts (observed returning unrelated inbox mail for a from:/subject: query in practice) --
    $filter on the sender address is the precise, reliable alternative for a single-sender lookup
    like this. $top bounds the scan; combining this filter with a date range or $orderby triggers
    Graph's "InefficientFilter" error on this account type, so recency isn't enforced here --
    callers must verify the sender and match on their own correlation signal (e.g. amount)."""
    response = httpx.get(
        f"{GRAPH_API_BASE}/messages",
        params={
            "$filter": f"from/emailAddress/address eq '{sender_email}'",
            "$select": "id",
            "$top": 50,
        },
        headers={"Authorization": f"Bearer {access_token}", "ConsistencyLevel": "eventual"},
    )
    raise_for_status_with_body(response)
    return response.json().get("value", [])


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
