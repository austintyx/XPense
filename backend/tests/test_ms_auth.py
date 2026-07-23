import pytest

from app.config import settings
from app.models import EmailAccount, ProviderEnum
from app.services import ms_oauth


@pytest.fixture(autouse=True)
def _ms_config(monkeypatch):
    monkeypatch.setattr(settings, "ms_client_id", "test-ms-client-id")
    monkeypatch.setattr(settings, "ms_client_secret", "test-ms-client-secret")
    monkeypatch.setattr(settings, "ms_redirect_uri", "https://example.ngrok.io/auth/microsoft/callback")


def test_microsoft_auth_start_redirects_to_microsoft(client, user):
    response = client.get(f"/auth/microsoft?user_id={user.id}", follow_redirects=False)
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
    assert f"state={user.id}" in location


def test_microsoft_callback_stores_encrypted_tokens(client, db_session, user, monkeypatch):
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

    response = client.get(f"/auth/microsoft/callback?code=fake-code&state={user.id}")
    assert response.status_code == 200
    assert response.json()["provider_email"] == "someone@outlook.com"

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

    response = client.get(f"/auth/microsoft/callback?code=fake-code&state={user.id}")
    assert response.status_code == 200
    assert response.json()["provider_email"] == "someone@live.com"
