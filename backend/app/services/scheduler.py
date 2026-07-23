from apscheduler.schedulers.background import BackgroundScheduler

from app.db import SessionLocal
from app.models import EmailAccount, ProviderEnum
from app.services.sync import sync_google_account

_scheduler: BackgroundScheduler | None = None


def _run_all_syncs() -> None:
    db = SessionLocal()
    try:
        accounts = db.query(EmailAccount).filter_by(provider=ProviderEnum.google).all()
        for account in accounts:
            try:
                sync_google_account(db, account)
            except Exception:
                # one broken/expired account shouldn't stop the rest from syncing
                db.rollback()
    finally:
        db.close()


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler()
        _scheduler.add_job(_run_all_syncs, "interval", minutes=10, id="sync_all_accounts")
        _scheduler.start()
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
