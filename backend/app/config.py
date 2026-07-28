from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    database_url: str
    token_encryption_key: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None
    ms_client_id: str | None = None
    ms_client_secret: str | None = None
    ms_redirect_uri: str | None = None
    gemini_api_key: str | None = None
    # Comma-separated browser origins allowed to call this API (the web frontend). Defaults to
    # the local Expo web dev server ports so `npm run web` works out of the box with no .env
    # changes; a deployed frontend's real origin must be set explicitly via this env var.
    # 8090 is `npm run web`'s pinned port (see app/package.json) -- 8081/19006 are Expo's more
    # common defaults elsewhere, kept as a fallback.
    cors_allowed_origins: str = "http://localhost:8090,http://localhost:8081,http://localhost:19006"

    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")


settings = Settings()
