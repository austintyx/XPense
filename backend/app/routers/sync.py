from datetime import date, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import EmailAccount
from app.services.parser import SGT
from app.services.sync import sync_email_account

router = APIRouter()


@router.post("/sync")
def sync_user(user_id: int, since: date | None = None, db: Session = Depends(get_db)):
    accounts = db.query(EmailAccount).filter_by(user_id=user_id).all()
    # Singapore midnight, not UTC midnight (SGT is UTC+8) -- a naive UTC bound would start 8
    # hours late and silently miss real transactions from the start of the day the person picked.
    since_dt = datetime.combine(since, time.min, tzinfo=SGT) if since is not None else None

    total_inserted = 0
    account_results = []
    for account in accounts:
        inserted = sync_email_account(db, account, since=since_dt)
        total_inserted += inserted
        account_results.append(
            {
                "provider": account.provider,
                "provider_email": account.provider_email,
                "inserted": inserted,
            }
        )

    return {"user_id": user_id, "inserted": total_inserted, "accounts": account_results}
