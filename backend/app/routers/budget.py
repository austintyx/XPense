from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Budget
from app.schemas import BudgetOut, BudgetUpdateIn

router = APIRouter()

DEFAULT_MONTHLY_TARGET = Decimal("2000")


def _get_or_create(user_id: int, db: Session) -> Budget:
    budget = db.query(Budget).filter_by(user_id=user_id).one_or_none()
    if budget is None:
        budget = Budget(user_id=user_id, monthly_target=DEFAULT_MONTHLY_TARGET)
        db.add(budget)
        db.commit()
        db.refresh(budget)
    return budget


def _cents(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _to_out(budget: Budget) -> BudgetOut:
    return BudgetOut(
        user_id=budget.user_id,
        monthly_target=budget.monthly_target,
        weekly_target=_cents(budget.monthly_target / Decimal(7)),
        daily_target=_cents(budget.monthly_target / Decimal(30)),
    )


@router.get("/budget", response_model=BudgetOut)
def get_budget(user_id: int, db: Session = Depends(get_db)):
    return _to_out(_get_or_create(user_id, db))


@router.patch("/budget", response_model=BudgetOut)
def update_budget(user_id: int, body: BudgetUpdateIn, db: Session = Depends(get_db)):
    budget = _get_or_create(user_id, db)
    budget.monthly_target = body.monthly_target
    db.commit()
    db.refresh(budget)
    return _to_out(budget)
