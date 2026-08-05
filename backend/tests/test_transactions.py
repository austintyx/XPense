import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.models import DirectionEnum, EmailAccount, MerchantCategoryCache, ProviderEnum, Transaction
from app.security.crypto import encrypt
from app.services import gmail
from app.services.categorize import categorize_transaction
from app.services.grab_reconcile import GRAB_RECEIPT_SENDER


@pytest.fixture(autouse=True)
def _no_real_fx_calls(monkeypatch):
    # create_manual_transaction/update_transaction_details call get_amount_in_sgd for every
    # amount/currency they're given (including the CHF fixtures below) -- never hit the real FX
    # API from this suite. Doubling a foreign amount is an arbitrary, easy-to-assert-on stand-in
    # for "some conversion happened"; SGD passes through unchanged, matching fx.py's own real
    # short-circuit behavior.
    monkeypatch.setattr(
        "app.routers.transactions.get_amount_in_sgd",
        lambda db, amount, currency, txn_at: amount if currency == "SGD" else amount * Decimal("2"),
    )


def _make_txn(db_session, user, **overrides):
    defaults = dict(
        user_id=user.id,
        source_email_id=f"test:{datetime.now(timezone.utc).timestamp()}:{id(overrides)}",
        provider=None,
        amount=Decimal("10.00"),
        currency="SGD",
        direction=DirectionEnum.debit,
        merchant_raw="TEST MERCHANT",
        merchant_clean="Test Merchant",
        category="Food",
        txn_at=datetime.now(timezone.utc),
        bank="DBS",
    )
    defaults.update(overrides)
    txn = Transaction(**defaults)
    db_session.add(txn)
    db_session.commit()
    db_session.refresh(txn)
    return txn


def test_list_returns_all_rows_newest_first_by_default(client, db_session, user):
    now = datetime.now(timezone.utc)
    older = _make_txn(db_session, user, merchant_raw="OLDER", txn_at=now - timedelta(days=2))
    newer = _make_txn(db_session, user, merchant_raw="NEWER", txn_at=now - timedelta(hours=1))
    credit = _make_txn(
        db_session,
        user,
        merchant_raw="A CREDIT",
        direction=DirectionEnum.credit,
        txn_at=now,
    )

    response = client.get("/transactions", params={"user_id": user.id})
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert ids == [credit.id, newer.id, older.id]  # newest first, no filter applied by default


def test_list_filters_by_direction_when_requested(client, db_session, user):
    now = datetime.now(timezone.utc)
    debit = _make_txn(db_session, user, merchant_raw="DEBIT ROW", txn_at=now)
    credit = _make_txn(
        db_session,
        user,
        merchant_raw="CREDIT ROW",
        direction=DirectionEnum.credit,
        txn_at=now,
    )

    response = client.get("/transactions", params={"user_id": user.id, "direction": "credit"})
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert ids == [credit.id]
    assert debit.id not in ids


def test_category_update_persists(client, db_session, user):
    txn = _make_txn(db_session, user, category=None)

    response = client.post(f"/transactions/{txn.id}/category", json={"category": "Food"})
    assert response.status_code == 200
    assert response.json()["category"] == "Food"

    listing = client.get("/transactions", params={"user_id": user.id})
    row = next(r for r in listing.json() if r["id"] == txn.id)
    assert row["category"] == "Food"


def test_category_update_accepts_explicit_subcategory(client, db_session, user):
    txn = _make_txn(db_session, user, category=None, subcategory=None)

    response = client.post(
        f"/transactions/{txn.id}/category", json={"category": "Food", "subcategory": "Drinks"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["category"] == "Food"
    assert body["subcategory"] == "Drinks"


def test_category_update_without_subcategory_clears_it(client, db_session, user):
    """The categorise sheet always sends the subcategory it decided on (or none for non-Food
    categories) -- a plain recategorise should not leave a stale subcategory behind."""
    txn = _make_txn(db_session, user, category="Food", subcategory="Dinner")

    response = client.post(f"/transactions/{txn.id}/category", json={"category": "Transport"})
    assert response.status_code == 200
    body = response.json()
    assert body["category"] == "Transport"
    assert body["subcategory"] is None


def test_category_update_with_country_sets_it_for_a_travel_categorization(client, db_session, user):
    txn = _make_txn(db_session, user, category=None, currency="CHF", country=None)

    response = client.post(
        f"/transactions/{txn.id}/category",
        json={"category": "Travel", "subcategory": "Transport", "country": "Switzerland"},
    )
    assert response.status_code == 200
    assert response.json()["country"] == "Switzerland"

    db_session.refresh(txn)
    assert txn.country == "Switzerland"


def test_category_update_without_country_never_wipes_an_already_set_one(client, db_session, user):
    """The categorize endpoint is hit by every category pick, including plain re-categorizations
    that never mention country at all -- CategoryUpdateIn.country defaults to None, so this must
    not be treated as "clear the country" or every unrelated recategorize would silently wipe it."""
    txn = _make_txn(db_session, user, category="Travel", currency="CHF", country="Switzerland")

    response = client.post(f"/transactions/{txn.id}/category", json={"category": "Travel", "subcategory": "Food"})
    assert response.status_code == 200
    assert response.json()["country"] == "Switzerland"

    db_session.refresh(txn)
    assert txn.country == "Switzerland"


def test_category_update_remembers_the_category_for_future_transactions_from_the_same_merchant(
    monkeypatch, client, db_session, user
):
    txn = _make_txn(db_session, user, merchant_raw="Saizeriya - Poiz Centre", category=None)

    response = client.post(f"/transactions/{txn.id}/category", json={"category": "Food"})
    assert response.status_code == 200

    cached = (
        db_session.query(MerchantCategoryCache)
        .filter_by(merchant_key="debit:SAIZERIYA - POIZ CENTRE")
        .one_or_none()
    )
    assert cached is not None
    assert cached.category == "Food"

    # A brand new transaction from the same merchant is categorized from the cache alone, no AI call.
    def fail_if_called(*args, **kwargs):
        raise AssertionError("ai_category should not be called once the cache has this merchant")

    monkeypatch.setattr("app.services.categorize.ai_category", fail_if_called)
    category, _ = categorize_transaction(
        db_session, "Saizeriya - Poiz Centre", "DBS", datetime.now(timezone.utc)
    )
    assert category == "Food"


def test_category_update_overwrites_a_previously_cached_category(client, db_session, user):
    first = _make_txn(db_session, user, merchant_raw="SOME CAFE", category=None)
    client.post(f"/transactions/{first.id}/category", json={"category": "Other"})

    second = _make_txn(db_session, user, merchant_raw="SOME CAFE", category=None)
    client.post(f"/transactions/{second.id}/category", json={"category": "Food"})

    rows = db_session.query(MerchantCategoryCache).filter_by(merchant_key="debit:SOME CAFE").all()
    assert len(rows) == 1
    assert rows[0].category == "Food"


def test_update_transaction_details_persists_merchant_and_amount(client, db_session, user):
    txn = _make_txn(db_session, user, merchant_raw="RAW NAME", merchant_clean="Raw Name", amount=Decimal("10.00"))

    response = client.patch(
        f"/transactions/{txn.id}/details",
        params={"user_id": user.id},
        json={"merchant": "Corrected Merchant", "amount": "12.50"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["merchant_raw"] == "Corrected Merchant"
    assert body["merchant_clean"] == "Corrected Merchant"
    assert Decimal(str(body["amount"])) == Decimal("12.50")

    db_session.refresh(txn)
    assert txn.merchant_raw == "Corrected Merchant"
    assert txn.amount == Decimal("12.50")


def test_update_transaction_details_persists_country_for_a_travel_transaction(client, db_session, user):
    txn = _make_txn(db_session, user, category="Travel", currency="CHF", country=None)

    response = client.patch(
        f"/transactions/{txn.id}/details",
        params={"user_id": user.id},
        json={"merchant": "SBB CFF FFS", "amount": "358.00", "country": "Switzerland"},
    )
    assert response.status_code == 200
    assert response.json()["country"] == "Switzerland"
    # amount_sgd must be recomputed against the new amount, not left stale from before the edit
    # (the autouse FX mock above doubles a foreign amount).
    assert Decimal(str(response.json()["amount_sgd"])) == Decimal("716.00")

    db_session.refresh(txn)
    assert txn.country == "Switzerland"
    assert txn.amount_sgd == Decimal("716.00")


def test_update_transaction_details_rejects_blank_merchant_or_non_positive_amount(client, db_session, user):
    txn = _make_txn(db_session, user)

    blank = client.patch(
        f"/transactions/{txn.id}/details",
        params={"user_id": user.id},
        json={"merchant": "   ", "amount": "5.00"},
    )
    assert blank.status_code == 400

    zero = client.patch(
        f"/transactions/{txn.id}/details",
        params={"user_id": user.id},
        json={"merchant": "Fine", "amount": "0.00"},
    )
    assert zero.status_code == 400


def test_update_transaction_details_404s_for_another_users_row(client, db_session, user):
    from app.models import User

    other_user = User(email="other-edit@xpense.dev", name="Other")
    db_session.add(other_user)
    db_session.commit()
    db_session.refresh(other_user)
    txn = _make_txn(db_session, other_user)

    response = client.patch(
        f"/transactions/{txn.id}/details",
        params={"user_id": user.id},
        json={"merchant": "Hacked", "amount": "1.00"},
    )
    assert response.status_code == 404


def test_manual_add_creates_row(client, user):
    payload = {
        "user_id": user.id,
        "amount": "19.80",
        "currency": "SGD",
        "direction": "debit",
        "merchant_raw": "Star Western",
        "category": "Food",
        "txn_at": datetime.now(timezone.utc).isoformat(),
        "bank": None,
    }
    response = client.post("/transactions", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["merchant_raw"] == "Star Western"
    assert Decimal(str(body["amount"])) == Decimal("19.80")

    listing = client.get("/transactions", params={"user_id": user.id})
    assert any(r["id"] == body["id"] for r in listing.json())


def test_manual_add_with_a_category_remembers_it_for_the_merchant(client, db_session, user):
    payload = {
        "user_id": user.id,
        "amount": "19.80",
        "currency": "SGD",
        "direction": "debit",
        "merchant_raw": "Star Western",
        "category": "Food",
        "txn_at": datetime.now(timezone.utc).isoformat(),
        "bank": None,
    }
    response = client.post("/transactions", json=payload)
    assert response.status_code == 201

    cached = db_session.query(MerchantCategoryCache).filter_by(merchant_key="debit:STAR WESTERN").one_or_none()
    assert cached is not None
    assert cached.category == "Food"


def test_manual_add_without_a_category_does_not_error_or_write_the_cache(client, db_session, user):
    payload = {
        "user_id": user.id,
        "amount": "5.00",
        "currency": "SGD",
        "direction": "debit",
        "merchant_raw": "Unnamed Stall",
        "txn_at": datetime.now(timezone.utc).isoformat(),
        "bank": None,
    }
    response = client.post("/transactions", json=payload)
    assert response.status_code == 201
    assert db_session.query(MerchantCategoryCache).count() == 0


def test_manual_add_with_travel_category_stores_country(client, user):
    payload = {
        "user_id": user.id,
        "amount": "358.00",
        "currency": "CHF",
        "direction": "debit",
        "merchant_raw": "SBB CFF FFS",
        "category": "Travel",
        "subcategory": "Transport",
        "country": "Switzerland",
        "txn_at": datetime.now(timezone.utc).isoformat(),
        "bank": None,
    }
    response = client.post("/transactions", json=payload)
    assert response.status_code == 201
    assert response.json()["country"] == "Switzerland"
    assert Decimal(str(response.json()["amount_sgd"])) == Decimal("716.00")


def test_manual_add_with_sgd_currency_sets_amount_sgd_to_the_same_amount(client, user):
    payload = {
        "user_id": user.id,
        "amount": "19.80",
        "currency": "SGD",
        "direction": "debit",
        "merchant_raw": "Star Western",
        "category": "Food",
        "txn_at": datetime.now(timezone.utc).isoformat(),
        "bank": None,
    }
    response = client.post("/transactions", json=payload)
    assert response.status_code == 201
    assert Decimal(str(response.json()["amount_sgd"])) == Decimal("19.80")


def test_manual_add_accepts_food_subcategory(client, user):
    payload = {
        "user_id": user.id,
        "amount": "8.40",
        "currency": "SGD",
        "direction": "debit",
        "merchant_raw": "Tiong Bahru Bakery",
        "category": "Food",
        "subcategory": "Coffee",
        "txn_at": datetime.now(timezone.utc).isoformat(),
        "bank": None,
    }
    response = client.post("/transactions", json=payload)
    assert response.status_code == 201
    assert response.json()["subcategory"] == "Coffee"


def test_categorize_pending_backfills_hardcoded_matchable_rows(client, db_session, user, monkeypatch):
    # This test is about the hardcoded-rule/subcategory backfill path specifically, not the AI
    # step -- pin it off so the test stays deterministic regardless of whether a real
    # GEMINI_API_KEY happens to be configured in the local/CI environment's .env.
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank, categories=None: None)

    uncategorized = _make_txn(db_session, user, merchant_raw="BUS/MRT", category=None)
    already_done = _make_txn(db_session, user, merchant_raw="SOMETHING", category="Shopping")
    unresolvable = _make_txn(db_session, user, merchant_raw="ZZZZZ UNKNOWN MERCHANT", category=None)
    stale_food = _make_txn(
        db_session,
        user,
        merchant_raw="CHICKEN RICE",
        category="Food",
        subcategory=None,
        txn_at=datetime(2026, 7, 23, 19, 0, tzinfo=timezone.utc).astimezone(),
    )
    stale_transport = _make_txn(
        db_session,
        user,
        merchant_raw="BUS/MRT",
        category="Transport",
        subcategory=None,
    )

    response = client.post("/transactions/categorize-pending", params={"user_id": user.id})
    assert response.status_code == 200
    body = response.json()
    assert body["categorized"] == 1
    assert body["remaining"] == 1

    db_session.refresh(uncategorized)
    db_session.refresh(already_done)
    db_session.refresh(unresolvable)
    db_session.refresh(stale_food)
    db_session.refresh(stale_transport)
    assert uncategorized.category == "Transport"
    assert already_done.category == "Shopping"  # untouched, wasn't pending
    assert unresolvable.category is None  # no hardcoded match, no AI key configured in tests
    assert stale_food.subcategory is not None  # backfilled even though category predates this feature
    assert stale_transport.subcategory == "Public"  # backfilled from merchant name


def test_categorize_pending_backfills_a_currency_field_into_travel_routing(client, db_session, user, monkeypatch):
    """A pre-existing uncategorized non-SGD row (e.g. synced before Travel routing shipped, or
    where the AI call failed on first try) must still route to Travel when backfilled via
    "Categorize pending" -- not silently fall through to the normal SGD/CATEGORIES path for lack
    of a currency argument."""
    monkeypatch.setattr("app.services.categorize.ai_category", lambda merchant, bank, categories=None: None)

    overseas = _make_txn(db_session, user, merchant_raw="SBB CFF FFS", category=None, currency="CHF", bank="YouTrip")

    response = client.post("/transactions/categorize-pending", params={"user_id": user.id})
    assert response.status_code == 200

    db_session.refresh(overseas)
    assert overseas.category == "Travel"


def test_categorize_pending_reconciles_a_generic_grab_transport_row_against_a_matching_receipt(
    client, db_session, user, monkeypatch
):
    """Reproduces fixing the real-world misfiled case: a GrabFood order that landed as Transport
    just because the bank alert only ever says "GRAB" gets flipped to Food once a matching
    (same-amount) Grab receipt email is found."""
    account = EmailAccount(
        user_id=user.id,
        provider=ProviderEnum.google,
        provider_email="demo@gmail.example",
        access_token_enc=encrypt("fake-access-token"),
        refresh_token_enc=encrypt("fake-refresh-token"),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(account)
    db_session.commit()

    grab_txn = _make_txn(
        db_session,
        user,
        merchant_raw="GRAB",
        category="Transport",
        subcategory="Private",
        provider=ProviderEnum.google,
        amount=Decimal("9.80"),
        txn_at=datetime(2026, 5, 12, 12, 30, tzinfo=ZoneInfo("Asia/Singapore")),
    )

    receipt_message = {
        "id": "receipt-1",
        "payload": {
            "headers": [{"name": "From", "value": f"Grab <{GRAB_RECEIPT_SENDER}>"}],
            "mimeType": "text/plain",
            "body": {
                "data": base64.urlsafe_b64encode(
                    b"Your GrabFood receipt Thanks for ordering with GrabFood! Order from:Nasi "
                    b"Lemak Corner Profile:Personal Total S$9.80 Paid with DBS card ending 1234."
                ).decode()
            },
        },
    }

    monkeypatch.setattr(
        gmail,
        "list_messages_from_sender",
        lambda access_token, sender_email, around, window=None: [{"id": "receipt-1"}],
    )
    monkeypatch.setattr(gmail, "fetch_message", lambda access_token, message_id: receipt_message)

    response = client.post("/transactions/categorize-pending", params={"user_id": user.id})
    assert response.status_code == 200

    db_session.refresh(grab_txn)
    assert grab_txn.category == "Food"
    assert grab_txn.subcategory == "Lunch"
    assert grab_txn.merchant_raw == "Nasi Lemak Corner"  # not the bank's generic "GRAB" string
    assert grab_txn.merchant_clean == "Nasi Lemak Corner"


def test_delete_transaction_removes_the_row(client, db_session, user):
    txn = _make_txn(db_session, user)

    response = client.delete(f"/transactions/{txn.id}", params={"user_id": user.id})
    assert response.status_code == 204

    listing = client.get("/transactions", params={"user_id": user.id})
    assert txn.id not in [r["id"] for r in listing.json()]


def test_delete_transaction_404s_for_another_users_row(client, db_session, user):
    from app.models import User

    other_user = User(email="other@xpense.dev", name="Other")
    db_session.add(other_user)
    db_session.commit()
    db_session.refresh(other_user)
    txn = _make_txn(db_session, other_user)

    response = client.delete(f"/transactions/{txn.id}", params={"user_id": user.id})
    assert response.status_code == 404


def test_summary_sums_debit_categories_and_excludes_credit_rows(client, db_session, user):
    now = datetime.now(timezone.utc)
    _make_txn(db_session, user, category="Food", amount=Decimal("10.00"), txn_at=now)
    _make_txn(db_session, user, category="Food", amount=Decimal("5.00"), txn_at=now)
    _make_txn(db_session, user, category="Transport", amount=Decimal("2.00"), txn_at=now)
    # an uncategorized debit row (e.g. a self-transfer between the user's own accounts) now counts
    # toward spend -- direction is the only signal left, and this is still money leaving the
    # account, so it's included (confirmed with the user as an accepted consequence of removing
    # the old `type` field).
    _make_txn(
        db_session,
        user,
        category=None,
        amount=Decimal("200.00"),
        txn_at=now,
    )
    # received money (credit direction) - excluded from the spend summary
    _make_txn(
        db_session,
        user,
        category=None,
        amount=Decimal("50.00"),
        direction=DirectionEnum.credit,
        txn_at=now,
    )
    # outside the current month - should be excluded from the summary
    _make_txn(
        db_session,
        user,
        category="Food",
        amount=Decimal("999.00"),
        txn_at=now - timedelta(days=45),
    )

    response = client.get("/summary", params={"user_id": user.id})
    assert response.status_code == 200
    body = response.json()
    totals = {c["category"]: Decimal(str(c["total"])) for c in body["categories"]}
    assert totals["Food"] == Decimal("15.00")
    assert totals["Transport"] == Decimal("2.00")
    assert totals[None] == Decimal("200.00")
    assert Decimal(str(body["total"])) == Decimal("217.00")


def test_summary_uses_singapore_local_month_boundary_not_utc(client, db_session, user, monkeypatch):
    # A timestamp that's still 31 Jul in UTC is already 1 Aug in Singapore (UTC+8) -- the summary
    # for "this month" must be anchored to SGT (this app's only real users), or a transaction like
    # this either silently falls out of the current month's total or leaks into the wrong one,
    # which is exactly the bug that produced a Summary-screen total that didn't tally.
    fake_now_sgt = datetime(2026, 8, 15, 12, 0, tzinfo=ZoneInfo("Asia/Singapore"))

    class _FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fake_now_sgt

    monkeypatch.setattr("app.routers.transactions.datetime", _FrozenDatetime)

    # 2026-07-31T18:00:00Z = 2026-08-01T02:00:00+08:00 -- August in SGT, still July in UTC.
    just_after_sgt_midnight = datetime(2026, 7, 31, 18, 0, tzinfo=timezone.utc)
    _make_txn(db_session, user, category="Food", amount=Decimal("16.25"), txn_at=just_after_sgt_midnight)

    response = client.get("/summary", params={"user_id": user.id})
    assert response.status_code == 200
    body = response.json()
    assert body["month"] == "2026-08"
    assert Decimal(str(body["total"])) == Decimal("16.25")


def test_summary_sums_amount_sgd_not_raw_amount_for_foreign_currency_rows(client, db_session, user):
    now = datetime.now(timezone.utc)
    _make_txn(db_session, user, category="Food", amount=Decimal("10.00"), currency="SGD", amount_sgd=Decimal("10.00"), txn_at=now)
    # Foreign-currency row: raw `amount` is 100 CHF, but amount_sgd (already converted) is what
    # the summary must sum -- if it summed raw `amount` instead, this would wrongly add 100 to the
    # total instead of 158.
    _make_txn(
        db_session,
        user,
        category="Travel",
        amount=Decimal("100.00"),
        currency="CHF",
        amount_sgd=Decimal("158.00"),
        txn_at=now,
    )
    # amount_sgd never got computed (e.g. the FX lookup failed) -- must fall back to raw amount
    # rather than being silently dropped from the total.
    _make_txn(
        db_session,
        user,
        category="Travel",
        amount=Decimal("20.00"),
        currency="USD",
        amount_sgd=None,
        txn_at=now,
    )

    response = client.get("/summary", params={"user_id": user.id})
    assert response.status_code == 200
    assert Decimal(str(response.json()["total"])) == Decimal("188.00")
