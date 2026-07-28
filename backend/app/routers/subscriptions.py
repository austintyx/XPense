from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Subscription
from app.schemas import SubscriptionCreateIn, SubscriptionOut

router = APIRouter()


@router.get("/subscriptions", response_model=list[SubscriptionOut])
def list_subscriptions(user_id: int, db: Session = Depends(get_db)):
    return db.query(Subscription).filter_by(user_id=user_id).order_by(Subscription.next_due).all()


@router.post("/subscriptions", response_model=SubscriptionOut, status_code=201)
def create_subscription(user_id: int, body: SubscriptionCreateIn, db: Session = Depends(get_db)):
    row = Subscription(
        user_id=user_id,
        name=body.name,
        amount=body.amount,
        frequency=body.frequency,
        next_due=body.next_due,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/subscriptions/{subscription_id}", status_code=204)
def delete_subscription(subscription_id: int, user_id: int, db: Session = Depends(get_db)):
    row = db.query(Subscription).filter_by(id=subscription_id, user_id=user_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    db.delete(row)
    db.commit()
