# Progress

## Phase 0 — Scaffolding & tooling

**Built:**
- Repo layout: `backend/` (FastAPI) and `app/` (Expo/TypeScript) at repo root.
- `docker-compose.yml` with a single `postgres:16` service (user/pass/db: `user`/`pass`/`expenses`,
  matching `backend/.env.example`).
- `backend/`: `pyproject.toml` (hatchling backend, no poetry/uv on this machine), `.venv`,
  minimal `app/main.py` (FastAPI instance, no routes yet — `/health` is Phase 1), pytest
  configured, `tests/test_smoke.py`.
- `app/`: Expo TypeScript app via `create-expo-app`, Jest configured with `jest-expo` +
  `@testing-library/react-native`, smoke test in `__tests__/App.test.tsx`.
- `.gitignore` covering both stacks.
- `CLAUDE.md` rewritten to reflect this project's working agreement (was previously unrelated
  content from another project).

**Tested:**
- `backend`: `pytest` → 1 passed. `uvicorn app.main:app` booted and served `/docs` with 200.
- `app`: `npx jest` → 1 passed. `npx expo start` brought up the Metro bundler on
  `localhost:8081` without error.

**Manual steps for the human:**
- ~~Docker Desktop install~~ — done. `brew install --cask docker` failed (needs an interactive
  `sudo` password this session can't supply), so the human installed Docker Desktop directly
  instead. Verified working: `docker compose up -d` pulls `postgres:16` and starts it on
  `localhost:5432`, `pg_isready` confirms it accepts connections.
- No Xcode / iOS Simulator on this machine — preview the app via **Expo Go** on a physical device
  by running `npx expo start` inside `app/` and scanning the QR code, rather than `npm run ios`.
- Node is v22.9.0; several Expo SDK 57 / React Native 0.86 packages request `^22.13.0+`
  (`EBADENGINE` warnings during `npm install`, non-fatal so far). Consider upgrading Node if
  real issues show up later.

## Phase 1 — Health endpoint + DB schema + migrations

**Built:**
- `backend/app/config.py`: `Settings` (pydantic-settings) reads `DATABASE_URL` from `backend/.env`
  (git-ignored, created locally — not committed, matches `docker-compose.yml` credentials).
- `backend/app/db.py`: SQLAlchemy engine/session (`SessionLocal`, `get_db` dependency), `Base`.
- `backend/app/models.py`: `User`, `EmailAccount`, `Transaction`, `Category` per BUILD_PLAN §4,
  with Postgres enum types (`provider_enum`, `direction_enum`, `transaction_type_enum`),
  `source_email_id` unique, `txn_at`/`created_at` as timezone-aware timestamps, `raw_parsed` JSONB.
- `backend/app/routers/health.py`: `GET /health` → `{"ok": true}`, wired into `main.py`.
- Alembic initialized (`backend/alembic/`), `env.py` wired to `app.config.settings` and
  `Base.metadata` so `--autogenerate` and `upgrade head` work off the real models. Initial
  migration `301117dd9e40_create_initial_tables.py` creates all four tables.
- `backend/tests/conftest.py`: session-scoped fixture creates (and drops) a dedicated
  `expenses_test` Postgres database for DB-backed tests, separate from the dev `expenses` DB.

**Tested:**
- `pytest` → 3 passed (`test_smoke`, `test_health_ok`, `test_db_round_trip`).
- `alembic upgrade head` run live against the dev Postgres container — confirmed via
  `docker compose exec postgres psql -c '\dt'` that `users`, `email_accounts`, `transactions`,
  `categories`, `alembic_version` all exist.
- `uvicorn app.main:app` booted and `curl localhost:8124/health` returned `{"ok":true}`.

**Manual steps for the human:** none — no new external credentials needed this phase.

## Phase 2 — Transactions API (with fake data)

**Built:**
- `backend/app/schemas.py`: `TransactionOut`, `CategoryUpdateIn`, `TransactionCreateIn`,
  `CategorySummary`, `SummaryOut`.
- `backend/app/routers/transactions.py`:
  - `GET /transactions?user_id=` — newest first, `type=expense` by default (overridable via
    `?type=`).
  - `POST /transactions/{id}/category` — updates and returns the row.
  - `POST /transactions` — manual add (Apple-Pay-no-email fallback); body carries `user_id`,
    generates a synthetic unique `source_email_id` (`manual:<uuid>`), `provider=null`.
  - `GET /summary?user_id=` — per-category totals for the current month, excludes `type=transfer`.
  - **Model change:** `transactions.provider` is now nullable (new migration
    `9333baec37df_make_transactions_provider_nullable.py`) — manual adds have no email provider.
    Applied and verified against the dev DB.
- `backend/app/seed.py` (`python -m app.seed`): idempotent, upserts a demo user and inserts fake
  expense/transfer transactions if not already present (dedup on `source_email_id`).

**Tested:**
- `pytest` → 7 passed (3 from Phase 0/1 + 4 new `test_transactions.py` cases: seeded-row
  ordering with transfer exclusion, category-update persistence, manual add, and summary totals
  that correctly exclude a transfer row and a prior-month row).
- Test isolation: `conftest.py`'s `db_session` fixture truncates all tables before each test
  (route handlers do real `commit()`s, so a plain rollback wouldn't undo them) and a `client`
  fixture overrides the `get_db` FastAPI dependency to bind to that same session.
- Live-verified against the dev Postgres container: ran `python -m app.seed` (twice, to confirm
  idempotency — second run inserted 0 rows), then hit `/transactions`, `/summary`, and manual
  `POST /transactions` over real HTTP with `uvicorn` — summary correctly excluded the seeded
  transfer row.

**Manual steps for the human:** none.

## Phase 3 — Gmail OAuth

**Built:**
- `backend/app/security/crypto.py`: Fernet encrypt/decrypt, reading `TOKEN_ENCRYPTION_KEY` from
  settings; raises a clear `RuntimeError` (with the exact command to generate a key) if unset.
- `backend/app/services/google_oauth.py`: `build_authorization_url`, `exchange_code_for_tokens`,
  `refresh_access_token` (the token-refresh helper), `fetch_userinfo`, `compute_expiry` — thin
  `httpx` wrappers around Google's OAuth endpoints, kept separate from the router so they're easy
  to mock in tests and reusable by `services/gmail.py` in Phase 4.
- `backend/app/routers/auth.py`:
  - `GET /auth/google?user_id=` → redirects to Google consent (`gmail.readonly` scope,
    `access_type=offline`, `prompt=consent`, `user_id` round-tripped via the `state` param).
  - `GET /auth/google/callback?code=&state=` → exchanges the code, fetches the account email,
    encrypts both tokens, upserts an `email_accounts` row.
  - Both return a clear 500 (not a crash) if `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` aren't
    set — verified live via curl.
- `backend/.env` (local, git-ignored) now has a real generated `TOKEN_ENCRYPTION_KEY`;
  `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` left blank pending your Google Cloud credentials.
- Installed `ngrok` CLI via `brew install ngrok` (no sudo needed, unlike Docker Desktop earlier).

**Tested:**
- `pytest` → 11 passed. New: `test_crypto.py` (encrypt→decrypt round-trip; clear error when
  unconfigured), `test_auth.py` (start endpoint redirects to Google with `state` set; callback
  test mocks `google_oauth.exchange_code_for_tokens`/`fetch_userinfo` and asserts an
  `email_accounts` row is written with **non-plaintext** `access_token_enc`/`refresh_token_enc`).

**Manual steps for the human (required before real Gmail linking works):**
1. In Google Cloud Console: enable the **Gmail API**, configure the **OAuth consent screen**
   (External, add your Gmail as a test user, scope `.../auth/gmail.readonly`), then create an
   **OAuth client ID** (Web application) — copy the Client ID/Secret. Leave redirect URIs empty
   until step 3.
2. Sign up at ngrok.com (free), get your authtoken from the dashboard, run
   `ngrok config add-authtoken <token>` once.
3. Run the backend (`uvicorn app.main:app`), then `ngrok http 8000` in another terminal. Copy the
   `https://*.ngrok-free.app` forwarding URL, append `/auth/google/callback`, and:
   - add that exact URL as an **Authorized redirect URI** on the OAuth client in Google Cloud
     Console
   - set `GOOGLE_REDIRECT_URI` to that same URL in `backend/.env`, plus `GOOGLE_CLIENT_ID` and
     `GOOGLE_CLIENT_SECRET` from step 1
   - restart uvicorn so it picks up the new `.env` values
4. Visit `http://localhost:8000/auth/google?user_id=1` in a browser, sign in with your test-user
   Gmail account, and confirm you land on the callback with `{"linked": true, ...}` and a new row
   in `email_accounts` (tokens should be unreadable ciphertext in the DB).
   Note: free ngrok URLs change every restart — you'd need to update the redirect URI (both in
   Google Cloud Console and `.env`) each time unless you reserve a static ngrok domain.

**Bugs found during the human's real end-to-end run (both fixed):**
- `Settings()` resolved `backend/.env` relative to the process's *current working directory*,
  so launching uvicorn from anywhere other than `backend/` crashed on startup with
  `database_url Field required`. Fixed: `config.py` now resolves the `.env` path relative to
  its own file location.
- `fetch_userinfo` called Google's `/oauth2/v2/userinfo` endpoint, but the authorization request
  only asked for the `gmail.readonly` scope — the access token had no permission to read profile
  info, so Google returned `401 Unauthorized`. Fixed: `build_authorization_url` now also requests
  `openid` and `https://www.googleapis.com/auth/userinfo.email`. If Google Cloud Console rejects
  those (unlikely — they're non-sensitive/default scopes), add them under OAuth consent screen →
  **Data access** the same way `gmail.readonly` was added.

## Phase 4 — Email fetch + parse (regex)

**Built:**
- `backend/app/services/parser.py`: `ParsedTxn` dataclass, `parse_email(text, sender)`, and
  `save_parsed_transaction(db, user_id, source_email_id, provider, parsed)`.
  - Per-bank regex extractors: DBS (Own Funds Transfer, PayNow, NETS Scan & Pay), UOB (PayNow).
  - Amount regex handles both `S$87.00` and `SGD 200.00`/`SGD200.00`.
  - Classification: "Own Funds Transfer" -> `transfer`; PayNow `(UEN ending ...)` -> `expense`;
    PayNow `(MOBILE/NRIC ending ...)` -> `transfer`; NETS -> `expense`.
  - SimplyGo fare parser -> `expense`, `category="Transport"`, `merchant_raw="Transit: X-Y"`.
  - Dates are naive day/month(/year) in bank alert text; parsed as `Asia/Singapore` (UTC+8) and
    stored timezone-aware. Year defaults to the current year when the text omits it (DBS/SimplyGo
    fixtures); UOB's fixture includes a 2-digit year.
  - Dedup: `save_parsed_transaction` looks up by `source_email_id` first and returns the existing
    row instead of inserting a duplicate.
- `backend/app/services/gmail.py`: `list_bank_messages`/`fetch_message` (Gmail API, bank-sender
  query `from:(dbs.com.sg OR uob.com.sg OR simplygo) newer_than:60d`), `extract_plain_text`
  (base64url-decodes the message body, prefers `text/plain`, falls back to stripping `text/html`
  via stdlib `html.parser` -- no new HTML-parsing dependency), `get_sender`.
- `backend/tests/fixtures/emails/`: one `.txt` fixture per BUILD_PLAN §7 case, plus
  `unparseable_unknown_format.txt` for the "returns None" test.
  - **`dbs_card_wallet.txt` intentionally not built** -- BUILD_PLAN §7 itself notes it only
    arrives as an Apple Wallet push in practice, no real email equivalent, and says to document
    it as a manual-entry case instead. That path already exists: Phase 2's `POST /transactions`.

**Tested:**
- `pytest` -> 23 passed. `test_parser.py`: all 6 real fixtures assert amount, currency, merchant
  (where applicable), direction, type, bank, and the full parsed date/time in SGT; the
  unparseable fixture returns `None`; a dedup test calls `save_parsed_transaction` twice with the
  same `source_email_id` and asserts only one row exists.
- `test_gmail.py`: unit tests for `strip_html`, `extract_plain_text` (plain-text preferred,
  HTML fallback), and `get_sender` -- pure functions, no network, not required by BUILD_PLAN's
  Phase 4 test list but written anyway since they're new code with deterministic behavior.
- `services/gmail.py`'s network calls (`list_bank_messages`/`fetch_message`) aren't exercised yet
  -- BUILD_PLAN defers that to Phase 5's `/sync` endpoint tests, which will mock the Gmail service.

**Manual steps for the human:** none.

## Phase 5 — Sync scheduler + endpoint

**Built:**
- `backend/app/services/sync.py`: `sync_google_account(db, account)` -- gets a valid access
  token (decrypts the stored one, or refreshes via `google_oauth.refresh_access_token` and
  re-encrypts if `expires_at` has passed), builds the Gmail query (bank-sender filter plus
  `after:<unix ts of last_synced_at>` once there's been a prior sync, else `newer_than:60d`),
  lists/fetches/parses each message, inserts via `save_parsed_transaction` (dedup already built
  into that from Phase 4), and updates `last_synced_at`. Returns the count of newly-inserted rows.
- `backend/app/routers/sync.py`: `POST /sync?user_id=` runs `sync_google_account` for every
  linked Google account belonging to that user, returns per-account and total inserted counts.
- `backend/app/services/scheduler.py`: APScheduler `BackgroundScheduler`, one job every 10
  minutes that syncs every linked Google account across all users; one account failing (e.g. a
  revoked token) is caught and rolled back so it doesn't stop the rest. Wired into `main.py` via
  a FastAPI `lifespan` (starts on app startup, shuts down cleanly on shutdown).

**Tested:**
- `pytest` -> 24 passed. `test_sync.py` mocks `gmail.list_bank_messages`/`fetch_message` (network
  boundary only -- real `extract_plain_text`/`get_sender`/`parse_email` run against a
  synthetic-but-realistic Gmail message payload) with one DBS and one SimplyGo fixture: first
  `/sync` call inserts 2, `last_synced_at` gets set; a second `/sync` call against the same mocked
  mail inserts 0 (idempotent), per BUILD_PLAN's DoD.
- Live-verified: booted uvicorn, confirmed the scheduler starts/stops cleanly around requests,
  and called `POST /sync?user_id=1` against the **real** linked Gmail account from the Phase 3
  manual test -- it used the real stored (encrypted) token, queried Gmail for real, and returned
  200 with `inserted: 0` (no matching bank mail in the inbox), proving the whole pipeline works
  end-to-end, not just against mocks.

**Manual steps for the human:** none.

## Phase 6 — Outlook (Microsoft Graph), auth part

Doing this phase in two steps at the human's request: OAuth first (this entry), then
`services/graph.py` mail fetching once Microsoft auth is verified end-to-end.

**Built:**
- `backend/app/services/ms_oauth.py`: mirrors `google_oauth.py` -- `build_authorization_url`,
  `exchange_code_for_tokens`, `refresh_access_token`, `fetch_userinfo` (calls Microsoft Graph
  `/me`), `compute_expiry`. Uses the `common` tenant endpoint (works for both personal Microsoft
  accounts and work/school accounts) with scopes `offline_access User.Read Mail.Read`.
- `backend/app/routers/auth.py`: added `GET /auth/microsoft?user_id=` and
  `GET /auth/microsoft/callback`, both guarded the same way as Google's (clear 500 if
  `MS_CLIENT_ID`/`SECRET`/`REDIRECT_URI` aren't set -- verified live via curl). Refactored the
  upsert-and-encrypt logic the two providers share into `_upsert_email_account`, used by both
  callbacks now. `provider_email` prefers Graph's `mail` field, falling back to
  `userPrincipalName` since `mail` can be null on some personal accounts.
- `backend/app/config.py`: added `ms_client_id`/`ms_client_secret`/`ms_redirect_uri` (all
  optional, same pattern as the Google fields).
- `backend/.env`: blank `MS_CLIENT_ID`/`MS_CLIENT_SECRET`/`MS_REDIRECT_URI` placeholders added
  (git-ignored, not committed).

**Tested:**
- `pytest` -> 27 passed. New `test_ms_auth.py`: start endpoint redirects to
  `login.microsoftonline.com` with `state` set; callback test mocks `ms_oauth`'s token/userinfo
  calls and asserts an encrypted `email_accounts` row with `provider=microsoft`; a third test
  covers the `mail: null` -> `userPrincipalName` fallback.

**Manual steps for the human (required before real Outlook linking works, mirrors Phase 3):**
1. In the [Azure Portal](https://portal.azure.com): **Azure Active Directory (Microsoft Entra
   ID) → App registrations → New registration**.
   - Name it (e.g. "XPense dev").
   - Supported account types: **"Accounts in any organizational directory and personal Microsoft
     accounts"** (matches the `common` endpoint the code uses -- lets you sign in with either an
     Outlook.com/Hotmail address or a work/school account).
   - Redirect URI: leave blank for now (added in step 3, same ngrok-dependency as Google).
2. After creation: **Certificates & secrets → New client secret** -- copy the secret **value**
   immediately (it's hidden after you leave the page). Copy the **Application (client) ID** from
   the app's Overview page too.
   - **API permissions → Add a permission → Microsoft Graph → Delegated permissions**: add
     `Mail.Read`, `User.Read`, `offline_access` (User.Read is usually pre-added by default).
3. With the backend running and `ngrok http 8000` active (same tunnel Google uses is fine, or a
   fresh one): copy the forwarding URL, append `/auth/microsoft/callback`, and:
   - add it under the app registration's **Authentication → Add a platform → Web** → redirect URI
   - set `MS_REDIRECT_URI` to that URL in `backend/.env`, plus `MS_CLIENT_ID` and
     `MS_CLIENT_SECRET` from step 2
   - restart uvicorn
4. Visit `http://localhost:8000/auth/microsoft?user_id=1`, sign in with an Outlook/Hotmail (or
   work/school) account, and confirm `{"linked": true, "provider": "microsoft", ...}` with a new
   encrypted row in `email_accounts`.
