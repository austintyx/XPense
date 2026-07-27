import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import DirectionEnum, ProviderEnum, Transaction, TransactionTypeEnum

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
    type: TransactionTypeEnum
    bank: str
    txn_at: datetime
    category: str | None = None
    subcategory: str | None = None
    raw_parsed: dict = field(default_factory=dict)


def _parse_amount(raw: str) -> Decimal:
    return Decimal(re.sub(r"[^\d.]", "", raw))


def _sgt_datetime(day: int, month_abbr: str, hour: int, minute: int, year: int | None = None) -> datetime:
    month = _MONTHS[month_abbr.strip().lower()[:3]]
    if year is None:
        year = datetime.now(SGT).year
    return datetime(year, month, day, hour, minute, tzinfo=SGT)


def _classify_paynow(id_type: str) -> TransactionTypeEnum:
    # UEN = business/merchant -> expense. Mobile/NRIC = person -> transfer.
    if "uen" in id_type.lower():
        return TransactionTypeEnum.expense
    return TransactionTypeEnum.transfer


_DBS_OWN_TRANSFER_RE = re.compile(
    rf"Own Funds Transfer of (?P<amount>{_AMOUNT}) "
    r"from A/C ending \d+ to A/C ending (?P<to_acct>\d+) "
    r"on (?P<day>\d{1,2}) (?P<month>[A-Za-z]{3}) (?P<hour>\d{1,2}):(?P<minute>\d{2}) \(?SGT\)?",
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
_DBS_TABLE_OWN_ACCOUNT_RE = re.compile(r"^A/C ending \d+$", re.IGNORECASE)


def _parse_dbs(text: str) -> ParsedTxn | None:
    if match := _DBS_OWN_TRANSFER_RE.search(text):
        return ParsedTxn(
            amount=_parse_amount(match["amount"]),
            currency="SGD",
            merchant_raw=f"A/C ending {match['to_acct']}",
            direction=DirectionEnum.debit,
            type=TransactionTypeEnum.transfer,
            bank="DBS",
            txn_at=_sgt_datetime(int(match["day"]), match["month"], int(match["hour"]), int(match["minute"])),
            raw_parsed=match.groupdict(),
        )

    if match := _DBS_TABLE_RE.search(text):
        merchant_field = match["merchant"].strip()
        txn_at = _sgt_datetime(int(match["day"]), match["month"], int(match["hour"]), int(match["minute"]))

        if id_match := _DBS_TABLE_PAYNOW_SUFFIX_RE.match(merchant_field):
            return ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency="SGD",
                merchant_raw=id_match["name"].strip(),
                direction=DirectionEnum.debit,
                type=_classify_paynow(id_match["idtype"]),
                bank="DBS",
                txn_at=txn_at,
                raw_parsed=match.groupdict(),
            )

        if _DBS_TABLE_OWN_ACCOUNT_RE.match(merchant_field):
            return ParsedTxn(
                amount=_parse_amount(match["amount"]),
                currency="SGD",
                merchant_raw=merchant_field,
                direction=DirectionEnum.debit,
                type=TransactionTypeEnum.transfer,
                bank="DBS",
                txn_at=txn_at,
                raw_parsed=match.groupdict(),
            )

        return ParsedTxn(
            amount=_parse_amount(match["amount"]),
            currency="SGD",
            merchant_raw=merchant_field,
            direction=DirectionEnum.debit,
            type=TransactionTypeEnum.expense,
            bank="DBS",
            txn_at=txn_at,
            raw_parsed=match.groupdict(),
        )

    return None


_UOB_PAYNOW_RE = re.compile(
    rf"PayNow transfer of (?P<amount>{_AMOUNT}) "
    r"to (?P<merchant>.+?) "
    r"\((?P<idtype>Mobile ending \d+|UEN ending [\w\d]+|NRIC ending [\w\d]+)\) "
    r"on your a/c ending \d+ "
    r"at (?P<hour>\d{1,2}):(?P<minute>\d{2})(?P<ampm>AM|PM) SGT, "
    r"(?P<day>\d{1,2}) (?P<month>[A-Za-z]{3}) (?P<year>\d{2})\.",
    re.IGNORECASE,
)


def _parse_uob(text: str) -> ParsedTxn | None:
    if match := _UOB_PAYNOW_RE.search(text):
        hour = int(match["hour"]) % 12
        if match["ampm"].upper() == "PM":
            hour += 12
        return ParsedTxn(
            amount=_parse_amount(match["amount"]),
            currency="SGD",
            merchant_raw=match["merchant"].strip(),
            direction=DirectionEnum.debit,
            type=_classify_paynow(match["idtype"]),
            bank="UOB",
            txn_at=_sgt_datetime(
                int(match["day"]), match["month"], hour, int(match["minute"]), year=2000 + int(match["year"])
            ),
            raw_parsed=match.groupdict(),
        )
    return None


_SIMPLYGO_RE = re.compile(
    r"Fare \$(?P<amount>[\d,]+\.\d{2}) - (?P<origin>[^-]+?) - (?P<destination>[^-]+?) - "
    r"(?P<day>\d{1,2}) (?P<month>[A-Za-z]{3}) (?P<hour>\d{1,2}):(?P<minute>\d{2})",
    re.IGNORECASE,
)


def _parse_simplygo(text: str) -> ParsedTxn | None:
    if match := _SIMPLYGO_RE.search(text):
        origin = match["origin"].strip()
        destination = match["destination"].strip()
        return ParsedTxn(
            amount=_parse_amount(match["amount"]),
            currency="SGD",
            merchant_raw=f"Transit: {origin}-{destination}",
            direction=DirectionEnum.debit,
            type=TransactionTypeEnum.expense,
            bank="SimplyGo",
            txn_at=_sgt_datetime(int(match["day"]), match["month"], int(match["hour"]), int(match["minute"])),
            category="Transport",
            raw_parsed=match.groupdict(),
        )
    return None


_BANK_PARSERS = [
    ("dbs", _parse_dbs),
    ("uob", _parse_uob),
    ("simplygo", _parse_simplygo),
]


def parse_email(text: str, sender: str) -> ParsedTxn | None:
    sender_lower = sender.lower()
    for keyword, parser_fn in _BANK_PARSERS:
        if keyword in sender_lower:
            result = parser_fn(text)
            if result is not None:
                return result
    return None


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
        type=parsed.type,
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
