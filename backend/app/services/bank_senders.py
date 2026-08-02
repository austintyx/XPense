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
    # withdrawals" alerts. Two confirmed real-inbox variants: Gmail shows the sender as
    # noreply=you.co@mail.you.co (VERP/ESP-rewritten, varies per send); Outlook/Graph shows
    # "noreply=you.co@mail.you.co on behalf of YouTrip <noreply@you.co>" -- i.e. the Sender:
    # header is the VERP address at mail.you.co, but the From: header (what Graph's `message.from`
    # actually returns) is noreply@you.co, domain you.co with no "mail." subdomain at all. Rather
    # than hardcode one specific subdomain (which broke for Graph even after fixing it for Gmail),
    # this allowlists the actual registrable domain YouTrip owns -- "@you.co" here means "you.co
    # or any subdomain of it", so both noreply@you.co and noreply=...@mail.you.co match regardless
    # of which header a given provider's API surfaces. See is_allowlisted_sender below.
    "youtrip": ["@you.co"],
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
    domain = address.rsplit("@", 1)[-1]
    for allowed in _ALLOWED_ADDRESSES:
        if allowed.startswith("@"):
            # Domain-or-subdomain pattern (e.g. "@you.co") -- matches the domain itself
            # ("x@you.co") or any subdomain of it ("x@mail.you.co"), but not a lookalike that
            # merely ends with the same characters ("x@notyou.co", "x@you.co.evil.com" -- neither
            # equals "you.co" nor ends with ".you.co").
            base = allowed[1:]
            if domain == base or domain.endswith("." + base):
                return True
        elif address == allowed:
            return True
    return False
