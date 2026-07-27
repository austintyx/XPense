from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.models import EmailAccount, ProviderEnum, User
from app.services import google_oauth
from app.services.oauth_state import decode_state, encode_state

RETURN_TO = "exp://192.168.1.5:8081/--/"


@pytest.fixture(autouse=True)
def _google_config(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-client-secret")
    monkeypatch.setattr(settings, "google_redirect_uri", "https://example.ngrok.io/auth/google/callback")


def test_google_auth_start_redirects_to_google_carrying_return_to(client, user):
    response = client.get(
        "/auth/google", params={"user_id": user.id, "return_to": RETURN_TO}, follow_redirects=False
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")

    state = parse_qs(urlparse(location).query)["state"][0]
    decoded_user_id, decoded_return_to = decode_state(state)
    assert decoded_user_id == user.id
    assert decoded_return_to == RETURN_TO


def test_google_auth_start_without_user_id_encodes_a_null_user_id(client):
    # the login/signup flow: no user exists yet, so nothing is passed to identify one --
    # connecting the account itself is what resolves/creates the user.
    response = client.get("/auth/google", params={"return_to": RETURN_TO}, follow_redirects=False)
    assert response.status_code in (302, 307)

    state = parse_qs(urlparse(response.headers["location"]).query)["state"][0]
    decoded_user_id, decoded_return_to = decode_state(state)
    assert decoded_user_id is None
    assert decoded_return_to == RETURN_TO


def test_google_callback_stores_encrypted_tokens_and_redirects_to_app(client, db_session, user, monkeypatch):
    monkeypatch.setattr(
        google_oauth,
        "exchange_code_for_tokens",
        lambda code: {
            "access_token": "fake-access-token",
            "refresh_token": "fake-refresh-token",
            "expires_in": 3600,
        },
    )
    monkeypatch.setattr(
        google_oauth,
        "fetch_userinfo",
        lambda access_token: {"email": "someone@gmail.com"},
    )

    state = encode_state(user.id, RETURN_TO)
    response = client.get(
        "/auth/google/callback", params={"code": "fake-code", "state": state}, follow_redirects=False
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith(RETURN_TO)
    query = parse_qs(urlparse(location).query)
    assert query["linked"] == ["true"]
    assert query["provider"] == ["google"]
    assert query["email"] == ["someone@gmail.com"]
    # regression: an existing user_id round-trips unchanged through the redirect
    assert query["user_id"] == [str(user.id)]
    # this user has no google account yet -- linking one (even with an existing user_id) is a
    # new EmailAccount row, so the backfill prompt should be offered
    assert query["is_new_account"] == ["true"]

    account = (
        db_session.query(EmailAccount)
        .filter_by(user_id=user.id, provider=ProviderEnum.google)
        .one()
    )
    assert account.provider_email == "someone@gmail.com"
    # tokens must never be stored in plaintext
    assert account.access_token_enc != "fake-access-token"
    assert account.refresh_token_enc != "fake-refresh-token"
    assert "fake-access-token" not in account.access_token_enc
    assert "fake-refresh-token" not in account.refresh_token_enc


def test_google_callback_without_user_id_creates_a_new_user(client, db_session, monkeypatch):
    monkeypatch.setattr(
        google_oauth,
        "exchange_code_for_tokens",
        lambda code: {"access_token": "fake-access-token", "refresh_token": "fake-refresh-token", "expires_in": 3600},
    )
    monkeypatch.setattr(
        google_oauth,
        "fetch_userinfo",
        lambda access_token: {"email": "brandnew@gmail.com", "name": "Brand New"},
    )

    state = encode_state(None, RETURN_TO)
    response = client.get(
        "/auth/google/callback", params={"code": "fake-code", "state": state}, follow_redirects=False
    )
    assert response.status_code in (302, 307)
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["email"] == ["brandnew@gmail.com"]

    new_user = db_session.query(User).filter_by(email="brandnew@gmail.com").one()
    assert query["user_id"] == [str(new_user.id)]
    assert query["is_new_account"] == ["true"]
    assert new_user.name == "Brand New"

    account = db_session.query(EmailAccount).filter_by(user_id=new_user.id, provider=ProviderEnum.google).one()
    assert account.provider_email == "brandnew@gmail.com"


def test_google_callback_relinking_an_already_connected_account_reports_is_new_account_false(
    client, db_session, user, monkeypatch
):
    # Settings' "Change" link re-runs the same callback for an account that's already connected
    # (e.g. to refresh an expired token) -- that's not "linking an account" in the sense this
    # feature means, so the backfill prompt must not be offered a second time.
    monkeypatch.setattr(
        google_oauth,
        "exchange_code_for_tokens",
        lambda code: {"access_token": "fake-access-token", "refresh_token": "fake-refresh-token", "expires_in": 3600},
    )
    monkeypatch.setattr(
        google_oauth,
        "fetch_userinfo",
        lambda access_token: {"email": "someone@gmail.com"},
    )

    state = encode_state(user.id, RETURN_TO)
    first = client.get("/auth/google/callback", params={"code": "fake-code", "state": state}, follow_redirects=False)
    assert parse_qs(urlparse(first.headers["location"]).query)["is_new_account"] == ["true"]

    second = client.get("/auth/google/callback", params={"code": "fake-code-2", "state": state}, follow_redirects=False)
    assert parse_qs(urlparse(second.headers["location"]).query)["is_new_account"] == ["false"]
    assert db_session.query(EmailAccount).filter_by(user_id=user.id, provider=ProviderEnum.google).count() == 1


def test_google_callback_without_user_id_reuses_an_existing_user_by_email(client, db_session, user, monkeypatch):
    user.email = "already@gmail.com"
    db_session.commit()
    monkeypatch.setattr(
        google_oauth,
        "exchange_code_for_tokens",
        lambda code: {"access_token": "fake-access-token", "refresh_token": "fake-refresh-token", "expires_in": 3600},
    )
    monkeypatch.setattr(
        google_oauth,
        "fetch_userinfo",
        lambda access_token: {"email": "already@gmail.com"},
    )

    state = encode_state(None, RETURN_TO)
    response = client.get(
        "/auth/google/callback", params={"code": "fake-code", "state": state}, follow_redirects=False
    )
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["user_id"] == [str(user.id)]
    assert db_session.query(User).filter_by(email="already@gmail.com").count() == 1


def test_google_callback_sets_user_name_from_profile_when_unset(client, db_session, user, monkeypatch):
    assert user.name is None
    monkeypatch.setattr(
        google_oauth,
        "exchange_code_for_tokens",
        lambda code: {"access_token": "fake-access-token", "refresh_token": "fake-refresh-token", "expires_in": 3600},
    )
    monkeypatch.setattr(
        google_oauth,
        "fetch_userinfo",
        lambda access_token: {"email": "someone@gmail.com", "name": "Wei Ling Tan"},
    )

    state = encode_state(user.id, RETURN_TO)
    client.get("/auth/google/callback", params={"code": "fake-code", "state": state}, follow_redirects=False)

    db_session.refresh(user)
    assert user.name == "Wei Ling Tan"


def test_google_callback_does_not_overwrite_existing_user_name(client, db_session, user, monkeypatch):
    user.name = "Already Set"
    db_session.commit()
    monkeypatch.setattr(
        google_oauth,
        "exchange_code_for_tokens",
        lambda code: {"access_token": "fake-access-token", "refresh_token": "fake-refresh-token", "expires_in": 3600},
    )
    monkeypatch.setattr(
        google_oauth,
        "fetch_userinfo",
        lambda access_token: {"email": "someone@gmail.com", "name": "Wei Ling Tan"},
    )

    state = encode_state(user.id, RETURN_TO)
    client.get("/auth/google/callback", params={"code": "fake-code", "state": state}, follow_redirects=False)

    db_session.refresh(user)
    assert user.name == "Already Set"
