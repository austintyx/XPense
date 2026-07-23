from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import EmailAccount, ProviderEnum, Transaction
from app.security.crypto import decrypt, encrypt
from app.services import gmail, google_oauth
from app.services.parser import parse_email, save_parsed_transaction

BANK_SENDER_FILTER = "from:(dbs.com.sg OR uob.com.sg OR simplygo)"


def _get_valid_access_token(db: Session, account: EmailAccount) -> str:
    now = datetime.now(timezone.utc)
    if account.expires_at is None or account.expires_at <= now:
        token_data = google_oauth.refresh_access_token(decrypt(account.refresh_token_enc))
        account.access_token_enc = encrypt(token_data["access_token"])
        account.expires_at = google_oauth.compute_expiry(token_data.get("expires_in", 3600))
        db.commit()
        db.refresh(account)
    return decrypt(account.access_token_enc)


def _build_query(account: EmailAccount) -> str:
    if account.last_synced_at is not None:
        return f"{BANK_SENDER_FILTER} after:{int(account.last_synced_at.timestamp())}"
    return f"{BANK_SENDER_FILTER} newer_than:60d"


def sync_google_account(db: Session, account: EmailAccount) -> int:
    """Fetch bank-sender mail for one linked Gmail account, parse it, and insert new
    transactions (deduped on source_email_id). Returns the number newly inserted."""
    access_token = _get_valid_access_token(db, account)
    query = _build_query(account)

    inserted = 0
    for stub in gmail.list_bank_messages(access_token, query=query):
        message_id = stub["id"]
        already_exists = db.query(Transaction).filter_by(source_email_id=message_id).first() is not None

        message = gmail.fetch_message(access_token, message_id)
        text = gmail.extract_plain_text(message)
        sender = gmail.get_sender(message)

        parsed = parse_email(text, sender)
        if parsed is None:
            continue

        save_parsed_transaction(db, account.user_id, message_id, ProviderEnum.google, parsed)
        if not already_exists:
            inserted += 1

    account.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return inserted
