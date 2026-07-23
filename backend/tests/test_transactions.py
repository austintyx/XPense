from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.models import DirectionEnum, Transaction, TransactionTypeEnum


def _make_txn(db_session, user, **overrides):
    defaults = dict(
        user_id=user.id,
        source_email_id=f"test:{datetime.now(timezone.utc).timestamp()}:{id(overrides)}",
        provider=None,
        amount=Decimal("10.00"),
        currency="SGD",
        direction=DirectionEnum.debit,
        type=TransactionTypeEnum.expense,
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


def test_list_returns_seeded_rows_newest_first(client, db_session, user):
    now = datetime.now(timezone.utc)
    older = _make_txn(db_session, user, merchant_raw="OLDER", txn_at=now - timedelta(days=2))
    newer = _make_txn(db_session, user, merchant_raw="NEWER", txn_at=now - timedelta(hours=1))
    _make_txn(
        db_session,
        user,
        merchant_raw="A TRANSFER",
        type=TransactionTypeEnum.transfer,
        txn_at=now,
    )

    response = client.get("/transactions", params={"user_id": user.id})
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()]
    assert ids == [newer.id, older.id]  # newest first, transfers excluded by default


def test_category_update_persists(client, db_session, user):
    txn = _make_txn(db_session, user, category=None)

    response = client.post(f"/transactions/{txn.id}/category", json={"category": "Food"})
    assert response.status_code == 200
    assert response.json()["category"] == "Food"

    listing = client.get("/transactions", params={"user_id": user.id})
    row = next(r for r in listing.json() if r["id"] == txn.id)
    assert row["category"] == "Food"


def test_manual_add_creates_row(client, user):
    payload = {
        "user_id": user.id,
        "amount": "19.80",
        "currency": "SGD",
        "direction": "debit",
        "type": "expense",
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


def test_summary_sums_categories_and_excludes_transfers(client, db_session, user):
    now = datetime.now(timezone.utc)
    _make_txn(db_session, user, category="Food", amount=Decimal("10.00"), txn_at=now)
    _make_txn(db_session, user, category="Food", amount=Decimal("5.00"), txn_at=now)
    _make_txn(db_session, user, category="Transport", amount=Decimal("2.00"), txn_at=now)
    _make_txn(
        db_session,
        user,
        category=None,
        amount=Decimal("200.00"),
        type=TransactionTypeEnum.transfer,
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
    assert Decimal(str(body["total"])) == Decimal("17.00")
