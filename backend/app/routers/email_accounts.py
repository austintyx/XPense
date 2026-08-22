from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import EmailAccount
from app.schemas import EmailAccountOut

router = APIRouter()


@router.get("/email-accounts", response_model=list[EmailAccountOut])
def list_email_accounts(user_id: int, db: Session = Depends(get_db)):
    return db.query(EmailAccount).filter_by(user_id=user_id).all()


@router.delete("/email-accounts/{account_id}", status_code=204)
def unlink_email_account(account_id: int, user_id: int, db: Session = Depends(get_db)):
    account = db.query(EmailAccount).filter_by(id=account_id, user_id=user_id).one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Email account not found")
    # Transaction.account_id has ondelete="CASCADE" (see models.py), so Postgres itself deletes
    # every transaction synced from this account the moment the row below is removed -- no
    # separate delete query needed here.
    db.delete(account)
    db.commit()
