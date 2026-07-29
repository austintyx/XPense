from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.config import settings
from app.db import get_db
from app.models import EmailAccount, ProviderEnum, User
from app.schemas import LoginIn, RegisterIn, UserOut
from app.security.crypto import encrypt
from app.security.passwords import hash_password, verify_password
from app.services import google_oauth, ms_oauth
from app.services.oauth_state import decode_state, encode_state

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


def _resolve_user(db: Session, user_id: int | None, provider_email: str) -> User:
    """`user_id` given -> linking an additional mailbox to an already-known user (existing
    behavior). `user_id` is None -> the login/signup flow: the OAuth account being connected
    *is* how the user gets identified, so look them up (or create them) by that email."""
    if user_id is not None:
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    user = db.query(User).filter_by(email=provider_email).first()
    if user is not None:
        return user

    user = User(email=provider_email)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two concurrent logins for the same brand-new email (e.g. a double-tapped connect
        # button) -- the unique constraint on users.email caught it, so just fetch the row
        # the other request created instead of erroring.
        db.rollback()
        user = db.query(User).filter_by(email=provider_email).first()
        if user is None:
            raise
    else:
        db.refresh(user)
    return user


def _upsert_email_account(
    db: Session, user_id: int, provider: ProviderEnum, provider_email: str, token_data: dict, expires_at
) -> tuple[EmailAccount, bool]:
    account = (
        db.query(EmailAccount)
        .filter_by(user_id=user_id, provider=provider, provider_email=provider_email)
        .first()
    )
    created = account is None
    if account is None:
        account = EmailAccount(user_id=user_id, provider=provider, provider_email=provider_email)
        db.add(account)

    account.access_token_enc = encrypt(token_data["access_token"])
    if "refresh_token" in token_data:
        account.refresh_token_enc = encrypt(token_data["refresh_token"])
    account.expires_at = expires_at

    db.commit()
    db.refresh(account)
    return account, created


def _maybe_set_user_name(db: Session, user: User, name: str | None) -> None:
    """Opportunistically fill in a display name from the OAuth profile the first time a user
    links an account -- never overwrites a name the user already has (e.g. set manually in
    Settings)."""
    if not name or user.name is not None:
        return
    user.name = name
    db.commit()


def _append_query(url: str, **params: str) -> str:
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{urlencode(params)}"


@router.get("/auth/google")
def google_auth_start(return_to: str, user_id: int | None = None):
    _require_google_config()
    state = encode_state(user_id, return_to)
    return RedirectResponse(google_oauth.build_authorization_url(state=state))


@router.get("/auth/google/callback")
def google_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    _require_google_config()
    user_id, return_to = decode_state(state)

    token_data = google_oauth.exchange_code_for_tokens(code)
    userinfo = google_oauth.fetch_userinfo(token_data["access_token"])
    provider_email = userinfo["email"]
    expires_at = google_oauth.compute_expiry(token_data.get("expires_in", 3600))

    user = _resolve_user(db, user_id, provider_email)
    _, is_new_account = _upsert_email_account(db, user.id, ProviderEnum.google, provider_email, token_data, expires_at)
    _maybe_set_user_name(db, user, userinfo.get("name"))

    return RedirectResponse(
        _append_query(
            return_to,
            linked="true",
            provider="google",
            email=provider_email,
            user_id=str(user.id),
            is_new_account="true" if is_new_account else "false",
        )
    )


@router.get("/auth/microsoft")
def microsoft_auth_start(return_to: str, user_id: int | None = None):
    _require_ms_config()
    state = encode_state(user_id, return_to)
    return RedirectResponse(ms_oauth.build_authorization_url(state=state))


@router.get("/auth/microsoft/callback")
def microsoft_auth_callback(code: str, state: str, db: Session = Depends(get_db)):
    _require_ms_config()
    user_id, return_to = decode_state(state)

    token_data = ms_oauth.exchange_code_for_tokens(code)
    userinfo = ms_oauth.fetch_userinfo(token_data["access_token"])
    provider_email = userinfo.get("mail") or userinfo["userPrincipalName"]
    expires_at = ms_oauth.compute_expiry(token_data.get("expires_in", 3600))

    user = _resolve_user(db, user_id, provider_email)
    _, is_new_account = _upsert_email_account(
        db, user.id, ProviderEnum.microsoft, provider_email, token_data, expires_at
    )
    _maybe_set_user_name(db, user, userinfo.get("displayName"))

    return RedirectResponse(
        _append_query(
            return_to,
            linked="true",
            provider="microsoft",
            email=provider_email,
            user_id=str(user.id),
            is_new_account="true" if is_new_account else "false",
        )
    )


@router.post("/auth/register", response_model=UserOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email).first()
    if user is not None and user.password_hash is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    if user is None:
        # Brand-new email -- create the account outright.
        user = User(email=body.email, name=body.name, password_hash=hash_password(body.password))
        db.add(user)
    else:
        # An existing OAuth-only account (e.g. from linking Gmail/Outlook) with no password yet --
        # attach one to the same identity instead of fragmenting into a second account.
        user.password_hash = hash_password(body.password)
        if body.name and user.name is None:
            user.name = body.name

    try:
        db.commit()
    except IntegrityError:
        # Two concurrent registrations for the same brand-new email -- same race handled in
        # _resolve_user above.
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    db.refresh(user)
    return user


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email).first()
    if user is None or user.password_hash is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return user
