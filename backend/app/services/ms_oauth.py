from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.services.oauth_http import raise_for_status_with_body

AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
ME_URL = "https://graph.microsoft.com/v1.0/me"
# offline_access for a refresh token; User.Read so /me resolves the account's email;
# Mail.Read to read mail in Phase 6's services/graph.py.
SCOPES = " ".join(["offline_access", "User.Read", "Mail.Read"])


def build_authorization_url(state: str) -> str:
    # No `prompt=consent` -- forcing that shows Microsoft's full permissions screen on every
    # single connect, even a repeat one for an already-authorized account. Without it, a repeat
    # authorization is a quick silent re-auth instead. Unlike Google, Microsoft's v2.0 endpoint
    # still returns a refresh_token on every exchange as long as `offline_access` is in scope, so
    # there's no equivalent "only issued once" nuance to handle here.
    params = {
        "client_id": settings.ms_client_id,
        "redirect_uri": settings.ms_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict:
    response = httpx.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.ms_client_id,
            "client_secret": settings.ms_client_secret,
            "redirect_uri": settings.ms_redirect_uri,
            "grant_type": "authorization_code",
            "scope": SCOPES,
        },
    )
    raise_for_status_with_body(response)
    return response.json()


def refresh_access_token(refresh_token: str) -> dict:
    response = httpx.post(
        TOKEN_URL,
        data={
            "refresh_token": refresh_token,
            "client_id": settings.ms_client_id,
            "client_secret": settings.ms_client_secret,
            "grant_type": "refresh_token",
            "scope": SCOPES,
        },
    )
    raise_for_status_with_body(response)
    return response.json()


def fetch_userinfo(access_token: str) -> dict:
    response = httpx.get(ME_URL, headers={"Authorization": f"Bearer {access_token}"})
    raise_for_status_with_body(response)
    return response.json()


def compute_expiry(expires_in: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=expires_in)
