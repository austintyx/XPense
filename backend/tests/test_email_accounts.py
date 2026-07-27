from datetime import datetime, timezone
from decimal import Decimal

from app.models import EmailAccount, ProviderEnum, Transaction, DirectionEnum, TransactionTypeEnum, User
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


def test_unlink_removes_the_account_but_keeps_its_transactions(client, db_session, user):
    account = EmailAccount(
        user_id=user.id,
        provider=ProviderEnum.google,
        provider_email="someone@gmail.com",
        access_token_enc=encrypt("fake-access-token"),
        refresh_token_enc=encrypt("fake-refresh-token"),
    )
    db_session.add(account)
    db_session.commit()
    txn = Transaction(
        user_id=user.id,
        source_email_id="msg-1",
        provider=ProviderEnum.google,
        amount=Decimal("10.00"),
        currency="SGD",
        direction=DirectionEnum.debit,
        type=TransactionTypeEnum.expense,
        merchant_raw="CHICKEN RICE",
        txn_at=datetime.now(timezone.utc),
    )
    db_session.add(txn)
    db_session.commit()

    response = client.delete(f"/email-accounts/{account.id}", params={"user_id": user.id})
    assert response.status_code == 204

    listing = client.get("/email-accounts", params={"user_id": user.id})
    assert listing.json() == []

    remaining = client.get("/transactions", params={"user_id": user.id})
    assert any(r["id"] == txn.id for r in remaining.json())


def test_unlink_is_scoped_to_the_owning_user(client, db_session, user):
    other_user = User(email="someone-else@example.com")
    db_session.add(other_user)
    db_session.commit()
    other_user_account = EmailAccount(
        user_id=other_user.id,
        provider=ProviderEnum.google,
        provider_email="notyours@gmail.com",
        access_token_enc=encrypt("fake-access-token"),
        refresh_token_enc=encrypt("fake-refresh-token"),
    )
    db_session.add(other_user_account)
    db_session.commit()

    response = client.delete(f"/email-accounts/{other_user_account.id}", params={"user_id": user.id})
    assert response.status_code == 404


def test_unlink_returns_404_for_unknown_account(client, user):
    response = client.delete("/email-accounts/999999", params={"user_id": user.id})
    assert response.status_code == 404
