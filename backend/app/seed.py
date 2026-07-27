from datetime import datetime, timezone
from decimal import Decimal

from app.db import SessionLocal
from app.models import DirectionEnum, Transaction, TransactionTypeEnum, User

DEMO_USER_EMAIL = "demo@xpense.dev"

FAKE_TRANSACTIONS = [
    dict(
        merchant_raw="CHICKEN RICE",
        category="Food",
        amount=Decimal("6.00"),
        bank="DBS",
        type=TransactionTypeEnum.expense,
    ),
    dict(
        merchant_raw="24HRS CITY FLORIST",
        category="Shopping",
        amount=Decimal("87.00"),
        bank="DBS",
        type=TransactionTypeEnum.expense,
    ),
    dict(
        merchant_raw="Transit: Kovan-Sengkang",
        category="Transport",
        amount=Decimal("1.38"),
        bank="SimplyGo",
        type=TransactionTypeEnum.expense,
    ),
    dict(
        merchant_raw="A/C ending 9249",
        category=None,
        amount=Decimal("200.00"),
        bank="DBS",
        type=TransactionTypeEnum.transfer,
    ),
]


def _get_or_create_demo_user(db) -> User:
    user = db.query(User).filter_by(email=DEMO_USER_EMAIL).first()
    if user is None:
        user = User(email=DEMO_USER_EMAIL)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def seed() -> None:
    db = SessionLocal()
    try:
        user = _get_or_create_demo_user(db)
        now = datetime.now(timezone.utc)
        inserted = 0
        for i, row in enumerate(FAKE_TRANSACTIONS):
            source_email_id = f"seed:{i}:{row['merchant_raw']}"
            if db.query(Transaction).filter_by(source_email_id=source_email_id).first():
                continue
            db.add(
                Transaction(
                    user_id=user.id,
                    source_email_id=source_email_id,
                    provider=None,
                    amount=row["amount"],
                    currency="SGD",
                    direction=DirectionEnum.debit,
                    type=row["type"],
                    merchant_raw=row["merchant_raw"],
                    merchant_clean=row["merchant_raw"],
                    category=row["category"],
                    txn_at=now,
                    bank=row["bank"],
                )
            )
            inserted += 1
        db.commit()
        print(f"Seeded demo user id={user.id} ({user.email}); inserted {inserted} new transaction(s)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
