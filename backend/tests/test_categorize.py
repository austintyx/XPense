from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.config import settings
from app.services.categorize import (
    ai_category,
    categorize_transaction,
    food_subcategory,
    hardcoded_category,
    transport_subcategory,
)

SGT = ZoneInfo("Asia/Singapore")


@pytest.mark.parametrize(
    "merchant, expected",
    [
        ("BUS/MRT", "Transport"),
        ("Grab* 2-C8CKWF5ZVUJVN6", "Transport"),
        ("GOJEK", "Transport"),
        ("Gopay-Gojek", "Transport"),
        ("Cabcharge Asia Pte Ltd", "Transport"),
        ("SHENG SIONG SUPERMARKET", "Groceries"),
        ("SHOPEE SG MP", "Shopping"),
        ("Shaw Theatres shaw.sg", "Entertainment"),
        ("SINGTEL POST-PAID", "Bills"),
        ("GUARDIAN PHARMACY", "Health"),
    ],
)
def test_hardcoded_category_matches_real_merchants(merchant, expected):
    assert hardcoded_category(merchant) == expected


def test_hardcoded_category_returns_none_for_unknown_merchant():
    # a restaurant chain name with nothing recognizable in the string -- needs the AI step
    assert hardcoded_category("SAIZERIYA - POIZ CENTRE") is None


@pytest.mark.parametrize(
    "hour, expected",
    [
        (6, "Breakfast"),
        (9, "Breakfast"),
        (12, "Lunch"),
        (14, "Lunch"),
        (16, "Others"),
        (19, "Dinner"),
        (21, "Dinner"),
        (23, "Others"),
        (2, "Others"),
    ],
)
def test_food_subcategory_time_buckets(hour, expected):
    txn_at = datetime(2026, 7, 23, hour, 0, tzinfo=SGT)
    assert food_subcategory("SAIZERIYA - POIZ CENTRE", txn_at) == expected


@pytest.mark.parametrize(
    "merchant, hour",
    [
        ("STARBUCKS", 8),
        ("KOI THE", 14),
        ("Gong Cha Bugis", 20),
        ("LiHO TEA", 2),
    ],
)
def test_food_subcategory_beverage_merchant_overrides_time(merchant, hour):
    # Beverage-type merchants are "Beverage" regardless of time of day.
    txn_at = datetime(2026, 7, 23, hour, 0, tzinfo=SGT)
    assert food_subcategory(merchant, txn_at) == "Beverage"


@pytest.mark.parametrize(
    "merchant, expected",
    [
        ("BUS/MRT", "Public"),
        ("SBS Transit", "Public"),
        ("EZ-Link Top Up", "Public"),
        ("Grab* 2-C8CKWF5ZVUJVN6", "Private"),
        ("GOJEK", "Private"),
        ("Cabcharge Asia Pte Ltd", "Private"),
        ("SOME UNKNOWN CAB CO", "Others"),
    ],
)
def test_transport_subcategory(merchant, expected):
    assert transport_subcategory(merchant) == expected


def test_ai_category_returns_none_when_key_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", None)
    assert ai_category("SAIZERIYA - POIZ CENTRE", "DBS") is None


def test_ai_category_parses_mocked_response(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "test-key")

    class FakeParsedOutput:
        category = "Food"

    class FakeResponse:
        parsed_output = FakeParsedOutput()

    class FakeMessages:
        def parse(self, **kwargs):
            return FakeResponse()

    class FakeClient:
        def __init__(self, api_key):
            self.messages = FakeMessages()

    import app.services.categorize as categorize_module

    monkeypatch.setattr(categorize_module.anthropic, "Anthropic", FakeClient)

    assert ai_category("SAIZERIYA - POIZ CENTRE", "DBS") == "Food"


def test_ai_category_returns_none_on_api_failure(monkeypatch):
    monkeypatch.setattr(settings, "llm_api_key", "test-key")

    class FakeClient:
        def __init__(self, api_key):
            raise RuntimeError("network error")

    import app.services.categorize as categorize_module

    monkeypatch.setattr(categorize_module.anthropic, "Anthropic", FakeClient)

    assert ai_category("SAIZERIYA - POIZ CENTRE", "DBS") is None


def test_categorize_transaction_prefers_hardcoded_and_skips_ai(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("ai_category should not be called when hardcoded rules match")

    monkeypatch.setattr("app.services.categorize.ai_category", fail_if_called)

    category, subcategory = categorize_transaction("BUS/MRT", "DBS", datetime(2026, 7, 23, 19, 0, tzinfo=SGT))
    assert category == "Transport"
    assert subcategory == "Public"


def test_categorize_transaction_falls_back_to_ai_and_sets_food_subcategory(monkeypatch):
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank: "Food")

    category, subcategory = categorize_transaction(
        "SAIZERIYA - POIZ CENTRE", "DBS", datetime(2026, 7, 23, 19, 0, tzinfo=SGT)
    )
    assert category == "Food"
    assert subcategory == "Dinner"
