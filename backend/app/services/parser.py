import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import DirectionEnum, ProviderEnum, Transaction

SGT = ZoneInfo("Asia/Singapore")

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

_AMOUNT = r"(?:S\$|SGD\s?)[\d,]+\.\d{2}"


@dataclass
class ParsedTxn:
    amount: Decimal
    currency: str
    merchant_raw: str
    direction: DirectionEnum
    bank: str
    txn_at: datetime
    category: str | None = None
    subcategory: str | None = None
    raw_parsed: dict = field(default_factory=dict)
    # Set when one email can contain multiple transactions (currently only YouTrip's digest
    # emails) -- combined with the email's own id to build a per-transaction dedup key, instead of
    # every parser's default of one Transaction row per email (source_email_id = the email's own
    # id alone, unchanged for every parser that leaves this None).
    dedup_suffix: str | None = None


def _parse_amount(raw: str) -> Decimal:
    return Decimal(re.sub(r"[^\d.]", "", raw))


def _sgt_datetime(day: int, month_abbr: str, hour: int, minute: int, year: int | None = None) -> datetime:
    month = _MONTHS[month_abbr.strip().lower()[:3]]
    if year is None:
        year = datetime.now(SGT).year
    return datetime(year, month, day, hour, minute, tzinfo=SGT)


_DBS_OWN_TRANSFER_RE = re.compile(
    rf"Own Funds Transfer of (?P<amount>{_AMOUNT}) "
    r"from A/C ending \d+ to A/C ending (?P<to_acct>\d+) "
    r"on (?P<day>\d{1,2}) (?P<month>[A-Za-z]{3}) (?P<hour>\d{1,2}):(?P<minute>\d{2}) \(?SGT\)?",
    re.IGNORECASE,
)

# Incoming PayNow ("digibank Alert - You've received a transfer") is a completely different
# template from the outgoing Date & Time/Amount/From/To table below -- confirmed against a real
# screenshot -- so it needs its own regex rather than falling through to _DBS_TABLE_RE (which
# requires "Date & Time:"/"Amount:" labels this format doesn't have). Includes an explicit 4-digit
# year, unlike the outgoing formats.
_DBS_PAYNOW_RECEIVED_RE = re.compile(
    rf"You have received (?P<amount>{_AMOUNT}) via PayNow on "
    r"(?P<day>\d{1,2}) (?P<month>[A-Za-z]{3}) (?P<year>\d{4}) (?P<hour>\d{1,2}):(?P<minute>\d{2}) SGT\.\s*"
    r"From:\s*(?P<sender>.+?)\s*To:",
    re.IGNORECASE,
)

_ID_SUFFIX = r"UEN ending [\w\d]+|MOBILE ending \d+|NRIC ending [\w\d]+"

# DBS's shared alert-email template -- confirmed against real inbox screenshots to be used for
# card-purchase alerts, NETS Scan & Pay, and PayNow alike (all sent from ibanking.alert@dbs.com).
# Only the framing sentence before the table differs ("We refer to your card transaction
# request...", "Your NETS Scan & Pay transaction... was successful.", "We refer to your PAYNOW
# dated..."); the Date & Time/Amount/From/To table itself is identical, so one regex covers all
# three instead of guessing three different wordings. "SGT" appears with or without parens
# depending on alert type, and "unauthorised"/"unauthorized" both appear in the wild.
_DBS_TABLE_RE = re.compile(
    r"Date\s*&\s*Time:\s*(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]{3})\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})"
    r"\s*\(?SGT\)?\s*"
    rf"Amount:\s*(?P<amount>{_AMOUNT})\s*"
    r"From:\s*.+?\s*"
    r"To:\s*(?P<merchant>.+?)\s*(?:If unauthori[sz]ed|To (?:view|review)|Thank you|$)",
    re.IGNORECASE,
)

# A PayNow "To:" field carries a "(... ending NNNN)" suffix identifying who was paid (a business'
# UEN vs. a person's mobile/NRIC); a plain card purchase or NETS Scan & Pay merchant name doesn't.
_DBS_TABLE_PAYNOW_SUFFIX_RE = re.compile(rf"^(?P<name>.+?)\s*\((?P<idtype>{_ID_SUFFIX})\)$", re.IGNORECASE)

# A FAST interbank transfer's "To:" field names the recipient followed by their account, with no
# parens (unlike PayNow's "(... ending NNNN)") -- e.g. "Austin A/C ending 2047" -- confirmed
# against a real screenshot. Strip it for a clean merchant name.
_DBS_TABLE_ACCOUNT_SUFFIX_RE = re.compile(r"^(?P<name>.+?)\s+A/C ending \d+$", re.IGNORECASE)


def _parse_dbs(text: str, received_at: datetime) -> list[ParsedTxn]:
    if match := _DBS_OWN_TRANSFER_RE.search(text):
        return [
            ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency="SGD",
                merchant_raw=f"A/C ending {match['to_acct']}",
                direction=DirectionEnum.debit,
                bank="DBS",
                txn_at=_sgt_datetime(int(match["day"]), match["month"], int(match["hour"]), int(match["minute"])),
                raw_parsed=match.groupdict(),
            )
        ]

    if match := _DBS_PAYNOW_RECEIVED_RE.search(text):
        return [
            ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency="SGD",
                merchant_raw=match["sender"].strip(),
                direction=DirectionEnum.credit,
                bank="DBS",
                txn_at=_sgt_datetime(
                    int(match["day"]), match["month"], int(match["hour"]), int(match["minute"]), year=int(match["year"])
                ),
                raw_parsed=match.groupdict(),
            )
        ]

    if match := _DBS_TABLE_RE.search(text):
        merchant_field = match["merchant"].strip()
        txn_at = _sgt_datetime(int(match["day"]), match["month"], int(match["hour"]), int(match["minute"]))

        if id_match := _DBS_TABLE_PAYNOW_SUFFIX_RE.match(merchant_field):
            return [
                ParsedTxn(
                    amount=_parse_amount(match["amount"]),
                    currency="SGD",
                    merchant_raw=id_match["name"].strip(),
                    direction=DirectionEnum.debit,
                    bank="DBS",
                    txn_at=txn_at,
                    raw_parsed=match.groupdict(),
                )
            ]

        if acct_match := _DBS_TABLE_ACCOUNT_SUFFIX_RE.match(merchant_field):
            return [
                ParsedTxn(
                    amount=_parse_amount(match["amount"]),
                    currency="SGD",
                    merchant_raw=acct_match["name"].strip(),
                    direction=DirectionEnum.debit,
                    bank="DBS",
                    txn_at=txn_at,
                    raw_parsed=match.groupdict(),
                )
            ]

        return [
            ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency="SGD",
                merchant_raw=merchant_field,
                direction=DirectionEnum.debit,
                bank="DBS",
                txn_at=txn_at,
                raw_parsed=match.groupdict(),
            )
        ]

    return []


_UOB_PAYNOW_RE = re.compile(
    rf"PayNow transfer of (?P<amount>{_AMOUNT}) "
    r"to (?P<merchant>.+?) "
    r"\((?P<idtype>Mobile ending \d+|UEN ending [\w\d]+|NRIC ending [\w\d]+)\) "
    r"on your a/c ending \d+ "
    r"at (?P<hour>\d{1,2}):(?P<minute>\d{2})(?P<ampm>AM|PM) SGT, "
    r"(?P<day>\d{1,2}) (?P<month>[A-Za-z]{3}) (?P<year>\d{2})\.",
    re.IGNORECASE,
)


def _parse_uob(text: str, received_at: datetime) -> list[ParsedTxn]:
    if match := _UOB_PAYNOW_RE.search(text):
        hour = int(match["hour"]) % 12
        if match["ampm"].upper() == "PM":
            hour += 12
        return [
            ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency="SGD",
                merchant_raw=match["merchant"].strip(),
                direction=DirectionEnum.debit,
                bank="UOB",
                txn_at=_sgt_datetime(
                    int(match["day"]), match["month"], hour, int(match["minute"]), year=2000 + int(match["year"])
                ),
                raw_parsed=match.groupdict(),
            )
        ]
    return []


_SIMPLYGO_RE = re.compile(
    r"Fare \$(?P<amount>[\d,]+\.\d{2}) - (?P<origin>[^-]+?) - (?P<destination>[^-]+?) - "
    r"(?P<day>\d{1,2}) (?P<month>[A-Za-z]{3}) (?P<hour>\d{1,2}):(?P<minute>\d{2})",
    re.IGNORECASE,
)


def _parse_simplygo(text: str, received_at: datetime) -> list[ParsedTxn]:
    if match := _SIMPLYGO_RE.search(text):
        origin = match["origin"].strip()
        destination = match["destination"].strip()
        return [
            ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency="SGD",
                merchant_raw=f"Transit: {origin}-{destination}",
                direction=DirectionEnum.debit,
                bank="SimplyGo",
                txn_at=_sgt_datetime(int(match["day"]), match["month"], int(match["hour"]), int(match["minute"])),
                category="Transport",
                raw_parsed=match.groupdict(),
            )
        ]
    return []


# Bounds the transactions section of a YouTrip digest email so the non-greedy merchant capture in
# _YOUTRIP_TXN_RE below can't bleed into the intro paragraph (for the first transaction) or the
# footer/security-notice text.
_YOUTRIP_SECTION_START_RE = re.compile(r"\(UTC\+8\)\.\s*", re.IGNORECASE)
_YOUTRIP_SECTION_END_RE = re.compile(r"You may view the full transaction history", re.IGNORECASE)

# Built from 2 real screenshots of a "Summary of your recent online purchases & ATM withdrawals"
# YouTrip alert (rendered, not raw HTML/plain-text source) -- token order (merchant, then
# currency+amount, then Ref. No, then time) is inferred from the visual layout. Since confirmed
# against a real extracted email (see youtrip_real_sample.txt fixture): each row's icon renders as
# a literal "Image" text token immediately before the merchant name (no separating space), and
# there's a stray digit token (card-last-digits or similar) between the merchant/address text and
# the currency -- both optional here so they're excluded from the merchant capture instead of
# being absorbed into it, rather than absent entirely (as the original 2-screenshot fixtures are).
_YOUTRIP_TXN_RE = re.compile(
    r"(?:Image\s*)?"
    r"(?P<merchant>.+?)\s+"
    r"\d*\s*(?P<currency>[A-Z]{3})\s+(?P<amount>[\d,]+\.\d{2})\s*"
    r"Ref\.?\s*No:?\s*(?P<ref>[\w-]+)\s*"
    r"(?P<hour>\d{1,2}):(?P<minute>\d{2})\s*(?P<ampm>AM|PM)",
    re.IGNORECASE,
)


def _parse_youtrip(text: str, received_at: datetime) -> list[ParsedTxn]:
    # A rolling "last 24 hours" digest -- unlike every other parser here, one email can contain
    # multiple transactions (the subject/body says "purchases" plural), so this returns 0, 1, or
    # many ParsedTxn instead of at most one.
    start = _YOUTRIP_SECTION_START_RE.search(text)
    if not start:
        return []
    end = _YOUTRIP_SECTION_END_RE.search(text, start.end())
    section = text[start.end() : end.start() if end else len(text)]

    received_sgt = received_at.astimezone(SGT)
    results: list[ParsedTxn] = []
    for match in _YOUTRIP_TXN_RE.finditer(section):
        hour = int(match["hour"]) % 12
        if match["ampm"].upper() == "PM":
            hour += 12
        # The email body has no date at all, only a bare time -- infer the calendar date from the
        # email's own received timestamp: since this is a rolling "last 24 hours" digest, a
        # transaction time later in the day than the email itself must be from the day before.
        # Done per-transaction (not once per email), since a single digest can straddle midnight.
        candidate = received_sgt.replace(hour=hour, minute=int(match["minute"]), second=0, microsecond=0)
        if candidate > received_sgt:
            candidate -= timedelta(days=1)

        results.append(
            ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency=match["currency"].upper(),
                merchant_raw=match["merchant"].strip(" ,"),
                direction=DirectionEnum.debit,
                bank="YouTrip",
                txn_at=candidate,
                raw_parsed=match.groupdict(),
                dedup_suffix=match["ref"],
            )
        )
    return results


_BANK_PARSERS = [
    ("dbs", _parse_dbs),
    ("uob", _parse_uob),
    ("simplygo", _parse_simplygo),
    # The keyword must be a substring of the actual sender address, not the bank's name -- YouTrip's
    # is the VERP-rewritten "noreply=you.co@mail.you.co", which doesn't contain "youtrip" anywhere.
    ("mail.you.co", _parse_youtrip),
]


def parse_email(text: str, sender: str, received_at: datetime) -> list[ParsedTxn]:
    sender_lower = sender.lower()
    for keyword, parser_fn in _BANK_PARSERS:
        if keyword in sender_lower:
            result = parser_fn(text, received_at)
            if result:
                return result
    return []


def save_parsed_transaction(
    db: Session,
    user_id: int,
    source_email_id: str,
    provider: ProviderEnum,
    parsed: ParsedTxn,
) -> Transaction:
    """Insert a Transaction for a parsed email, deduping on source_email_id."""
    existing = db.query(Transaction).filter_by(source_email_id=source_email_id).first()
    if existing is not None:
        return existing

    txn = Transaction(
        user_id=user_id,
        source_email_id=source_email_id,
        provider=provider,
        amount=parsed.amount,
        currency=parsed.currency,
        direction=parsed.direction,
        merchant_raw=parsed.merchant_raw,
        merchant_clean=parsed.merchant_raw,
        category=parsed.category,
        subcategory=parsed.subcategory,
        txn_at=parsed.txn_at,
        bank=parsed.bank,
        raw_parsed=parsed.raw_parsed,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn
