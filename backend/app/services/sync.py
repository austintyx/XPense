from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import EmailAccount, ProviderEnum, Transaction
from app.security.crypto import decrypt, encrypt
from app.services import gmail, google_oauth, graph, ms_oauth
from app.services.bank_senders import GMAIL_SENDER_FILTER, is_allowlisted_sender
from app.services.categorize import categorize_transaction, subcategory_for
from app.services.parser import parse_email, save_parsed_transaction

# Each provider's mail service exposes the same four-function interface (see gmail.py/graph.py),
# so the sync loop below is identical regardless of which one an account uses.
_MAIL_SERVICES = {
    ProviderEnum.google: gmail,
    ProviderEnum.microsoft: graph,
}
_OAUTH_SERVICES = {
    ProviderEnum.google: google_oauth,
    ProviderEnum.microsoft: ms_oauth,
}


def _get_valid_access_token(db: Session, account: EmailAccount) -> str:
    now = datetime.now(timezone.utc)
    if account.expires_at is None or account.expires_at <= now:
        oauth_service = _OAUTH_SERVICES[account.provider]
        token_data = oauth_service.refresh_access_token(decrypt(account.refresh_token_enc))
        account.access_token_enc = encrypt(token_data["access_token"])
        if "refresh_token" in token_data:
            account.refresh_token_enc = encrypt(token_data["refresh_token"])
        account.expires_at = oauth_service.compute_expiry(token_data.get("expires_in", 3600))
        db.commit()
        db.refresh(account)
    return decrypt(account.access_token_enc)


def _build_query(account: EmailAccount) -> str | None:
    if account.provider == ProviderEnum.google:
        if account.last_synced_at is not None:
            return f"{GMAIL_SENDER_FILTER} after:{int(account.last_synced_at.timestamp())}"
        return f"{GMAIL_SENDER_FILTER} newer_than:60d"
    return None  # graph.py's default BANK_SENDER_QUERY; dedup on source_email_id keeps this safe


def sync_email_account(db: Session, account: EmailAccount) -> int:
    """Fetch bank-sender mail for one linked email account (Google or Microsoft), parse it,
    and insert new transactions (deduped on source_email_id). Returns the number newly inserted."""
    access_token = _get_valid_access_token(db, account)
    mail_service = _MAIL_SERVICES[account.provider]
    query = _build_query(account)
    kwargs = {"query": query} if query is not None else {}

    inserted = 0
    for stub in mail_service.list_bank_messages(access_token, **kwargs):
        message_id = stub["id"]
        already_exists = db.query(Transaction).filter_by(source_email_id=message_id).first() is not None

        message = mail_service.fetch_message(access_token, message_id)
        sender = mail_service.get_sender(message)
        if not is_allowlisted_sender(sender):
            # Defense in depth: the search query should already exclude this, but a provider's
            # fuzzy search matching a non-bank sender (seen in practice with Graph's $search)
            # must never result in that email's body being parsed or stored.
            continue

        text = mail_service.extract_plain_text(message)
        parsed = parse_email(text, sender)
        if parsed is None:
            continue

        if parsed.category is None:
            parsed.category, parsed.subcategory = categorize_transaction(
                parsed.merchant_raw, parsed.bank, parsed.txn_at
            )
        elif parsed.subcategory is None:
            # The parser already hardcoded a category (e.g. SimplyGo transit -> Transport) --
            # still derive a subcategory so parser-hardcoded rows aren't left without one.
            parsed.subcategory = subcategory_for(parsed.category, parsed.merchant_raw, parsed.txn_at)

        save_parsed_transaction(db, account.user_id, message_id, account.provider, parsed)
        if not already_exists:
            inserted += 1

    account.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return inserted
