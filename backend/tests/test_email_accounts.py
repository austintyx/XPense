from datetime import datetime, timezone

from app.models import EmailAccount, ProviderEnum
from app.security.crypto import encrypt


def test_list_email_accounts_returns_linked_accounts(client, db_session, user):
    account = EmailAccount(
        user_id=user.id,
        provider=ProviderEnum.google,
        provider_email="someone@gmail.com",
        access_token_enc=encrypt("fake-access-token"),
        refresh_token_enc=encrypt("fake-refresh-token"),
        last_synced_at=datetime.now(timezone.utc),
    )
    db_session.add(account)
    db_session.commit()

    response = client.get("/email-accounts", params={"user_id": user.id})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["provider"] == "google"
    assert body[0]["provider_email"] == "someone@gmail.com"
    assert body[0]["last_synced_at"] is not None


def test_list_email_accounts_empty_when_none_linked(client, user):
    response = client.get("/email-accounts", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json() == []
