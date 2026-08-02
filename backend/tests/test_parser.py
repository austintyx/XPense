from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from app.models import DirectionEnum, ProviderEnum, Transaction
from app.services.parser import parse_email, save_parsed_transaction

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "emails"

# Irrelevant to every parser except YouTrip's (the only one that infers a date from the email's
# own received time rather than an explicit date in the body) -- a fixed sentinel is enough for
# every other fixture.
_RECEIVED_AT = datetime(2026, 7, 25, 12, 0, tzinfo=timezone.utc)


def _load(name: str) -> str:
    return (FIXTURES_DIR / name).read_text().strip()


CASES = [
    pytest.param(
        "dbs_paynow_merchant.txt",
        "ibanking.alert@dbs.com",
        dict(
            amount=Decimal("87.00"),
            currency="SGD",
            merchant_raw="24HRS CITY FLORIST",
            direction=DirectionEnum.debit,
            bank="DBS",
        ),
        dict(day=22, month=7, hour=18, minute=1),
        id="dbs_paynow_merchant",
    ),
    pytest.param(
        "dbs_paynow_person.txt",
        "ibanking.alert@dbs.com",
        dict(
            amount=Decimal("2.20"),
            currency="SGD",
            merchant_raw="LEX KOX SIXX",
            direction=DirectionEnum.debit,
            bank="DBS",
        ),
        dict(day=21, month=7, hour=14, minute=26),
        id="dbs_paynow_person",
    ),
    pytest.param(
        "dbs_nets.txt",
        "ibanking.alert@dbs.com",
        dict(
            amount=Decimal("6.00"),
            currency="SGD",
            merchant_raw="CHICKEN RICE",
            direction=DirectionEnum.debit,
            bank="DBS",
        ),
        dict(day=21, month=7, hour=14, minute=25),
        id="dbs_nets",
    ),
    pytest.param(
        "dbs_paynow_received.txt",
        "ibanking.alert@dbs.com",
        dict(
            amount=Decimal("17.40"),
            currency="SGD",
            merchant_raw="LOU SIM TENG",
            direction=DirectionEnum.credit,
            bank="DBS",
        ),
        dict(day=23, month=7, hour=22, minute=31, year=2026),
        id="dbs_paynow_received",
    ),
    pytest.param(
        "dbs_own_transfer.txt",
        "alerts@dbs.com.sg",
        dict(
            amount=Decimal("200.00"),
            currency="SGD",
            direction=DirectionEnum.debit,
            bank="DBS",
        ),
        dict(day=21, month=7, hour=14, minute=20),
        id="dbs_own_transfer",
    ),
    pytest.param(
        "dbs_card_transaction_alert.txt",
        "ibanking.alert@dbs.com",
        dict(
            amount=Decimal("45.00"),
            currency="SGD",
            merchant_raw="NTUC FAIRPRICE",
            direction=DirectionEnum.debit,
            bank="DBS",
        ),
        dict(day=24, month=7, hour=18, minute=58),
        id="dbs_card_transaction_alert",
    ),
    pytest.param(
        "dbs_paylah_transfer.txt",
        "paylah.alerts@dbs.com",
        dict(
            amount=Decimal("20.00"),
            currency="SGD",
            merchant_raw="egg",
            direction=DirectionEnum.debit,
            bank="DBS",
        ),
        dict(day=20, month=7, hour=2, minute=52),
        id="dbs_paylah_transfer",
    ),
    pytest.param(
        "dbs_fast_transfer.txt",
        "ibanking.alert@dbs.com",
        dict(
            amount=Decimal("500.00"),
            currency="SGD",
            merchant_raw="Austin",
            direction=DirectionEnum.debit,
            bank="DBS",
        ),
        dict(day=23, month=7, hour=11, minute=4),
        id="dbs_fast_transfer",
    ),
    pytest.param(
        "uob_paynow.txt",
        "alerts@uob.com.sg",
        dict(
            amount=Decimal("200.00"),
            currency="SGD",
            direction=DirectionEnum.debit,
            bank="UOB",
        ),
        dict(day=18, month=7, hour=19, minute=37, year=2026),
        id="uob_paynow",
    ),
    pytest.param(
        "simplygo_fare.txt",
        "noreply@simplygo.com.sg",
        dict(
            amount=Decimal("1.38"),
            currency="SGD",
            merchant_raw="Transit: Kovan-Sengkang",
            direction=DirectionEnum.debit,
            bank="SimplyGo",
            category="Transport",
        ),
        dict(day=22, month=7, hour=22, minute=46),
        id="simplygo_fare",
    ),
]


@pytest.mark.parametrize("fixture, sender, expected, expected_dt", CASES)
def test_parses_expected_fields(fixture, sender, expected, expected_dt):
    text = _load(fixture)
    results = parse_email(text, sender, _RECEIVED_AT)

    assert len(results) == 1
    result = results[0]
    for key, value in expected.items():
        assert getattr(result, key) == value, key

    assert result.txn_at.tzinfo is not None
    assert result.txn_at.utcoffset().total_seconds() == 8 * 3600  # SGT = UTC+8
    assert result.txn_at.day == expected_dt["day"]
    assert result.txn_at.month == expected_dt["month"]
    assert result.txn_at.hour == expected_dt["hour"]
    assert result.txn_at.minute == expected_dt["minute"]
    if "year" in expected_dt:
        assert result.txn_at.year == expected_dt["year"]


def test_unparseable_email_returns_empty_list():
    text = _load("unparseable_unknown_format.txt")
    assert parse_email(text, "alerts@dbs.com.sg", _RECEIVED_AT) == []


def test_dedup_on_source_email_id(db_session, user):
    text = _load("dbs_paynow_merchant.txt")
    results = parse_email(text, "alerts@dbs.com.sg", _RECEIVED_AT)
    assert len(results) == 1
    parsed = results[0]

    first = save_parsed_transaction(db_session, user.id, "msg-123", ProviderEnum.google, parsed)
    second = save_parsed_transaction(db_session, user.id, "msg-123", ProviderEnum.google, parsed)

    assert first.id == second.id
    count = db_session.query(Transaction).filter_by(source_email_id="msg-123").count()
    assert count == 1


YOUTRIP_SENDER = "noreply=you.co@mail.you.co"
# 10:03 AM SGT -- matches the real screenshot's status bar clock.
YOUTRIP_RECEIVED_AT = datetime(2026, 7, 25, 2, 3, tzinfo=timezone.utc)


def test_youtrip_single_transaction():
    text = _load("youtrip_single.txt")
    results = parse_email(text, YOUTRIP_SENDER, YOUTRIP_RECEIVED_AT)

    assert len(results) == 1
    txn = results[0]
    assert txn.amount == Decimal("358.00")
    assert txn.currency == "CHF"
    assert txn.merchant_raw == "SBB CFF FFS Ticket Sho, Bern"
    assert txn.direction == DirectionEnum.debit
    assert txn.bank == "YouTrip"
    assert txn.dedup_suffix == "SFT-1372409889"
    # 3:42 PM is later in the day than the email's own 10:03 AM received time -- for a rolling
    # "last 24 hours" digest, that can only mean the day before.
    assert txn.txn_at.day == 24
    assert txn.txn_at.hour == 15
    assert txn.txn_at.minute == 42


def test_youtrip_multiple_transactions_in_one_digest_with_per_item_date_inference():
    # One digest email straddling midnight -- each transaction's date must be inferred
    # independently, not once for the whole email.
    text = _load("youtrip_multi.txt")
    results = parse_email(text, YOUTRIP_SENDER, YOUTRIP_RECEIVED_AT)

    assert len(results) == 2
    first, second = results

    assert first.merchant_raw == "SBB CFF FFS Ticket Sho, Bern"
    assert first.currency == "CHF"
    assert first.dedup_suffix == "SFT-1372409889"
    assert first.txn_at.day == 24  # 3:42 PM > 10:03 AM received time -> previous day
    assert first.txn_at.hour == 15

    assert second.merchant_raw == "COOP Pronto Zurich HB"
    assert second.currency == "USD"
    assert second.dedup_suffix == "SFT-1372409901"
    assert second.txn_at.day == 25  # 9:15 AM < 10:03 AM received time -> same day
    assert second.txn_at.hour == 9


def test_youtrip_real_sample_strips_icon_label_and_stray_digit_token():
    # Built from a real YouTrip email the human forwarded -- unlike the two screenshot-derived
    # fixtures above, this one has a per-row icon that renders as a literal "Image" text token
    # right before the merchant name, and a stray digit token (card-last-digits or similar)
    # between the merchant/address text and the currency. Both must be excluded from the parsed
    # merchant name rather than absorbed into it.
    text = _load("youtrip_real_sample.txt")
    results = parse_email(text, YOUTRIP_SENDER, YOUTRIP_RECEIVED_AT)

    assert len(results) == 1
    txn = results[0]
    assert txn.merchant_raw == "GRAB RIDES-EC~GPAY NETWORK (M) SD~PETALING JAYA~47800 MY"
    assert txn.currency == "MYR"
    assert txn.amount == Decimal("45.32")
    assert txn.dedup_suffix == "SFT-1498050209"
    # 4:09 PM is later in the day than the email's own 10:03 AM received time -> previous day.
    assert txn.txn_at.day == 24
    assert txn.txn_at.hour == 16
    assert txn.txn_at.minute == 9


def test_youtrip_no_match_returns_empty_list():
    text = _load("unparseable_unknown_format.txt")
    assert parse_email(text, YOUTRIP_SENDER, YOUTRIP_RECEIVED_AT) == []
