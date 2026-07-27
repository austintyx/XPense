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

# Matches the receipt's stated total specifically (not a line-item price) -- Grab receipt bodies
# list item/delivery-fee/subtotal amounts before the grand total, so a bare amount-anywhere regex
# would grab the wrong number. \b is required before TOTAL so this doesn't match inside "Subtotal"
# (real receipts list both). The optional parenthetical handles "TOTAL (INCL. TAX) SGD 5.12", and
# \s* (not \s+) handles real receipts where HTML-stripping collapses "TOTAL" and "SGD" together
# with no space at all (observed in practice: "TOTALSGD 5.12").
_TOTAL_AMOUNT_RE = re.compile(r"\bTOTAL\b(?:\s*\([^)]*\))?\s*(?:S\$|SGD)\s*([\d,]+\.\d{2})", re.I)

# The actual store/stall name (e.g. "CHAGEE - Tampines West Community Club"), bounded by the next
# known receipt-template label -- verified against a real receipt where HTML-stripping runs the
# merchant name directly into the next field with no separator ("Order from:CHAGEE - Tampines West
# Community Club Profile:Personal"). Present for GrabFood/GrabMart; naturally absent for rides.
_ORDER_FROM_RE = re.compile(
    r"Order from:\s*(.+?)\s*(?:Profile:|Receipt Summary|Payment Method:|Rate your|$)", re.I
)

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
    merchant: str | None = None


def is_generic_grab_merchant(merchant: str) -> bool:
    return bool(_GRAB_MERCHANT_PATTERN.search(merchant))


def parse_grab_receipt(text: str) -> GrabReceipt | None:
    """Pure function, no I/O. Extracts the receipt total, the actual store name (if present), and
    sniffs the body for which Grab service this was. Returns None if the amount can't be found or
    no recognized service keyword is present (a ride, or an email that isn't actually a Grab
    receipt)."""
    # A receipt's summary section and its itemized-detail section both restate the same total
    # (observed in practice) -- take the last match as the more likely "final" figure in case a
    # future receipt format ever shows an earlier estimated/pre-discount total under the same
    # label.
    amount_matches = list(_TOTAL_AMOUNT_RE.finditer(text))
    if not amount_matches:
        return None
    amount = Decimal(amount_matches[-1].group(1).replace(",", ""))

    merchant_match = _ORDER_FROM_RE.search(text)
    merchant = merchant_match.group(1).strip() if merchant_match else None

    for pattern, category in _SERVICE_KEYWORDS:
        if pattern.search(text):
            return GrabReceipt(amount=amount, category=category, merchant=merchant)
    return None


def reconcile_grab_transaction(
    mail_service, access_token: str, merchant_raw: str, amount: Decimal, txn_at: datetime
) -> tuple[str, str | None, str | None] | None:
    """Search the same mailbox for a Grab receipt email matching this generic "GRAB" bank charge
    and use it to determine the real category, subcategory, and merchant name. Returns None (never
    raises) if no confident match is found, so the caller can fall back to the default
    Transport/Private classification -- a network hiccup or a not-yet-delivered receipt must never
    block a sync. Returns (category, subcategory, merchant) -- merchant is the receipt's actual
    store name (e.g. "CHAGEE - Tampines West Community Club") when the receipt has one, else None
    (the caller should keep the original generic "GRAB" merchant_raw in that case)."""
    try:
        candidates = mail_service.list_messages_from_sender(access_token, GRAB_RECEIPT_SENDER, around=txn_at)
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
                    # The real store name (when the receipt has one) is what actually lets
                    # beverage-brand detection work -- the bank's generic "GRAB" string never
                    # matches a beverage keyword.
                    subject_merchant = receipt.merchant or merchant_raw
                    return "Food", food_subcategory(subject_merchant, txn_at), receipt.merchant
                return receipt.category, None, receipt.merchant
        return None
    except Exception:
        return None
