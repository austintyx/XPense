import pytest

from app.config import settings
from app.models import EmailAccount, ProviderEnum
from app.services import google_oauth


@pytest.fixture(autouse=True)
def _google_config(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-client-secret")
    monkeypatch.setattr(settings, "google_redirect_uri", "https://example.ngrok.io/auth/google/callback")


def test_google_auth_start_redirects_to_google(client, user):
    response = client.get(f"/auth/google?user_id={user.id}", follow_redirects=False)
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    assert f"state={user.id}" in location


def test_google_callback_stores_encrypted_tokens(client, db_session, user, monkeypatch):
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

    response = client.get(f"/auth/google/callback?code=fake-code&state={user.id}")
    assert response.status_code == 200
    assert response.json()["provider_email"] == "someone@gmail.com"

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
