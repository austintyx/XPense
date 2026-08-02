from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.config import settings
from app.models import DirectionEnum, MerchantCategoryCache
from app.services.categorize import (
    CREDIT_CATEGORIES,
    TRAVEL_SUBCATEGORIES,
    ai_category,
    categorize_transaction,
    food_subcategory,
    hardcoded_category,
    remember_category,
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
        ("RYDE", "Transport"),
        ("CDG Zig", "Transport"),
        ("TransCab", "Transport"),
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
        ("CHAGEE - Tampines West Community Club", 17),
        ("MIXUE Bishan", 10),
        ("HEYTEA ION Orchard", 15),
        ("ChaPanda Waterway Point", 12),
        ("Naixue Jewel Changi", 19),
        ("Molly Tea Clarke Quay", 21),
        ("Tiger Sugar Somerset", 16),
        ("PlayMade Bugis+", 13),
        ("Sharetea Jurong Point", 9),
        ("Chicha San Chen VivoCity", 20),
        ("Xing Fu Tang Tampines", 11),
        ("Kung Fu Tea NEX", 14),
        ("Kebuke Plaza Singapura", 15),
        ("Bober Tea Compass One", 16),
        ("TP TEA Suntec City", 18),
        ("Ten Ren's Tea Marina Square", 10),
        ("R&B Tea 313@Somerset", 13),
        ("Each-A-Cup AMK Hub", 14),
        ("The Whale Tea Junction 8", 15),
        ("Yocha Katong", 20),
        ("Bobii Frutii Northpoint", 12),
    ],
)
def test_food_subcategory_beverage_merchant_overrides_time(merchant, hour):
    # Beverage-type merchants are "Beverage" regardless of time of day.
    txn_at = datetime(2026, 7, 23, hour, 0, tzinfo=SGT)
    assert food_subcategory(merchant, txn_at) == "Beverage"


def test_food_subcategory_koi_word_boundary_does_not_match_unrelated_merchant():
    # "koi" is a common word (koi fish/ponds) -- must not false-positive on unrelated merchants
    # that happen to contain it as a substring without being the KOI bubble tea brand.
    txn_at = datetime(2026, 7, 23, 12, 0, tzinfo=SGT)
    assert food_subcategory("KOION SUSHI BAR", txn_at) != "Beverage"


@pytest.mark.parametrize(
    "merchant, expected",
    [
        ("BUS/MRT", "Public"),
        ("SBS Transit", "Public"),
        ("EZ-Link Top Up", "Public"),
        ("Grab* 2-C8CKWF5ZVUJVN6", "Private"),
        ("GOJEK", "Private"),
        ("Cabcharge Asia Pte Ltd", "Private"),
        ("RYDE", "Private"),
        ("CDG Zig", "Private"),
        ("TransCab", "Private"),
        ("SOME UNKNOWN CAB CO", "Others"),
    ],
)
def test_transport_subcategory(merchant, expected):
    assert transport_subcategory(merchant) == expected


def test_ai_category_returns_none_when_key_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", None)
    assert ai_category("SAIZERIYA - POIZ CENTRE", "DBS") is None


def test_ai_category_parses_mocked_response(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")

    class FakeResponse:
        text = "Food"

    class FakeModels:
        def generate_content(self, **kwargs):
            return FakeResponse()

    class FakeClient:
        def __init__(self, api_key):
            self.models = FakeModels()

    import app.services.categorize as categorize_module

    monkeypatch.setattr(categorize_module.genai, "Client", FakeClient)

    assert ai_category("SAIZERIYA - POIZ CENTRE", "DBS") == "Food"


def test_ai_category_returns_none_on_api_failure(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")

    class FakeClient:
        def __init__(self, api_key):
            raise RuntimeError("network error")

    import app.services.categorize as categorize_module

    monkeypatch.setattr(categorize_module.genai, "Client", FakeClient)

    assert ai_category("SAIZERIYA - POIZ CENTRE", "DBS") is None


def test_ai_category_returns_none_when_reply_does_not_match_a_known_category(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")

    class FakeResponse:
        text = "I'm not sure, maybe Restaurant?"

    class FakeModels:
        def generate_content(self, **kwargs):
            return FakeResponse()

    class FakeClient:
        def __init__(self, api_key):
            self.models = FakeModels()

    import app.services.categorize as categorize_module

    monkeypatch.setattr(categorize_module.genai, "Client", FakeClient)

    assert ai_category("SAIZERIYA - POIZ CENTRE", "DBS") is None


def test_categorize_transaction_prefers_hardcoded_and_skips_ai(monkeypatch, db_session):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("ai_category should not be called when hardcoded rules match")

    monkeypatch.setattr("app.services.categorize.ai_category", fail_if_called)

    category, subcategory = categorize_transaction(
        db_session, "BUS/MRT", "DBS", datetime(2026, 7, 23, 19, 0, tzinfo=SGT)
    )
    assert category == "Transport"
    assert subcategory == "Public"
    assert db_session.query(MerchantCategoryCache).count() == 0


def test_categorize_transaction_falls_back_to_ai_and_sets_food_subcategory(monkeypatch, db_session):
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank, categories=None: "Food")

    category, subcategory = categorize_transaction(
        db_session, "SAIZERIYA - POIZ CENTRE", "DBS", datetime(2026, 7, 23, 19, 0, tzinfo=SGT)
    )
    assert category == "Food"
    assert subcategory == "Dinner"


def test_categorize_transaction_caches_ai_result_and_skips_ai_on_repeat(monkeypatch, db_session):
    calls = []

    def fake_ai_category(merchant, bank, categories=None):
        calls.append(merchant)
        return "Food"

    monkeypatch.setattr("app.services.categorize.ai_category", fake_ai_category)

    txn_at = datetime(2026, 7, 23, 19, 0, tzinfo=SGT)
    first = categorize_transaction(db_session, "SAIZERIYA - POIZ CENTRE", "DBS", txn_at)
    assert first[0] == "Food"
    assert len(calls) == 1
    assert db_session.query(MerchantCategoryCache).count() == 1

    # Same merchant again (even with different whitespace/case) -- must hit the cache, not AI.
    second = categorize_transaction(db_session, "saizeriya -  poiz centre", "DBS", txn_at)
    assert second[0] == "Food"
    assert len(calls) == 1


def test_remember_category_overwrites_existing_cache_entry(db_session):
    remember_category(db_session, "SAIZERIYA", "Food")
    remember_category(db_session, "saizeriya", "Shopping")

    rows = db_session.query(MerchantCategoryCache).all()
    assert len(rows) == 1
    assert rows[0].category == "Shopping"


def test_categorize_transaction_credit_skips_hardcoded_rules_and_uses_credit_categories(monkeypatch, db_session):
    # "LOU SIM TENG" would never match a hardcoded rule anyway, but the point is that credit
    # transactions never even consult hardcoded_category (all expense-merchant patterns) -- go
    # straight to AI with the credit category list.
    seen_categories = []

    def fake_ai_category(merchant, bank, categories=None):
        seen_categories.append(categories)
        return "Transfer Received"

    monkeypatch.setattr("app.services.categorize.ai_category", fake_ai_category)

    category, subcategory = categorize_transaction(
        db_session, "LOU SIM TENG", "DBS", datetime(2026, 7, 23, 19, 0, tzinfo=SGT), DirectionEnum.credit
    )
    assert category == "Transfer Received"
    assert subcategory is None  # no subcategory concept for credit categories
    assert seen_categories == [CREDIT_CATEGORIES]


def test_categorize_transaction_debit_hardcoded_rule_is_never_consulted_for_credit(monkeypatch, db_session):
    # "BUS/MRT" hardcoded-matches Transport for a debit transaction -- for a credit transaction
    # with the exact same merchant string, that rule must not apply at all.
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank, categories=None: "Other Income")

    category, _ = categorize_transaction(
        db_session, "BUS/MRT", "DBS", datetime(2026, 7, 23, 19, 0, tzinfo=SGT), DirectionEnum.credit
    )
    assert category == "Other Income"


def test_merchant_cache_is_scoped_by_direction(monkeypatch, db_session):
    # The exact same merchant string, once as a debit and once as a credit transaction, must not
    # share a cached category between the two unrelated taxonomies.
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank, categories=None: (
        "Food" if categories is not CREDIT_CATEGORIES else "Gift"
    ))

    txn_at = datetime(2026, 7, 23, 19, 0, tzinfo=SGT)
    debit_category, _ = categorize_transaction(db_session, "SAME NAME", "DBS", txn_at, DirectionEnum.debit)
    credit_category, _ = categorize_transaction(db_session, "SAME NAME", "DBS", txn_at, DirectionEnum.credit)

    assert debit_category == "Food"
    assert credit_category == "Gift"
    assert db_session.query(MerchantCategoryCache).count() == 2


def test_categorize_transaction_overseas_routes_to_travel_and_classifies_subcategory(monkeypatch, db_session):
    seen_categories = []

    def fake_ai_category(merchant, bank, categories=None):
        seen_categories.append(categories)
        return "Transport"

    monkeypatch.setattr("app.services.categorize.ai_category", fake_ai_category)

    category, subcategory = categorize_transaction(
        db_session,
        "SBB CFF FFS Ticket Sho, Bern",
        "YouTrip",
        datetime(2026, 7, 24, 15, 42, tzinfo=SGT),
        DirectionEnum.debit,
        "CHF",
    )
    assert category == "Travel"
    assert subcategory == "Transport"
    assert seen_categories == [TRAVEL_SUBCATEGORIES]


def test_categorize_transaction_overseas_skips_hardcoded_rules(monkeypatch, db_session):
    # "BUS/MRT" hardcoded-matches Transport for a normal SGD debit transaction -- for the exact
    # same merchant string paid in a foreign currency, that rule must not apply; the transaction
    # always files under Travel regardless of what a local rule would have said.
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank, categories=None: "Transport")

    category, _ = categorize_transaction(
        db_session, "BUS/MRT", "YouTrip", datetime(2026, 7, 23, 19, 0, tzinfo=SGT), DirectionEnum.debit, "USD"
    )
    assert category == "Travel"


def test_categorize_transaction_overseas_caches_independently_of_debit_scope(monkeypatch, db_session):
    monkeypatch.setattr(
        "app.services.categorize.ai_category",
        lambda merchant, bank, categories=None: ("Food" if categories is TRAVEL_SUBCATEGORIES else "Groceries"),
    )

    txn_at = datetime(2026, 7, 23, 19, 0, tzinfo=SGT)
    debit_category, _ = categorize_transaction(db_session, "SAME NAME", "DBS", txn_at, DirectionEnum.debit, "SGD")
    travel_category, travel_subcategory = categorize_transaction(
        db_session, "SAME NAME", "YouTrip", txn_at, DirectionEnum.debit, "CHF"
    )

    assert debit_category == "Groceries"
    assert travel_category == "Travel"
    assert travel_subcategory == "Food"
    keys = {row.merchant_key for row in db_session.query(MerchantCategoryCache).all()}
    assert keys == {"debit:SAME NAME", "travel:SAME NAME"}


def test_categorize_transaction_overseas_ai_failure_still_sets_travel_with_no_subcategory(monkeypatch, db_session):
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank, categories=None: None)

    category, subcategory = categorize_transaction(
        db_session,
        "UNKNOWN MERCHANT",
        "YouTrip",
        datetime(2026, 7, 23, 19, 0, tzinfo=SGT),
        DirectionEnum.debit,
        "JPY",
    )
    assert category == "Travel"
    assert subcategory is None
