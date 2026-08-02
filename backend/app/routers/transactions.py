import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DirectionEnum, EmailAccount, Transaction
from app.schemas import (
    CategorySummary,
    CategoryUpdateIn,
    SummaryOut,
    TransactionCreateIn,
    TransactionDetailsUpdateIn,
    TransactionOut,
)
from app.services.categorize import (
    categorize_transaction,
    food_subcategory,
    remember_category,
    transport_subcategory,
)
from app.services.fx import get_amount_in_sgd
from app.services.grab_reconcile import is_generic_grab_merchant, reconcile_grab_transaction
from app.services.parser import SGT
from app.services.sync import MAIL_SERVICES, get_valid_access_token

router = APIRouter()


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    user_id: int,
    direction: DirectionEnum | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if direction is not None:
        query = query.filter(Transaction.direction == direction)
    return query.order_by(Transaction.txn_at.desc()).all()


@router.post("/transactions/{transaction_id}/category", response_model=TransactionOut)
def update_category(transaction_id: int, body: CategoryUpdateIn, db: Session = Depends(get_db)):
    txn = db.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.category = body.category
    txn.subcategory = body.subcategory
    # A manual (re)categorization is a stronger signal than any prior guess -- remember it so
    # every future transaction from this merchant is categorized the same way with no AI call.
    if txn.merchant_raw:
        remember_category(db, txn.merchant_raw, body.category, txn.direction.value)
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
        category, subcategory = categorize_transaction(
            db, txn.merchant_raw or "", txn.bank, txn.txn_at, txn.direction, txn.currency
        )
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

    # Rows the hardcoded rules already filed under Transport just because the bank alert says
    # generic "GRAB" -- re-check each against the user's Grab receipt emails in case it was
    # actually GrabFood/GrabMart/GrabExpress. Never lets one lookup failure (missing linked
    # account, expired token, network hiccup) break the rest of the backfill.
    grab_candidates = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.category == "Transport",
    ).all()
    account_cache: dict[str, EmailAccount | None] = {}
    for txn in grab_candidates:
        if not txn.merchant_raw or not is_generic_grab_merchant(txn.merchant_raw) or txn.provider is None:
            continue
        try:
            if txn.provider not in account_cache:
                account_cache[txn.provider] = (
                    db.query(EmailAccount)
                    .filter_by(user_id=user_id, provider=txn.provider)
                    .first()
                )
            account = account_cache[txn.provider]
            if account is None:
                continue
            access_token = get_valid_access_token(db, account)
            mail_service = MAIL_SERVICES[account.provider]
            result = reconcile_grab_transaction(
                mail_service, access_token, txn.merchant_raw, txn.amount, txn.txn_at
            )
            if result is not None:
                txn.category, txn.subcategory, grab_merchant = result
                if grab_merchant is not None:
                    txn.merchant_raw = grab_merchant
                    txn.merchant_clean = grab_merchant
        except Exception:
            continue

    db.commit()
    return {"categorized": categorized, "remaining": len(pending) - categorized}


@router.patch("/transactions/{transaction_id}/details", response_model=TransactionOut)
def update_transaction_details(
    transaction_id: int, user_id: int, body: TransactionDetailsUpdateIn, db: Session = Depends(get_db)
):
    txn = db.query(Transaction).filter_by(id=transaction_id, user_id=user_id).one_or_none()
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    merchant = body.merchant.strip()
    if not merchant:
        raise HTTPException(status_code=400, detail="Merchant name cannot be blank")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")

    txn.merchant_raw = merchant
    txn.merchant_clean = merchant
    txn.amount = body.amount
    txn.amount_sgd = get_amount_in_sgd(db, body.amount, txn.currency, txn.txn_at)
    txn.country = body.country
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, user_id: int, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter_by(id=transaction_id, user_id=user_id).one_or_none()
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_manual_transaction(body: TransactionCreateIn, db: Session = Depends(get_db)):
    txn = Transaction(
        user_id=body.user_id,
        source_email_id=f"manual:{uuid.uuid4()}",
        provider=None,
        amount=body.amount,
        currency=body.currency,
        amount_sgd=get_amount_in_sgd(db, body.amount, body.currency, body.txn_at),
        direction=body.direction,
        merchant_raw=body.merchant_raw,
        merchant_clean=body.merchant_clean,
        category=body.category,
        subcategory=body.subcategory,
        txn_at=body.txn_at,
        bank=body.bank,
        country=body.country,
    )
    db.add(txn)
    if body.category and body.merchant_raw:
        remember_category(db, body.merchant_raw, body.category, body.direction.value)
    db.commit()
    db.refresh(txn)
    return txn


@router.get("/summary", response_model=SummaryOut)
def summary(user_id: int, db: Session = Depends(get_db)):
    # "This month" must mean Singapore local time, not UTC -- this app is Singapore-only (SGT is
    # already assumed elsewhere, e.g. services/parser.py's SGT constant), and the frontend buckets
    # "this month" by the device's local calendar (also SGT for this app's users). Comparing a
    # UTC calendar-month boundary against an SGT one silently drops/adds up to ~8 hours of
    # transactions at each month edge, producing a total that disagrees with every other
    # client-computed number on the Summary/Home screens even though they're meant to match.
    now = datetime.now(SGT)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        next_month_start = month_start.replace(year=now.year + 1, month=1)
    else:
        next_month_start = month_start.replace(month=now.month + 1)

    rows = (
        db.query(Transaction.category, func.sum(func.coalesce(Transaction.amount_sgd, Transaction.amount)))
        .filter(
            Transaction.user_id == user_id,
            Transaction.direction == DirectionEnum.debit,
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
