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
    # above). The local part is VERP/ESP-rewritten (noreply=you.co, not noreply@you.co) and DOES
    # vary per send -- confirmed in practice: real YouTrip mail was being silently dropped here
    # even though Gmail's own from: search (fuzzy/domain-based, not exact) still found it. So
    # unlike every other entry in this dict, this one is a domain-suffix pattern (leading "@", no
    # local part) rather than one fixed exact address -- see is_allowlisted_sender below.
    "youtrip": ["@mail.you.co"],
}

_ALL_ADDRESSES = [address for addresses in KNOWN_BANK_SENDERS.values() for address in addresses]
_ALLOWED_ADDRESSES = {address.lower() for address in _ALL_ADDRESSES}

_ANGLE_ADDRESS_RE = re.compile(r"<([^<>]+)>")


def _search_term(address: str) -> str:
    # A "@domain" entry means "any sender at this domain" (the local part is unstable) -- Gmail's
    # from: operator (and Graph's $search) both accept a bare domain for that, so drop the "@"
    # rather than searching for the literal (unmatchable as a whole address) "@domain" string.
    return address[1:] if address.startswith("@") else address


GMAIL_SENDER_FILTER = "from:(" + " OR ".join(_search_term(a) for a in _ALL_ADDRESSES) + ")"
GRAPH_SENDER_QUERY = '"' + " OR ".join(f"from:{_search_term(a)}" for a in _ALL_ADDRESSES) + '"'


def extract_address(sender: str) -> str:
    """Pull the bare email address out of a From header like 'DBS Bank <x@dbs.com>'."""
    match = _ANGLE_ADDRESS_RE.search(sender)
    address = match.group(1) if match else sender
    return address.strip().lower()


def is_allowlisted_sender(sender: str) -> bool:
    address = extract_address(sender)
    for allowed in _ALLOWED_ADDRESSES:
        if allowed.startswith("@"):
            # Domain-suffix pattern (e.g. "@mail.you.co") -- the leading "@" anchors this to the
            # actual address boundary, so a lookalike domain without it (e.g.
            # "...@mail.you.co.evil.com" doesn't end with "@mail.you.co") still correctly fails.
            if address.endswith(allowed):
                return True
        elif address == allowed:
            return True
    return False
