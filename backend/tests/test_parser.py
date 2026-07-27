from decimal import Decimal
from pathlib import Path

import pytest

from app.models import DirectionEnum, ProviderEnum, Transaction, TransactionTypeEnum
from app.services.parser import parse_email, save_parsed_transaction

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "emails"


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
            type=TransactionTypeEnum.expense,
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
            type=TransactionTypeEnum.expense,
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
            type=TransactionTypeEnum.expense,
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
            type=TransactionTypeEnum.transfer,
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
            type=TransactionTypeEnum.transfer,
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
            type=TransactionTypeEnum.expense,
            bank="DBS",
        ),
        dict(day=24, month=7, hour=18, minute=58),
        id="dbs_card_transaction_alert",
    ),
    pytest.param(
        "uob_paynow.txt",
        "alerts@uob.com.sg",
        dict(
            amount=Decimal("200.00"),
            currency="SGD",
            direction=DirectionEnum.debit,
            type=TransactionTypeEnum.expense,
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
            type=TransactionTypeEnum.expense,
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
    result = parse_email(text, sender)

    assert result is not None
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


def test_dbs_paynow_wording_containing_received_classifies_as_transfer():
    # Synthetic text (not a verified real DBS wording, unlike the fixtures above) exercising the
    # receive/received boundary directly: money coming *into* the account isn't spending, so it
    # should be a transfer even though the "To:" field still carries a PayNow id suffix.
    text = (
        "Dear Customer, You have received a PayNow payment. Date & Time: 23 Jul 09:15 (SGT) "
        "Amount: SGD50.00 From: JANE TAN To: JANE TAN (MOBILE ending 1234) If unauthorised, "
        "please call our DBS hotline."
    )
    result = parse_email(text, "ibanking.alert@dbs.com")
    assert result is not None
    assert result.type == TransactionTypeEnum.transfer


def test_unparseable_email_returns_none():
    text = _load("unparseable_unknown_format.txt")
    assert parse_email(text, "alerts@dbs.com.sg") is None


def test_dedup_on_source_email_id(db_session, user):
    text = _load("dbs_paynow_merchant.txt")
    parsed = parse_email(text, "alerts@dbs.com.sg")
    assert parsed is not None

    first = save_parsed_transaction(db_session, user.id, "msg-123", ProviderEnum.google, parsed)
    second = save_parsed_transaction(db_session, user.id, "msg-123", ProviderEnum.google, parsed)

    assert first.id == second.id
    count = db_session.query(Transaction).filter_by(source_email_id="msg-123").count()
    assert count == 1
