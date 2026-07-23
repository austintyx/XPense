from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.config import settings
from app.db import get_db
from app.models import EmailAccount, ProviderEnum
from app.security.crypto import encrypt
from app.services import google_oauth, ms_oauth

router = APIRouter()


def _require_google_config() -> None:
    if not (settings.google_client_id and settings.google_client_secret and settings.google_redirect_uri):
        raise HTTPException(
            status_code=500,
            detail=(
                "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "
                "GOOGLE_REDIRECT_URI in backend/.env."
            ),
        )


def _require_ms_config() -> None:
    if not (settings.ms_client_id and settings.ms_client_secret and settings.ms_redirect_uri):
        raise HTTPException(
            status_code=500,
            detail=(
                "Microsoft OAuth is not configured. Set MS_CLIENT_ID, MS_CLIENT_SECRET, "
                "MS_REDIRECT_URI in backend/.env."
            ),
        )


def _upsert_email_account(
    db: Session, user_id: int, provider: ProviderEnum, provider_email: str, token_data: dict, expires_at
) -> EmailAccount:
    account = (
        db.query(EmailAccount)
        .filter_by(user_id=user_id, provider=provider, provider_email=provider_email)
        .first()
    )
    if account is None:
        account = EmailAccount(user_id=user_id, provider=provider, provider_email=provider_email)
        db.add(account)

    account.access_token_enc = encrypt(token_data["access_token"])
    if "refresh_token" in token_data:
        account.refresh_token_enc = encrypt(token_data["refresh_token"])
    account.expires_at = expires_at

    db.commit()
    db.refresh(account)
    return account


@router.get("/auth/google")
def google_auth_start(user_id: int):
    _require_google_config()
    return RedirectResponse(google_oauth.build_authorization_url(state=str(user_id)))


@router.get("/auth/google/callback")
def google_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    _require_google_config()
    user_id = int(state)

    token_data = google_oauth.exchange_code_for_tokens(code)
    userinfo = google_oauth.fetch_userinfo(token_data["access_token"])
    provider_email = userinfo["email"]
    expires_at = google_oauth.compute_expiry(token_data.get("expires_in", 3600))

    _upsert_email_account(db, user_id, ProviderEnum.google, provider_email, token_data, expires_at)

    return {"linked": True, "provider": "google", "provider_email": provider_email}


@router.get("/auth/microsoft")
def microsoft_auth_start(user_id: int):
    _require_ms_config()
    return RedirectResponse(ms_oauth.build_authorization_url(state=str(user_id)))


@router.get("/auth/microsoft/callback")
def microsoft_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    _require_ms_config()
    user_id = int(state)

    token_data = ms_oauth.exchange_code_for_tokens(code)
    userinfo = ms_oauth.fetch_userinfo(token_data["access_token"])
    provider_email = userinfo.get("mail") or userinfo["userPrincipalName"]
    expires_at = ms_oauth.compute_expiry(token_data.get("expires_in", 3600))

    _upsert_email_account(db, user_id, ProviderEnum.microsoft, provider_email, token_data, expires_at)

    return {"linked": True, "provider": "microsoft", "provider_email": provider_email}
