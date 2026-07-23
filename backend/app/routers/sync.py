from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import EmailAccount, ProviderEnum
from app.services.sync import sync_google_account

router = APIRouter()


@router.post("/sync")
def sync_user(user_id: int, db: Session = Depends(get_db)):
    accounts = db.query(EmailAccount).filter_by(user_id=user_id, provider=ProviderEnum.google).all()

    total_inserted = 0
    account_results = []
    for account in accounts:
        inserted = sync_google_account(db, account)
        total_inserted += inserted
        account_results.append(
            {
                "provider": account.provider,
                "provider_email": account.provider_email,
                "inserted": inserted,
            }
        )

    return {"user_id": user_id, "inserted": total_inserted, "accounts": account_results}
