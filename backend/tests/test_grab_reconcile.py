from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.services.grab_reconcile import (
    GRAB_RECEIPT_QUERY,
    GRAB_RECEIPT_SENDER,
    is_generic_grab_merchant,
    parse_grab_receipt,
    reconcile_grab_transaction,
)

SGT = ZoneInfo("Asia/Singapore")

GRAB_FOOD_RECEIPT_TEXT = (
    "Your GrabFood receipt Thanks for ordering with GrabFood! Order #GF-88213012 "
    "Chicken Rice Stall x1 S$7.20 Delivery fee S$2.60 Total S$9.80 Paid with DBS card "
    "ending 1234 We hope you enjoyed your meal."
)
GRAB_MART_RECEIPT_TEXT = "Your GrabMart receipt Thanks for shopping with GrabMart! Total S$32.10 Paid with DBS card."
GRAB_EXPRESS_RECEIPT_TEXT = "Your GrabExpress receipt Your parcel has been delivered. Total S$6.00 Paid with DBS card."
GRAB_RIDE_RECEIPT_TEXT = (
    "Your Grab receipt Thanks for riding with Grab! Trip from Tampines to Changi Airport "
    "Total S$18.50 Paid with DBS card ending 1234."
)


@pytest.mark.parametrize(
    "merchant, expected",
    [
        ("GRAB", True),
        ("Grab* 2-C8CKWF5ZVUJVN6", True),
        ("GRABFOOD", False),  # no word boundary between B and F -- already-specific, no re-check needed
        ("GOJEK", False),
        ("SAIZERIYA - POIZ CENTRE", False),
    ],
)
def test_is_generic_grab_merchant(merchant, expected):
    assert is_generic_grab_merchant(merchant) == expected


def test_parse_grab_receipt_identifies_grabfood():
    receipt = parse_grab_receipt(GRAB_FOOD_RECEIPT_TEXT)
    assert receipt is not None
    assert receipt.amount == Decimal("9.80")
    assert receipt.category == "Food"


def test_parse_grab_receipt_identifies_grabmart():
    receipt = parse_grab_receipt(GRAB_MART_RECEIPT_TEXT)
    assert receipt is not None
    assert receipt.amount == Decimal("32.10")
    assert receipt.category == "Groceries"


def test_parse_grab_receipt_identifies_grabexpress():
    receipt = parse_grab_receipt(GRAB_EXPRESS_RECEIPT_TEXT)
    assert receipt is not None
    assert receipt.amount == Decimal("6.00")
    assert receipt.category == "Other"


def test_parse_grab_receipt_returns_none_for_a_ride():
    # A ride receipt has no recognized service keyword -- this means "no override", the caller
    # keeps the default Transport/Private classification.
    assert parse_grab_receipt(GRAB_RIDE_RECEIPT_TEXT) is None


def test_parse_grab_receipt_returns_none_without_an_amount():
    assert parse_grab_receipt("Your GrabFood receipt, thanks for ordering!") is None


class _FakeMailService:
    def __init__(self, stubs, messages, senders, bodies):
        self.stubs = stubs
        self.messages = messages
        self.senders = senders
        self.bodies = bodies
        self.list_calls = []

    def list_bank_messages(self, access_token, query=None):
        self.list_calls.append(query)
        return self.stubs

    def fetch_message(self, access_token, message_id):
        return self.messages[message_id]

    def get_sender(self, message):
        return self.senders[message["id"]]

    def extract_plain_text(self, message):
        return self.bodies[message["id"]]


def test_reconcile_grab_transaction_matches_grabfood_receipt_by_amount():
    mail_service = _FakeMailService(
        stubs=[{"id": "receipt-1"}],
        messages={"receipt-1": {"id": "receipt-1"}},
        senders={"receipt-1": f"Grab <{GRAB_RECEIPT_SENDER}>"},
        bodies={"receipt-1": GRAB_FOOD_RECEIPT_TEXT},
    )

    result = reconcile_grab_transaction(
        mail_service, "fake-token", "GRAB", Decimal("9.80"), datetime(2026, 5, 12, 12, 30, tzinfo=SGT)
    )

    assert result == ("Food", "Lunch")
    assert mail_service.list_calls == [GRAB_RECEIPT_QUERY]


def test_reconcile_grab_transaction_returns_none_when_amount_does_not_match():
    mail_service = _FakeMailService(
        stubs=[{"id": "receipt-1"}],
        messages={"receipt-1": {"id": "receipt-1"}},
        senders={"receipt-1": f"Grab <{GRAB_RECEIPT_SENDER}>"},
        bodies={"receipt-1": GRAB_FOOD_RECEIPT_TEXT},
    )

    result = reconcile_grab_transaction(
        mail_service, "fake-token", "GRAB", Decimal("99.99"), datetime(2026, 5, 12, 12, 30, tzinfo=SGT)
    )

    assert result is None


def test_reconcile_grab_transaction_returns_none_for_a_ride_receipt():
    mail_service = _FakeMailService(
        stubs=[{"id": "receipt-1"}],
        messages={"receipt-1": {"id": "receipt-1"}},
        senders={"receipt-1": f"Grab <{GRAB_RECEIPT_SENDER}>"},
        bodies={"receipt-1": GRAB_RIDE_RECEIPT_TEXT},
    )

    result = reconcile_grab_transaction(
        mail_service, "fake-token", "GRAB", Decimal("18.50"), datetime(2026, 5, 12, 12, 30, tzinfo=SGT)
    )

    assert result is None


def test_reconcile_grab_transaction_ignores_non_grab_sender():
    mail_service = _FakeMailService(
        stubs=[{"id": "spam-1"}],
        messages={"spam-1": {"id": "spam-1"}},
        senders={"spam-1": "promo@somewhere-else.com"},
        bodies={"spam-1": GRAB_FOOD_RECEIPT_TEXT},
    )

    result = reconcile_grab_transaction(
        mail_service, "fake-token", "GRAB", Decimal("9.80"), datetime(2026, 5, 12, 12, 30, tzinfo=SGT)
    )

    assert result is None


def test_reconcile_grab_transaction_never_raises_on_mail_service_failure():
    class _BrokenMailService:
        def list_bank_messages(self, access_token, query=None):
            raise RuntimeError("network error")

    result = reconcile_grab_transaction(
        _BrokenMailService(), "fake-token", "GRAB", Decimal("9.80"), datetime(2026, 5, 12, 12, 30, tzinfo=SGT)
    )

    assert result is None
