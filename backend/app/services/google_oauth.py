from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.services.oauth_http import raise_for_status_with_body

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
# gmail.readonly to read mail; openid + userinfo.email so /oauth2/v2/userinfo can identify
# which account this is (fetch_userinfo below) — without it, that call 401s.
SCOPES = " ".join(
    [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/gmail.readonly",
    ]
)


def build_authorization_url(state: str) -> str:
    # No `prompt=consent` -- forcing that shows Google's full consent screen on every single
    # connect, even a repeat one for an already-authorized account. Without it, a repeat
    # authorization is a quick silent re-auth instead. This does mean a repeat grant's token
    # response won't include a new refresh_token (Google only issues one on the first consent per
    # user+client+scope) -- _upsert_email_account in routers/auth.py already handles that
    # correctly by only overwriting the stored refresh token when the response actually includes
    # one, so the existing one is kept rather than being wiped.
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict:
    response = httpx.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    raise_for_status_with_body(response)
    return response.json()


def refresh_access_token(refresh_token: str) -> dict:
    response = httpx.post(
        TOKEN_URL,
        data={
            "refresh_token": refresh_token,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "grant_type": "refresh_token",
        },
    )
    raise_for_status_with_body(response)
    return response.json()


def fetch_userinfo(access_token: str) -> dict:
    response = httpx.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
    raise_for_status_with_body(response)
    return response.json()


def compute_expiry(expires_in: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=expires_in)
