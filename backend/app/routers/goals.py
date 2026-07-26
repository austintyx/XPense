from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import SavingsGoal
from app.schemas import SavingsGoalOut, SavingsGoalUpdateIn

router = APIRouter()

DEFAULT_NAME = "Savings goal"
DEFAULT_TARGET = Decimal("1000")
DEFAULT_SAVED = Decimal("0")


def _get_or_create(user_id: int, db: Session) -> SavingsGoal:
    goal = db.query(SavingsGoal).filter_by(user_id=user_id).one_or_none()
    if goal is None:
        goal = SavingsGoal(
            user_id=user_id, name=DEFAULT_NAME, target_amount=DEFAULT_TARGET, saved_amount=DEFAULT_SAVED
        )
        db.add(goal)
        db.commit()
        db.refresh(goal)
    return goal


@router.get("/goal", response_model=SavingsGoalOut)
def get_goal(user_id: int, db: Session = Depends(get_db)):
    goal = _get_or_create(user_id, db)
    return SavingsGoalOut(
        user_id=goal.user_id, name=goal.name, target_amount=goal.target_amount, saved_amount=goal.saved_amount
    )


@router.patch("/goal", response_model=SavingsGoalOut)
def update_goal(user_id: int, body: SavingsGoalUpdateIn, db: Session = Depends(get_db)):
    goal = _get_or_create(user_id, db)
    goal.name = body.name
    goal.target_amount = body.target_amount
    goal.saved_amount = body.saved_amount
    db.commit()
    db.refresh(goal)
    return SavingsGoalOut(
        user_id=goal.user_id, name=goal.name, target_amount=goal.target_amount, saved_amount=goal.saved_amount
    )
