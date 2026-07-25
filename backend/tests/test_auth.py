from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.models import EmailAccount, ProviderEnum
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
