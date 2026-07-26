from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.models import EmailAccount, ProviderEnum
from app.services import ms_oauth
from app.services.oauth_state import decode_state, encode_state

RETURN_TO = "exp://192.168.1.5:8081/--/"


@pytest.fixture(autouse=True)
def _ms_config(monkeypatch):
    monkeypatch.setattr(settings, "ms_client_id", "test-ms-client-id")
    monkeypatch.setattr(settings, "ms_client_secret", "test-ms-client-secret")
    monkeypatch.setattr(settings, "ms_redirect_uri", "https://example.ngrok.io/auth/microsoft/callback")


def test_microsoft_auth_start_redirects_to_microsoft_carrying_return_to(client, user):
    response = client.get(
        "/auth/microsoft", params={"user_id": user.id, "return_to": RETURN_TO}, follow_redirects=False
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")

    state = parse_qs(urlparse(location).query)["state"][0]
    decoded_user_id, decoded_return_to = decode_state(state)
    assert decoded_user_id == user.id
    assert decoded_return_to == RETURN_TO


def test_microsoft_callback_stores_encrypted_tokens_and_redirects_to_app(client, db_session, user, monkeypatch):
    monkeypatch.setattr(
        ms_oauth,
        "exchange_code_for_tokens",
        lambda code: {
            "access_token": "fake-ms-access-token",
            "refresh_token": "fake-ms-refresh-token",
            "expires_in": 3600,
        },
    )
    monkeypatch.setattr(
        ms_oauth,
        "fetch_userinfo",
        lambda access_token: {"mail": "someone@outlook.com", "userPrincipalName": "someone@outlook.com"},
    )

    state = encode_state(user.id, RETURN_TO)
    response = client.get(
        "/auth/microsoft/callback", params={"code": "fake-code", "state": state}, follow_redirects=False
    )
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith(RETURN_TO)
    query = parse_qs(urlparse(location).query)
    assert query["linked"] == ["true"]
    assert query["provider"] == ["microsoft"]
    assert query["email"] == ["someone@outlook.com"]

    account = (
        db_session.query(EmailAccount)
        .filter_by(user_id=user.id, provider=ProviderEnum.microsoft)
        .one()
    )
    assert account.provider_email == "someone@outlook.com"
    assert account.access_token_enc != "fake-ms-access-token"
    assert account.refresh_token_enc != "fake-ms-refresh-token"


def test_microsoft_callback_falls_back_to_user_principal_name(client, db_session, user, monkeypatch):
    # personal Microsoft accounts sometimes return a null "mail" field
    monkeypatch.setattr(
        ms_oauth,
        "exchange_code_for_tokens",
        lambda code: {"access_token": "fake-ms-access-token", "refresh_token": "fake-ms-refresh-token", "expires_in": 3600},
    )
    monkeypatch.setattr(
        ms_oauth,
        "fetch_userinfo",
        lambda access_token: {"mail": None, "userPrincipalName": "someone@live.com"},
    )

    state = encode_state(user.id, RETURN_TO)
    response = client.get(
        "/auth/microsoft/callback", params={"code": "fake-code", "state": state}, follow_redirects=False
    )
    assert response.status_code in (302, 307)
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["email"] == ["someone@live.com"]


def test_microsoft_callback_sets_user_name_from_profile_when_unset(client, db_session, user, monkeypatch):
    assert user.name is None
    monkeypatch.setattr(
        ms_oauth,
        "exchange_code_for_tokens",
        lambda code: {"access_token": "fake-ms-access-token", "refresh_token": "fake-ms-refresh-token", "expires_in": 3600},
    )
    monkeypatch.setattr(
        ms_oauth,
        "fetch_userinfo",
        lambda access_token: {
            "mail": "someone@outlook.com",
            "userPrincipalName": "someone@outlook.com",
            "displayName": "Wei Ling Tan",
        },
    )

    state = encode_state(user.id, RETURN_TO)
    client.get("/auth/microsoft/callback", params={"code": "fake-code", "state": state}, follow_redirects=False)

    db_session.refresh(user)
    assert user.name == "Wei Ling Tan"
