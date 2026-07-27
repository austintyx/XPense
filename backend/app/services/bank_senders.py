import re

# Exact transaction-alert sender addresses, per bank. Each bank sends different alert types from
# different addresses -- e.g. DBS sends card transactions from ibanking.alert@dbs.com but
# PayNow/NETS Scan & Pay/own-account transfers from alerts@dbs.com.sg -- so every bank maps to a
# list of addresses, not a single one. This list is the single source of truth for both "which
# mail to fetch" and "which mail we're allowed to read the body of" (Phase 10's bank-sender
# allowlist requirement).
KNOWN_BANK_SENDERS: dict[str, list[str]] = {
    "dbs": ["ibanking.alert@dbs.com", "alerts@dbs.com.sg"],
    "uob": ["unialerts@uobgroup.com", "alerts@uob.com.sg"],
}

_ALL_ADDRESSES = [address for addresses in KNOWN_BANK_SENDERS.values() for address in addresses]
_ALLOWED_ADDRESSES = {address.lower() for address in _ALL_ADDRESSES}

_ANGLE_ADDRESS_RE = re.compile(r"<([^<>]+)>")

GMAIL_SENDER_FILTER = "from:(" + " OR ".join(_ALL_ADDRESSES) + ")"
GRAPH_SENDER_QUERY = '"' + " OR ".join(f"from:{addr}" for addr in _ALL_ADDRESSES) + '"'


def extract_address(sender: str) -> str:
    """Pull the bare email address out of a From header like 'DBS Bank <x@dbs.com>'."""
    match = _ANGLE_ADDRESS_RE.search(sender)
    address = match.group(1) if match else sender
    return address.strip().lower()


def is_allowlisted_sender(sender: str) -> bool:
    return extract_address(sender) in _ALLOWED_ADDRESSES
