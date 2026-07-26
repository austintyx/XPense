import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.services.categorize import food_subcategory

# Bank alerts (DBS/UOB) only ever say "GRAB" for any Grab charge -- the bank has no idea whether
# it was a ride, a food order, a grocery delivery, etc. This only fires for that generic string,
# not an already-specific merchant name.
_GRAB_MERCHANT_PATTERN = re.compile(r"\bGRAB\b", re.I)

GRAB_RECEIPT_SENDER = "no-reply@grab.com"
GRAB_RECEIPT_QUERY = f"from:{GRAB_RECEIPT_SENDER} subject:receipt newer_than:3d"

# Matches the receipt's stated total specifically (not a line-item price) -- Grab receipt bodies
# list item/delivery-fee amounts before the total, so a bare amount-anywhere-in-the-text regex
# would grab the wrong number.
_TOTAL_AMOUNT_RE = re.compile(r"Total\s+(?:S\$|SGD\s?)([\d,]+\.\d{2})", re.I)

# Ordered: first keyword found in the receipt body wins. No match (a ride) means "no override" --
# the caller keeps the existing default Transport/Private classification.
_SERVICE_KEYWORDS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"grabfood", re.I), "Food"),
    (re.compile(r"grabmart", re.I), "Groceries"),
    (re.compile(r"grabexpress", re.I), "Other"),
]


@dataclass
class GrabReceipt:
    amount: Decimal
    category: str


def is_generic_grab_merchant(merchant: str) -> bool:
    return bool(_GRAB_MERCHANT_PATTERN.search(merchant))


def parse_grab_receipt(text: str) -> GrabReceipt | None:
    """Pure function, no I/O. Extracts the receipt total and sniffs the body for which Grab
    service this was. Returns None if the amount can't be found or no recognized service keyword
    is present (a ride, or an email that isn't actually a Grab receipt)."""
    amount_match = _TOTAL_AMOUNT_RE.search(text)
    if amount_match is None:
        return None
    amount = Decimal(amount_match.group(1).replace(",", ""))

    for pattern, category in _SERVICE_KEYWORDS:
        if pattern.search(text):
            return GrabReceipt(amount=amount, category=category)
    return None


def reconcile_grab_transaction(
    mail_service, access_token: str, merchant_raw: str, amount: Decimal, txn_at: datetime
) -> tuple[str, str | None] | None:
    """Search the same mailbox for a Grab receipt email matching this generic "GRAB" bank charge
    and use it to determine the real category. Returns None (never raises) if no confident match
    is found, so the caller can fall back to the default Transport/Private classification -- a
    network hiccup or a not-yet-delivered receipt must never block a sync."""
    try:
        candidates = mail_service.list_bank_messages(access_token, query=GRAB_RECEIPT_QUERY)
        for stub in candidates:
            message = mail_service.fetch_message(access_token, stub["id"])
            sender = mail_service.get_sender(message)
            if GRAB_RECEIPT_SENDER not in sender.lower():
                continue

            text = mail_service.extract_plain_text(message)
            receipt = parse_grab_receipt(text)
            # The receipt amount is the strongest available correlation signal -- DBS/UOB alerts
            # don't expose a shared order ID to match on. Two same-amount Grab charges on the same
            # day are an accepted, unresolvable edge case without a stronger cross-reference key.
            if receipt is not None and receipt.amount == amount:
                if receipt.category == "Food":
                    return "Food", food_subcategory(merchant_raw, txn_at)
                return receipt.category, None
        return None
    except Exception:
        return None
