from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import EmailAccount
from app.schemas import EmailAccountOut

router = APIRouter()


@router.get("/email-accounts", response_model=list[EmailAccountOut])
def list_email_accounts(user_id: int, db: Session = Depends(get_db)):
    return db.query(EmailAccount).filter_by(user_id=user_id).all()
