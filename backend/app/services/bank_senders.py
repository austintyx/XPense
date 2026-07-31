import re

# Exact transaction-alert sender addresses, per bank. Confirmed via real inbox screenshots: DBS
# sends card-purchase, NETS Scan & Pay, and PayNow alerts alike from ibanking.alert@dbs.com (one
# address, not per-alert-type as previously assumed). alerts@dbs.com.sg / alerts@uob.com.sg are
# kept as extra allowed addresses in case another alert type does use them, but are unverified
# against a live inbox -- if PayNow/Scan-and-Pay mail is ever missing again, check the real
# sender address first before assuming it's an allowlist gap. Every bank maps to a list of
# addresses since it's plausible some banks do split across several. This list is the single
# source of truth for both "which mail to fetch" and "which mail we're allowed to read the body
# of" (Phase 10's bank-sender allowlist requirement).
KNOWN_BANK_SENDERS: dict[str, list[str]] = {
    # paylah.alerts@dbs.com (DBS PayLah!, the mobile wallet): a real PayLah! transfer screenshot
    # confirmed the alert wording parses correctly (it reuses the same shared table template as
    # ibanking.alert@dbs.com -- see parser.py), but that screenshot showed the sender's display
    # name ("PayLah! Alerts"), not the raw address, so this exact address is still not directly
    # confirmed -- if PayLah! mail goes missing, check the real From address first.
    "dbs": ["ibanking.alert@dbs.com", "alerts@dbs.com.sg", "paylah.alerts@dbs.com"],
    "uob": ["unialerts@uobgroup.com", "alerts@uob.com.sg"],
    # YouTrip (multi-currency travel wallet) "Summary of your recent online purchases & ATM
    # withdrawals" alerts -- confirmed via 2 real screenshots ("On behalf of YouTrip", subject as
    # above). The local part is VERP/ESP-rewritten (noreply=you.co, not noreply@you.co) -- if this
    # exact address ever turns out unstable (some ESPs vary it per-send), YouTrip mail will
    # silently stop being fetched at all; check the real From address first before assuming
    # anything else is wrong, same as this file's existing PayLah! caveat above.
    "youtrip": ["noreply=you.co@mail.you.co"],
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
