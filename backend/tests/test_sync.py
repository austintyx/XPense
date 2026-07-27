import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models import EmailAccount, ProviderEnum, Transaction, TransactionTypeEnum
from app.security.crypto import encrypt
from app.services import gmail, graph
from app.services.grab_reconcile import GRAB_RECEIPT_SENDER

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
DBS_CARD_TXN_TEXT = (
    "Card Transaction Alert Transaction Ref: 999999999999 Dear Sir / Madam, We refer to your "
    "card transaction request dated 24/07/26. We are pleased to confirm that the transaction "
    "was completed. Date & Time: 24 Jul 08:15 (SGT) Amount: SGD3.76 From: DBS/POSB card ending "
    "1234 To: BUS/MRT If unauthorized, please call our DBS hotline. Thank you for banking with us."
)
DBS_GRAB_CARD_TXN_TEXT = (
    "Card Transaction Alert Transaction Ref: 999999999999 Dear Sir / Madam, We refer to your "
    "card transaction request dated 12/05/26. We are pleased to confirm that the transaction "
    "was completed. Date & Time: 12 May 12:30 (SGT) Amount: SGD9.80 From: DBS/POSB card ending "
    "1234 To: GRAB If unauthorized, please call our DBS hotline. Thank you for banking with us."
)
GRAB_FOOD_RECEIPT_TEXT = (
    "Your GrabFood receipt Thanks for ordering with GrabFood! Order from:Chicken Rice Stall "
    "Profile:Personal x1 S$7.20 Delivery fee S$2.60 Total S$9.80 Paid with DBS card ending 1234."
)


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


def test_sync_auto_categorizes_a_hardcoded_matchable_merchant(client, db_session, user, email_account, monkeypatch):
    """A new transaction with a merchant the hardcoded rules recognize should be categorized
    automatically during sync, with no manual tap needed."""
    messages = [_fake_message("msg-transit", DBS_CARD_TXN_TEXT, DBS_SENDER)]
    message_lookup = {m["id"]: m for m in messages}

    monkeypatch.setattr(
        gmail, "list_bank_messages", lambda access_token, query=None: [{"id": m["id"]} for m in messages]
    )
    monkeypatch.setattr(gmail, "fetch_message", lambda access_token, message_id: message_lookup[message_id])

    response = client.post("/sync", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json()["inserted"] == 1

    txn = db_session.query(Transaction).filter_by(user_id=user.id, merchant_raw="BUS/MRT").one()
    assert txn.category == "Transport"
    assert txn.subcategory == "Public"


def test_sync_reconciles_generic_grab_charge_with_matching_grabfood_receipt(
    client, db_session, user, email_account, monkeypatch
):
    """A DBS alert that just says "GRAB" should get cross-referenced against a matching Grab
    receipt email (same amount) so it lands as Food, not the generic Transport/Private guess."""
    alert_message = _fake_message("msg-grab-alert", DBS_GRAB_CARD_TXN_TEXT, DBS_SENDER)
    receipt_message = _fake_message("msg-grab-receipt", GRAB_FOOD_RECEIPT_TEXT, f"Grab <{GRAB_RECEIPT_SENDER}>")
    message_lookup = {"msg-grab-alert": alert_message, "msg-grab-receipt": receipt_message}

    monkeypatch.setattr(gmail, "list_bank_messages", lambda access_token, query=None: [{"id": "msg-grab-alert"}])
    monkeypatch.setattr(
        gmail,
        "list_messages_from_sender",
        lambda access_token, sender_email, around, window=None: [{"id": "msg-grab-receipt"}],
    )
    monkeypatch.setattr(gmail, "fetch_message", lambda access_token, message_id: message_lookup[message_id])

    response = client.post("/sync", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json()["inserted"] == 1

    txn = db_session.query(Transaction).filter_by(user_id=user.id).one()
    assert txn.category == "Food"
    assert txn.subcategory == "Lunch"
    assert txn.merchant_raw == "Chicken Rice Stall"  # not the bank's generic "GRAB" string


def test_sync_falls_back_to_transport_when_no_matching_grab_receipt_is_found(
    client, db_session, user, email_account, monkeypatch
):
    """No matching receipt (wrong amount, or none at all) -- must fall back to today's default
    Transport/Private classification rather than leaving the row uncategorized."""
    alert_message = _fake_message("msg-grab-alert", DBS_GRAB_CARD_TXN_TEXT, DBS_SENDER)
    message_lookup = {"msg-grab-alert": alert_message}

    monkeypatch.setattr(gmail, "list_bank_messages", lambda access_token, query=None: [{"id": "msg-grab-alert"}])
    monkeypatch.setattr(
        gmail, "list_messages_from_sender", lambda access_token, sender_email, around, window=None: []
    )
    monkeypatch.setattr(gmail, "fetch_message", lambda access_token, message_id: message_lookup[message_id])

    response = client.post("/sync", params={"user_id": user.id})
    assert response.status_code == 200
    assert response.json()["inserted"] == 1

    txn = db_session.query(Transaction).filter_by(user_id=user.id, merchant_raw="GRAB").one()
    assert txn.category == "Transport"
    assert txn.subcategory == "Private"


def test_sync_with_since_uses_the_paginated_backfill_path_instead_of_the_normal_query(
    client, db_session, user, email_account, monkeypatch
):
    """A manual historical backfill (since= given) must route through list_bank_messages_since,
    not the everyday incremental query -- the latter would silently truncate to one page."""
    message = _fake_message("msg-old", DBS_PAYNOW_TEXT, DBS_SENDER)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("list_bank_messages should not be called when since= is given")

    monkeypatch.setattr(gmail, "list_bank_messages", fail_if_called)
    monkeypatch.setattr(gmail, "list_bank_messages_since", lambda access_token, since: [{"id": "msg-old"}])
    monkeypatch.setattr(gmail, "fetch_message", lambda access_token, message_id: message)

    response = client.post("/sync", params={"user_id": user.id, "since": "2026-01-01"})
    assert response.status_code == 200
    assert response.json()["inserted"] == 1

    db_session.refresh(email_account)
    assert email_account.last_synced_at is not None
