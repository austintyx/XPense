import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models import EmailAccount, ProviderEnum, Transaction, TransactionTypeEnum
from app.security.crypto import encrypt
from app.services import gmail, graph

DBS_PAYNOW_TEXT = (
    "Fr DBS: Successful PayNow: S$87.00 from A/C ending 6540 to 24HRS CITY FLORIST "
    "(UEN ending 378B), 22 Jul 18:01 SGT."
)
UOB_PAYNOW_TEXT = (
    "You made a PayNow transfer of SGD 200.00 to AUSXXX TEX YUXX XUXX "
    "(Mobile ending 7132) on your a/c ending 2047 at 7:37PM SGT, 18 Jul 26."
)
DBS_SENDER = "ibanking.alert@dbs.com"
UOB_SENDER = "unialerts@uobgroup.com"


def _fake_message(msg_id: str, text: str, sender: str) -> dict:
    return {
        "id": msg_id,
        "payload": {
            "mimeType": "text/plain",
            "headers": [{"name": "From", "value": sender}],
            "body": {"data": base64.urlsafe_b64encode(text.encode()).decode()},
        },
    }


def _fake_graph_message(msg_id: str, text: str, address: str) -> dict:
    return {
        "id": msg_id,
        "body": {"contentType": "text", "content": text},
        "from": {"emailAddress": {"name": "", "address": address}},
    }


def _make_email_account(db_session, user, provider: ProviderEnum) -> EmailAccount:
    account = EmailAccount(
        user_id=user.id,
        provider=provider,
        provider_email=f"demo@{provider.value}.example",
        access_token_enc=encrypt("fake-access-token"),
        refresh_token_enc=encrypt("fake-refresh-token"),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)
    return account


@pytest.fixture()
def email_account(db_session, user):
    return _make_email_account(db_session, user, ProviderEnum.google)


@pytest.fixture()
def ms_email_account(db_session, user):
    return _make_email_account(db_session, user, ProviderEnum.microsoft)


def test_sync_inserts_new_transactions_and_is_idempotent(client, db_session, user, email_account, monkeypatch):
    messages = [
        _fake_message("msg-1", DBS_PAYNOW_TEXT, DBS_SENDER),
        _fake_message("msg-2", UOB_PAYNOW_TEXT, UOB_SENDER),
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


def test_sync_microsoft_account_reaches_identical_output_through_same_parser(
    client, db_session, user, ms_email_account, monkeypatch
):
    """BUILD_PLAN Phase 6 DoD: both providers reach identical transaction output through
    one parser. Feed the same DBS PayNow text through the Graph mail service and check the
    resulting row matches what the Gmail path produces for the same text."""
    messages = [_fake_graph_message("ms-msg-1", DBS_PAYNOW_TEXT, DBS_SENDER)]
    message_lookup = {m["id"]: m for m in messages}

    monkeypatch.setattr(
        graph, "list_bank_messages", lambda access_token, query=None: [{"id": m["id"]} for m in messages]
    )
    monkeypatch.setattr(graph, "fetch_message", lambda access_token, message_id: message_lookup[message_id])

    response = client.post("/sync", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json()["inserted"] == 1

    txn = (
        db_session.query(Transaction)
        .filter_by(user_id=user.id, provider=ProviderEnum.microsoft)
        .one()
    )
    assert txn.amount == Decimal("87.00")
    assert txn.currency == "SGD"
    assert txn.merchant_raw == "24HRS CITY FLORIST"
    assert txn.type == TransactionTypeEnum.expense
    assert txn.bank == "DBS"


def test_sync_skips_non_allowlisted_sender_even_if_search_returns_it(
    client, db_session, user, email_account, monkeypatch
):
    """Phase 10 guard, verified early: even if a provider's search returns a non-bank sender
    (observed in practice with Graph's fuzzy $search matching marketing mail), its body must
    never be parsed or stored."""
    messages = [
        _fake_message("msg-marketing", DBS_PAYNOW_TEXT, "marketing@eDM.uob.com.sg"),
    ]
    message_lookup = {m["id"]: m for m in messages}

    monkeypatch.setattr(
        gmail, "list_bank_messages", lambda access_token, query=None: [{"id": m["id"]} for m in messages]
    )
    monkeypatch.setattr(gmail, "fetch_message", lambda access_token, message_id: message_lookup[message_id])

    response = client.post("/sync", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json()["inserted"] == 0

    assert db_session.query(Transaction).filter_by(user_id=user.id).count() == 0
