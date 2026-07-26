import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Transaction, TransactionTypeEnum
from app.schemas import (
    CategorySummary,
    CategoryUpdateIn,
    SummaryOut,
    TransactionCreateIn,
    TransactionOut,
)
from app.services.categorize import categorize_transaction, food_subcategory, transport_subcategory

router = APIRouter()


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    user_id: int,
    type: TransactionTypeEnum = TransactionTypeEnum.expense,
    db: Session = Depends(get_db),
):
    return (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.type == type)
        .order_by(Transaction.txn_at.desc())
        .all()
    )


@router.post("/transactions/{transaction_id}/category", response_model=TransactionOut)
def update_category(transaction_id: int, body: CategoryUpdateIn, db: Session = Depends(get_db)):
    txn = db.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.category = body.category
    txn.subcategory = body.subcategory
    db.commit()
    db.refresh(txn)
    return txn


@router.post("/transactions/categorize-pending")
def categorize_pending(user_id: int, db: Session = Depends(get_db)):
    pending = db.query(Transaction).filter(
        Transaction.user_id == user_id, Transaction.category.is_(None)
    ).all()

    categorized = 0
    for txn in pending:
        category, subcategory = categorize_transaction(txn.merchant_raw or "", txn.bank, txn.txn_at)
        if category is not None:
            txn.category = category
            txn.subcategory = subcategory
            categorized += 1

    # Backfill subcategory for rows categorized as Food/Transport before this feature existed
    # (or before the current subcategory rules).
    missing_food_subcategory = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.category == "Food",
        Transaction.subcategory.is_(None),
    ).all()
    for txn in missing_food_subcategory:
        txn.subcategory = food_subcategory(txn.merchant_raw or "", txn.txn_at)

    missing_transport_subcategory = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.category == "Transport",
        Transaction.subcategory.is_(None),
    ).all()
    for txn in missing_transport_subcategory:
        txn.subcategory = transport_subcategory(txn.merchant_raw or "")

    db.commit()
    return {"categorized": categorized, "remaining": len(pending) - categorized}


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_manual_transaction(body: TransactionCreateIn, db: Session = Depends(get_db)):
    txn = Transaction(
        user_id=body.user_id,
        source_email_id=f"manual:{uuid.uuid4()}",
        provider=None,
        amount=body.amount,
        currency=body.currency,
        direction=body.direction,
        type=body.type,
        merchant_raw=body.merchant_raw,
        merchant_clean=body.merchant_clean,
        category=body.category,
        subcategory=body.subcategory,
        txn_at=body.txn_at,
        bank=body.bank,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.get("/summary", response_model=SummaryOut)
def summary(user_id: int, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        next_month_start = month_start.replace(year=now.year + 1, month=1)
    else:
        next_month_start = month_start.replace(month=now.month + 1)

    rows = (
        db.query(Transaction.category, func.sum(Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type != TransactionTypeEnum.transfer,
            Transaction.txn_at >= month_start,
            Transaction.txn_at < next_month_start,
        )
        .group_by(Transaction.category)
        .all()
    )
    categories = [CategorySummary(category=cat, total=total) for cat, total in rows]
    total = sum((c.total for c in categories), Decimal("0"))
    return SummaryOut(
        user_id=user_id,
        month=month_start.strftime("%Y-%m"),
        categories=categories,
        total=total,
    )
