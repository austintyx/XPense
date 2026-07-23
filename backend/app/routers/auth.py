from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.config import settings
from app.db import get_db
from app.models import EmailAccount, ProviderEnum
from app.security.crypto import encrypt
from app.services import google_oauth

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

    account = (
        db.query(EmailAccount)
        .filter_by(user_id=user_id, provider=ProviderEnum.google, provider_email=provider_email)
        .first()
    )
    if account is None:
        account = EmailAccount(user_id=user_id, provider=ProviderEnum.google, provider_email=provider_email)
        db.add(account)

    account.access_token_enc = encrypt(token_data["access_token"])
    if "refresh_token" in token_data:
        account.refresh_token_enc = encrypt(token_data["refresh_token"])
    account.expires_at = expires_at

    db.commit()
    db.refresh(account)

    return {"linked": True, "provider": "google", "provider_email": provider_email}
