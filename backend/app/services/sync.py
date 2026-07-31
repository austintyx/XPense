from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import EmailAccount, ProviderEnum, Transaction
from app.security.crypto import decrypt, encrypt
from app.services import gmail, google_oauth, graph, ms_oauth
from app.services.bank_senders import GMAIL_SENDER_FILTER, is_allowlisted_sender
from app.services.categorize import categorize_transaction, subcategory_for
from app.services.grab_reconcile import is_generic_grab_merchant, reconcile_grab_transaction
from app.services.parser import parse_email, save_parsed_transaction

# Each provider's mail service exposes the same four-function interface (see gmail.py/graph.py),
# so the sync loop below is identical regardless of which one an account uses.
MAIL_SERVICES = {
    ProviderEnum.google: gmail,
    ProviderEnum.microsoft: graph,
}
_OAUTH_SERVICES = {
    ProviderEnum.google: google_oauth,
    ProviderEnum.microsoft: ms_oauth,
}


def get_valid_access_token(db: Session, account: EmailAccount) -> str:
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


def sync_email_account(db: Session, account: EmailAccount, since: datetime | None = None) -> int:
    """Fetch bank-sender mail for one linked email account (Google or Microsoft), parse it,
    and insert new transactions (deduped on source_email_id). Returns the number newly inserted.

    `since`, when given, is a manual historical backfill request -- overrides the normal
    incremental/default-window query entirely (regardless of last_synced_at) via each provider's
    paginated list_bank_messages_since, so it isn't silently truncated to one page like the
    everyday sync path."""
    access_token = get_valid_access_token(db, account)
    mail_service = MAIL_SERVICES[account.provider]
    if since is not None:
        stubs = mail_service.list_bank_messages_since(access_token, since)
    else:
        query = _build_query(account)
        kwargs = {"query": query} if query is not None else {}
        stubs = mail_service.list_bank_messages(access_token, **kwargs)

    inserted = 0
    for stub in stubs:
        message_id = stub["id"]

        message = mail_service.fetch_message(access_token, message_id)
        sender = mail_service.get_sender(message)
        if not is_allowlisted_sender(sender):
            # Defense in depth: the search query should already exclude this, but a provider's
            # fuzzy search matching a non-bank sender (seen in practice with Graph's $search)
            # must never result in that email's body being parsed or stored.
            continue

        text = mail_service.extract_plain_text(message)
        received_at = mail_service.get_received_at(message)
        # Most emails produce at most one transaction (message_id alone is the dedup key, same as
        # before); a YouTrip digest can produce several, each carrying its own dedup_suffix so they
        # get distinct, stable ids instead of colliding on message_id.
        for parsed in parse_email(text, sender, received_at):
            source_email_id = message_id if parsed.dedup_suffix is None else f"{message_id}:{parsed.dedup_suffix}"
            already_exists = db.query(Transaction).filter_by(source_email_id=source_email_id).first() is not None

            if parsed.category is None:
                grab_result = None
                # Grab reconciliation only makes sense for local (SGD) rides -- an overseas Grab
                # charge paid via a travel wallet must still route through Travel categorization
                # below, not get swept into the local Grab-receipt lookup.
                if parsed.currency == "SGD" and is_generic_grab_merchant(parsed.merchant_raw):
                    grab_result = reconcile_grab_transaction(
                        mail_service, access_token, parsed.merchant_raw, parsed.amount, parsed.txn_at
                    )
                if grab_result is not None:
                    parsed.category, parsed.subcategory, grab_merchant = grab_result
                    if grab_merchant is not None:
                        parsed.merchant_raw = grab_merchant
                else:
                    parsed.category, parsed.subcategory = categorize_transaction(
                        db, parsed.merchant_raw, parsed.bank, parsed.txn_at, parsed.direction, parsed.currency
                    )
            elif parsed.subcategory is None:
                # The parser already hardcoded a category (e.g. SimplyGo transit -> Transport) --
                # still derive a subcategory so parser-hardcoded rows aren't left without one.
                parsed.subcategory = subcategory_for(parsed.category, parsed.merchant_raw, parsed.txn_at)

            save_parsed_transaction(db, account.user_id, source_email_id, account.provider, parsed)
            if not already_exists:
                inserted += 1

    account.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    return inserted
