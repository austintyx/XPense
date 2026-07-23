import base64
from datetime import datetime, timedelta, timezone

import pytest

from app.models import EmailAccount, ProviderEnum, Transaction
from app.security.crypto import encrypt
from app.services import gmail

DBS_PAYNOW_TEXT = (
    "Fr DBS: Successful PayNow: S$87.00 from A/C ending 6540 to 24HRS CITY FLORIST "
    "(UEN ending 378B), 22 Jul 18:01 SGT."
)
SIMPLYGO_TEXT = "Fare $1.38 - Kovan - Sengkang - 22 Jul 22:46"


def _fake_message(msg_id: str, text: str, sender: str) -> dict:
    return {
        "id": msg_id,
        "payload": {
            "mimeType": "text/plain",
            "headers": [{"name": "From", "value": sender}],
            "body": {"data": base64.urlsafe_b64encode(text.encode()).decode()},
        },
    }


@pytest.fixture()
def email_account(db_session, user):
    account = EmailAccount(
        user_id=user.id,
        provider=ProviderEnum.google,
        provider_email="demo@gmail.com",
        access_token_enc=encrypt("fake-access-token"),
        refresh_token_enc=encrypt("fake-refresh-token"),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)
    return account


def test_sync_inserts_new_transactions_and_is_idempotent(client, db_session, user, email_account, monkeypatch):
    messages = [
        _fake_message("msg-1", DBS_PAYNOW_TEXT, "alerts@dbs.com.sg"),
        _fake_message("msg-2", SIMPLYGO_TEXT, "noreply@simplygo.com.sg"),
    ]
    message_lookup = {m["id"]: m for m in messages}

    monkeypatch.setattr(
        gmail, "list_bank_messages", lambda access_token, query=None: [{"id": m["id"]} for m in messages]
    )
    monkeypatch.setattr(gmail, "fetch_message", lambda access_token, message_id: message_lookup[message_id])

    response = client.post("/sync", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json()["inserted"] == 2

    count = db_session.query(Transaction).filter_by(user_id=user.id).count()
    assert count == 2

    db_session.refresh(email_account)
    assert email_account.last_synced_at is not None

    # second sync sees the same mail again (mock is unaware of last_synced_at) -> idempotent
    response2 = client.post("/sync", params={"user_id": user.id})
    assert response2.status_code == 200
    assert response2.json()["inserted"] == 0

    count_after = db_session.query(Transaction).filter_by(user_id=user.id).count()
    assert count_after == 2
