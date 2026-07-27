import re

# Exact transaction-alert sender addresses, per bank. The human has configured all card/PayNow/
# transit spends to route through these bank alert emails directly (no separate merchant/transit
# sender), so this list is the single source of truth for both "which mail to fetch" and
# "which mail we're allowed to read the body of" (Phase 10's bank-sender allowlist requirement).
KNOWN_BANK_SENDERS: dict[str, str] = {
    "dbs": "ibanking.alert@dbs.com",
    "uob": "unialerts@uobgroup.com",
}

_ALLOWED_ADDRESSES = {address.lower() for address in KNOWN_BANK_SENDERS.values()}

_ANGLE_ADDRESS_RE = re.compile(r"<([^<>]+)>")

GMAIL_SENDER_FILTER = "from:(" + " OR ".join(KNOWN_BANK_SENDERS.values()) + ")"
GRAPH_SENDER_QUERY = '"' + " OR ".join(f"from:{addr}" for addr in KNOWN_BANK_SENDERS.values()) + '"'


def extract_address(sender: str) -> str:
    """Pull the bare email address out of a From header like 'DBS Bank <x@dbs.com>'."""
    match = _ANGLE_ADDRESS_RE.search(sender)
    address = match.group(1) if match else sender
    return address.strip().lower()


def is_allowlisted_sender(sender: str) -> bool:
    return extract_address(sender) in _ALLOWED_ADDRESSES
