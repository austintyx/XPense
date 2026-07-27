from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CategoryBudget
from app.schemas import CategoryBudgetOut, CategoryBudgetUpdateIn

router = APIRouter()


@router.get("/category-budgets", response_model=list[CategoryBudgetOut])
def list_category_budgets(user_id: int, db: Session = Depends(get_db)):
    return db.query(CategoryBudget).filter_by(user_id=user_id).all()


@router.put("/category-budgets/{category}", response_model=CategoryBudgetOut)
def set_category_budget(category: str, user_id: int, body: CategoryBudgetUpdateIn, db: Session = Depends(get_db)):
    row = db.query(CategoryBudget).filter_by(user_id=user_id, category=category).one_or_none()
    if row is None:
        row = CategoryBudget(user_id=user_id, category=category, monthly_limit=body.monthly_limit)
        db.add(row)
    else:
        row.monthly_limit = body.monthly_limit
    db.commit()
    db.refresh(row)
    return row


@router.delete("/category-budgets/{category}", status_code=204)
def delete_category_budget(category: str, user_id: int, db: Session = Depends(get_db)):
    row = db.query(CategoryBudget).filter_by(user_id=user_id, category=category).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No limit set for this category")
    db.delete(row)
    db.commit()
