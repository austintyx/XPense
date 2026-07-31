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

**Bug found during the human's real run (fixed):** `httpx`'s bare `raise_for_status()` only
reported "401 Unauthorized" with no detail, which made a real failure hard to diagnose (turned
out to be an Azure Portal Secret ID vs Secret Value mix-up in `.env` -- Secret ID is always
GUID-shaped, the actual Value is a longer random string shown once at creation). Added
`services/oauth_http.py`'s `raise_for_status_with_body`, now used everywhere Google/Microsoft
token or userinfo calls happen, so the provider's real error body shows up in the traceback.

## Phase 6 (part 2) — Microsoft Graph mail fetching, provider-agnostic sync

**Built:**
- `backend/app/services/graph.py`: mirrors `gmail.py`'s four-function interface
  (`list_bank_messages`, `fetch_message`, `extract_plain_text`, `get_sender`) against Microsoft
  Graph instead of the Gmail API. Uses Graph's `$search` (supports the same `from:` operator
  Outlook's search box does) for the bank-sender query; message bodies come back as plain
  strings (no base64 decoding needed, unlike Gmail) with `contentType` telling you whether to
  run them through the shared `strip_html` (reused from `gmail.py`, not duplicated).
- `backend/app/services/sync.py`: generalized from Google-only to provider-agnostic —
  `sync_email_account(db, account)` looks up the right mail-service module and OAuth-service
  module from small provider->module maps and runs the identical loop either way. Token refresh
  now also updates `refresh_token_enc` when the provider issues a new one (Microsoft can rotate
  refresh tokens on each use; this was silently skipped for Google before, harmlessly, since
  Google's don't rotate, but it's more correct for both now).
  - Known limitation: unlike Gmail's `after:<timestamp>`, Graph's query isn't time-bounded by
    `last_synced_at` (combining `$search` with a date `$filter` reliably needs a real mailbox to
    verify against). Correctness isn't affected -- dedup on `source_email_id` still guarantees no
    duplicate rows -- it's just less efficient, re-scanning the same bank-sender mail every sync.
- `backend/app/routers/sync.py` and `backend/app/services/scheduler.py`: no longer filter to
  `provider=google` -- both now iterate every linked account regardless of provider.

**Tested:**
- `pytest` -> 32 passed. `test_graph.py`: plain/HTML body extraction, sender formatting (pure
  functions, no network). `test_sync.py`: new
  `test_sync_microsoft_account_reaches_identical_output_through_same_parser` feeds the same DBS
  PayNow text through the (mocked) Graph path and asserts the resulting row has the same amount/
  merchant/type/bank as the Gmail path -- this is BUILD_PLAN's Phase 6 DoD ("both providers reach
  identical transaction output through one parser").
- Live-verified: `POST /sync?user_id=1` against **both** real linked accounts (the Gmail one from
  Phase 3 and the real Outlook account just linked) in a single call -- both synced cleanly
  through the same generalized pipeline, `inserted: 0` for both (no real bank mail in either
  inbox yet).

**Manual steps for the human:** none beyond the Azure setup already done above.

## Real-world bug fixes (found by syncing the human's actual Outlook inbox)

Once real DBS card-purchase alerts existed in the linked Outlook inbox, `/sync` returned
`inserted: 0` for the Microsoft account. Diagnosed live against the real Graph API/mailbox
(not mocks) and found three issues:

1. **Bank-sender query too narrow.** `BANK_SENDER_QUERY` required `.com.sg`-suffixed domains
   (`dbs.com.sg`, `uob.com.sg`), but the human's real DBS transaction alerts come from
   `ibanking.alert@dbs.com` -- no `.sg`. Broadened both `gmail.py` and `graph.py`'s queries (and
   `sync.py`'s duplicate Gmail filter constant) to match on brand name alone
   (`dbs`/`uob`/`simplygo`); the regex parser is the real precision filter, so a broader coarse
   fetch is safe.
2. **HTML stripping leaked `<style>`/`<script>` content.** `_HTMLTextExtractor` captured all
   `handle_data` calls, including CSS text inside `<style>` blocks, polluting extracted text with
   raw CSS before the real message content. Didn't break parsing in practice (regex `.search()`
   still found the real content past the noise) but was clearly wrong; fixed by tracking
   start/end tags and skipping data while inside `style`/`script`.
3. **Missing parser for DBS's real card-purchase alert format** ("Card Transaction Alert" --
   `Date & Time: ... Amount: SGD... From: ... card ending ... To: MERCHANT`), which none of
   BUILD_PLAN §7's fixtures covered (those only had PayNow/NETS/Own-Transfer). Added
   `_DBS_CARD_TXN_RE` to `parser.py` plus a fixture (`dbs_card_transaction_alert.txt`, built with
   synthetic amount/merchant -- not the human's real transaction data -- to avoid committing
   personal financial details to the repo) and a `test_parser.py` case.

**Verified against real data:** after the fixes, `POST /sync?user_id=1` inserted **5** real
transactions from the linked Outlook inbox -- actual purchases the human made (supermarket,
online marketplace, transit, a restaurant, a cinema), each correctly parsed as `bank=DBS`,
`type=expense`, with the right amount/merchant/timestamp. `pytest` -> 33 passed (dbs_card_wallet
fixture added, all prior tests still green).

## How to independently verify the Microsoft Graph calls are real (not mocked)

Two ways, without trusting the app's own claims:
1. **The data itself is the strongest proof** -- the transactions that appeared after `/sync`
   (merchant names, amounts, timestamps) match real purchases, and `source_email_id` on each row
   is a real Graph message ID (a long `AQMk...` string), not something the app could fabricate.
2. **Azure Portal → Microsoft Entra ID → Enterprise applications** → find the app by name → 
   **Sign-in logs** tab shows an entry each time a token was issued/refreshed for it (e.g. when
   you first consented, and on subsequent silent token refreshes). Per-API-call logs beyond that
   aren't available on the free tier, so (1) is the more direct check for actual data access.

## Bank-sender allowlist (pulled forward from Phase 10)

The human has configured all card/PayNow/transit spends to route through the bank's own
transaction-alert email (no separate merchant/transit sender), and gave the exact addresses:
DBS `ibanking.alert@dbs.com`, UOB `unialerts@uobgroup.com`. Since these are known exactly, moved
off the brand-name substring matching from the previous fix (which is how a UOB marketing sender
matched in the first place) onto an exact-address allowlist:

- `backend/app/services/bank_senders.py` (new): `KNOWN_BANK_SENDERS` (hardcoded dict, per user
  decision -- simplest for a single-user app, easy to make per-user later if needed),
  `is_allowlisted_sender()`, and the Gmail/Graph query-string builders derived from the same dict
  so the query and the enforcement can never drift apart.
- `gmail.py` / `graph.py`: `BANK_SENDER_QUERY` now built from the exact-address list instead of
  brand-name substrings.
- `sync.py`: **hard filter** -- every fetched message's sender is checked against the allowlist
  and skipped (never parsed, never stored) if it doesn't match exactly, even though the query
  should already exclude it. This is defense in depth against exactly the kind of fuzzy-match
  false positive Graph's `$search` produced last time, and it's substantively Phase 10's "enforce
  bank-sender allowlist before reading any body" requirement -- built now because we had a
  concrete reason to, not scheduled scope creep.
- SimplyGo's parser/fixture/test are untouched (still real code, matches BUILD_PLAN §7) but it's
  not in the sender allowlist, since the human's real setup never sends a separate SimplyGo email.

**Tested:** `pytest` -> 39 passed. New `test_bank_senders.py` (address extraction, allowlist
accept/reject including the exact marketing sender that leaked through last time). `test_sync.py`
updated to use the real allowlisted addresses instead of guessed `.com.sg` ones, plus a new test
that a non-allowlisted sender returned by (mocked) search is skipped with zero rows written.
Live-verified: re-ran the real Graph query against the linked Outlook account -- all 10 results
now come from `ibanking.alert@dbs.com`, zero marketing mail, versus 25/25 marketing mail before
this change.

## Phase 8 -- App: Connect Email screen

Three design decisions confirmed with the human before building: (1) OAuth returns to the app via
an auto-closing deep-link redirect rather than a manual "tap back" flow -- required backend
changes; (2) the phone reaches the backend via the existing ngrok tunnel, not a LAN IP; (3)
React Navigation is set up now rather than deferred to Phase 9.

**Backend changes (needed for #1 and for the screen to show real status):**
- `backend/app/services/oauth_state.py` (new): `encode_state`/`decode_state` pack `user_id` *and*
  the app's own redirect URI into the OAuth `state` param (base64url JSON), so both survive the
  round trip through Google/Microsoft's consent screen.
- `backend/app/routers/auth.py`: `/auth/google` and `/auth/microsoft` now require a `return_to`
  query param (the app's deep link). The callbacks decode `state`, upsert the account as before,
  then `RedirectResponse` to `return_to` with `?linked=true&provider=...&email=...` appended --
  replacing the old plain-JSON response. `expo-web-browser`'s `openAuthSessionAsync` on the app
  side auto-detects this and closes the in-app browser.
- `backend/app/routers/email_accounts.py` (new) + `EmailAccountOut` schema: `GET /email-accounts?
  user_id=` lists linked accounts (provider, email, last_synced_at) -- no tokens exposed. This is
  what "show linked-account status from the backend" actually calls.
- `test_auth.py`/`test_ms_auth.py` rewritten for the redirect-based flow (assert `Location` header
  + decoded state, not JSON body); new `test_email_accounts.py`.
- Live-verified: `curl` against `/auth/google?user_id=1&return_to=exp://...` returns a 307 to
  Google with a correctly base64-encoded `state`; `/email-accounts?user_id=1` returns both real
  linked accounts (Gmail + Outlook) from earlier phases.

**App changes:**
- Installed `expo-web-browser`, `expo-auth-session`, `@react-navigation/native` +
  `native-stack` (+ `react-native-screens`/`react-native-safe-area-context` peer deps) via
  `npx expo install` (version-matched to the Expo SDK).
- `app/app.json`: added `"scheme": "xpense"` (for a future standalone build; Expo Go testing uses
  its own `exp://` scheme automatically, computed by `AuthSession.makeRedirectUri()`).
- `app/src/api/client.ts` (new, matches BUILD_PLAN §3's intended layout): `getLinkedAccounts()`,
  `buildAuthUrl()`. Base URL from `EXPO_PUBLIC_API_BASE_URL` (Expo's native env-var convention,
  loaded from `app/.env` -- git-ignored since the ngrok URL changes per tunnel session;
  `app/.env.example` documents the placeholder). `CURRENT_USER_ID = 1` hardcoded -- no login
  screen exists yet, matches how the backend has been exercised throughout.
- `app/src/screens/ConnectEmail.tsx` (new): two buttons (Gmail/Outlook), each opens
  `WebBrowser.openAuthSessionAsync(authUrl, redirectUri)`; on `type: "success"` refetches linked
  accounts; shows "Connected as <email>" or "Not connected" per provider from the live API.
- `App.tsx`: now a `NavigationContainer` + native-stack with `ConnectEmail` as the (only, for now)
  screen -- ready for Phase 9 to add `Transactions`/`Summary` routes without restructuring.

**Tested:** `npm test` -> 5 passed (`App.test.tsx` updated to mock the fetch `ConnectEmail` now
makes on mount, clearing an `act()` warning it triggered otherwise; new `ConnectEmail.test.tsx`
covers all three BUILD_PLAN requirements: both provider buttons render, tapping one calls the
mocked `openAuthSessionAsync` with a URL containing `/auth/google` and the mocked redirect URI,
and linked-account state renders correctly both on initial load and after a successful auth
session). Metro bundle verified clean (`curl` the dev-server bundle endpoint directly -- 1028
modules, no errors) since there's no simulator on this machine to actually launch the app in.

**Manual steps for the human (Phase 8's DoD explicitly requires a real-device check):** ~~done~~
-- verified on the human's actual phone via Expo Go: tapped "Connect Outlook", signed in, the
in-app browser closed automatically (no manual backing out), and the ConnectEmail screen updated
to "Connected as <their real Outlook email>". Confirms the full loop works end-to-end: deep-link
auto-close via `openAuthSessionAsync`, the backend's `return_to` redirect, and the app's refetch-
on-success all functioning together on a real device.

## Bug found during the human's real device test: Expo SDK too new for their Expo Go build

Scanning the QR code failed with "requires a newer version of Expo Go" -- the project was on
Expo SDK 57.0.8 (whatever `create-expo-app` installed at Phase 0), but the human's installed
Expo Go app only supports up to SDK 54 (confirmed by checking Expo Go's own Profile tab, since
App Store Expo Go releases can lag behind brand-new SDK npm releases).

**Fixed by downgrading the whole app to SDK 54**, using Expo's own tooling rather than hand-
picking versions (`npx expo install expo@54` then `npx expo install --fix`/targeted
`expo install <pkg>` for stragglers, `npm dedupe`, verified with `npx expo-doctor` until
17/17 checks passed). Two rounds of manual package.json cleanup were needed because
`expo install` kept writing the corrected SDK-54 versions into `dependencies` while leaving the
stale SDK-57 versions behind in `devDependencies` (`@types/react`, `jest-expo`,
`react-test-renderer`, `typescript`) -- ended up with duplicate keys each time, moved the correct
versions to the right section and removed the duplicates by hand.

Final versions: `expo` 54, `react` 19.1.0, `react-native` 0.81.5 (down from `expo` 57.0.8,
`react` 19.2.3, `react-native` 0.86.0). `app/CLAUDE.md` was auto-generated by `create-expo-app`
telling future sessions to read the SDK's versioned docs before writing code -- worth remembering
this project is now pinned to SDK 54 docs, not whatever's newest.

**Verified:** `npx expo-doctor` -> 17/17 passed. `npm test` -> 5 passed (all Phase 8 tests
unaffected). Fresh `npx expo start --clear` (killed a stale leftover process first to make sure
this wasn't testing a cached bundle) + forced a real Metro bundle via curl -> 982 modules, no
errors. Human confirmed on their phone: SDK 54 loads in Expo Go, and the full Connect Outlook
flow (browser auto-close + status update) works end-to-end. Phase 8's real-device DoD is met.

## Phase 9 -- App: Transactions + categorize + summary

**Chart library deviation from BUILD_PLAN (confirmed with the human first):** BUILD_PLAN names
`victory-native`, but its current major version requires `@shopify/react-native-skia` (a native
module needing a custom dev build) -- uncertain whether Expo Go SDK 54 bundles it, and getting it
wrong would mean another crash-on-device round trip like the SDK 57 issue. Used
`react-native-chart-kit` instead (built on `react-native-svg`, no native build required, works in
plain Expo Go) -- the human's explicit choice over the alternatives (try victory-native anyway,
or skip the chart).

**Backend:** none needed -- Phase 2's `GET /transactions`, `POST /transactions/{id}/category`,
and `GET /summary` already cover everything Phase 9 requires.

**App:**
- `src/api/client.ts` extended: `getTransactions()`, `updateTransactionCategory()`, `getSummary()`
  (+ `Transaction`/`CategorySummary`/`Summary` types matching the backend schemas).
- `src/constants/categories.ts` (new): a hardcoded category list (Food, Groceries, Transport,
  Shopping, Bills, Entertainment, Health, Other) for the category picker -- BUILD_PLAN's
  `categories` DB table has no CRUD endpoint built in any phase, so a fixed list is the minimal
  choice rather than building unrequested backend scope.
- `src/screens/Transactions.tsx` (new): `FlatList` with pull-to-refresh, each row tappable to
  open a bottom-sheet `Modal` category picker; selecting a category calls
  `updateTransactionCategory` and updates the row in place from the response (no full refetch).
- `src/screens/Summary.tsx` (new): per-category totals list plus a `react-native-chart-kit`
  `BarChart`; pull-to-refresh; empty state when there are no expenses this month.
- `App.tsx`: switched from a bare native-stack (Phase 8, single screen) to a bottom-tab navigator
  (`@react-navigation/bottom-tabs`) with three tabs -- Transactions, Summary, Connect Email --
  using `@expo/vector-icons` for tab icons.
- Had to explicitly install `@expo/vector-icons`, `expo-font`, and `expo-asset` as direct
  dependencies -- they're transitively required by the icon rendering path but aren't hoisted to
  root `node_modules`, so Jest (and Metro) couldn't resolve them until added directly.

**Tested:** `npm test` -> 9 passed across 4 suites. New `Transactions.test.tsx` (mocked list
renders both merchant names and amounts; tapping a row then a category calls
`updateTransactionCategory(id, category)` with the right arguments and the row's displayed
category updates, no more "Uncategorized"). New `Summary.test.tsx` (category totals render from
mocked API data; empty-state text renders when there are no categories). `App.test.tsx` updated
for the new default tab (Transactions, not ConnectEmail) and mocks all three screens' network
calls. `npx expo-doctor` -> 17/17 passed after each new dependency. Verified a completely fresh
Metro bundle (on an isolated port, so as not to disturb the human's own already-running `expo
start` session from the Phase 8 test) -- 1201 modules, no errors.

**Manual steps for the human (Phase 9's DoD explicitly requires a real end-to-end check):**
1. Since several native modules (bottom-tabs, chart-kit, vector-icons, expo-font/expo-asset) were
   installed *after* your currently-running `expo start` session started, **fully restart it**
   (stop it, `npx expo start` again) rather than just reloading the app in Expo Go -- Metro may
   not have these in its dependency graph otherwise.
2. You already have 5 real DBS transactions synced from earlier phases (Sheng Siong, Shopee,
   Bus/MRT, Saizeriya, Shaw Theatres) -- the Transactions tab should show them immediately without
   needing a fresh sync. Confirm they appear, tap one, categorize it, and confirm the category
   sticks (and shows correctly) after a pull-to-refresh.
3. Switch to the Summary tab and confirm the bar chart renders (this is the one part that
   genuinely needs your phone -- I can't verify a native chart actually paints correctly from
   here) and that categorizing a transaction on the Transactions tab is reflected in Summary's
   totals after a refresh.

## Post-Phase-9: automatic transaction categorization (hardcoded rules + AI fallback)

The human noticed all 5 real synced transactions showed as "Uncategorized" and asked why --
Phase 9's category was purely manual (tap -> picker). They asked for automatic categorization: a
hybrid of hardcoded keyword rules (instant, free -- e.g. "BUS/MRT" is obviously Transport) plus an
AI fallback for merchant names needing real-world knowledge (e.g. "SAIZERIYA - POIZ CENTRE" needs
to be known as a restaurant chain). Also asked for the transaction list to show time (not just
date), and for Food specifically to have a time-derived subcategory (Lunch/Dinner/Drinks/Snacks).
Confirmed with the human: AI fallback model is **Claude Haiku 4.5**, and they'll add the real
Anthropic key themselves once told the variable name -- same graceful-degradation pattern as the
Google/Microsoft OAuth credentials.

**Backend:**
- New `transactions.subcategory` column (nullable `String`), migration `33e100332d0c`.
- New `app/services/categorize.py`: `hardcoded_category()` (ordered regex rules per category --
  Transport covers BUS/MRT, Grab, Gojek, Cabcharge, ComfortDelGro, EZ-Link, transit; similar rule
  sets for Groceries, Shopping, Entertainment, Bills, Health), `food_subcategory()` (buckets the
  `Asia/Singapore` local hour of `txn_at`: 11:00-14:59 Lunch, 15:00-17:59 Snacks, 18:00-21:59
  Dinner, else Drinks), `ai_category()` (Claude Haiku 4.5 via the official `anthropic` SDK,
  `client.messages.parse()` with a Pydantic `Literal`-constrained output so the model can't return
  an invalid category; reads the key from `LLM_API_KEY`, returns `None` -- never raises -- when
  unset or on any API failure, so it's a pure enrichment step that can never block a sync), and
  `categorize_transaction()` (tries hardcoded first, only calls the AI when that misses, adds the
  food subcategory when the resolved category is Food).
- `services/sync.py`: after parsing, if the parser didn't set a category (true for every real bank
  format so far), calls `categorize_transaction()` before saving -- every future transaction
  auto-categorizes on sync, no manual tap needed. Phase 9's tap-to-recategorize still works as a
  manual override.
- New `POST /transactions/categorize-pending?user_id=` backfills existing `category IS NULL` rows
  for a user, and separately backfills `subcategory` for any row that's already `category=Food`
  but predates this feature (so the human's earlier Phase-9-era Food transactions get a
  subcategory too, not just newly-synced ones).
- `schemas.py` / `client.ts`: `subcategory` added to `TransactionOut` / the `Transaction` type.

**App:** `Transactions.tsx` -- `formatDateTime()` shows date + time (e.g. "23 Jul, 6:00 PM")
instead of date only; the row's meta line now reads `Food (Dinner)` style when a subcategory is
present, or falls back to `category` alone / "Uncategorized".

**Tested:** `pytest` in `backend/` -> 67 passed (new `tests/test_categorize.py`: hardcoded matches
for real merchant strings including Grab/Gojek/Cabcharge, confirms `SAIZERIYA - POIZ CENTRE` is
*not* hardcoded-matched -- proving the AI step is actually needed for it --, parametrized
`food_subcategory` time buckets, `ai_category` gracefully returns `None` with no key configured
and on a mocked API failure, a mocked-Anthropic-response success path, and the
hardcoded-before-AI precedence; `test_sync.py` extended with a sync-time auto-categorization case;
`test_transactions.py` extended with the backfill endpoint, including the stale-Food-subcategory
case). `npm test` in `app/` -> 10 passed across 4 suites (new case asserting the row shows both
the transaction time and a `Category (Subcategory)` combination).

**Live-verified against the real dev Postgres:** ran the migration, then called
`POST /transactions/categorize-pending?user_id=1` for real. Of the human's real transactions, 9
resolved immediately via hardcoded rules alone (Sheng Siong -> Groceries, Shopee -> Shopping,
2x Bus/MRT -> Transport, Shaw Theatres -> Entertainment, Gojek/Gopay-Gojek/Cabcharge/Grab ->
Transport) with zero API calls or cost. 2 stayed Uncategorized as expected (`SAIZERIYA - POIZ
CENTRE`, `McDonalds 930151`) since no `LLM_API_KEY` is configured yet -- exactly the human's own
example of a case needing AI. One row (`A/C ending 9249`) isn't a real merchant name (an own-funds
transfer description) and will likely never resolve either way, which is expected.

**Manual step for the human:** to enable the AI fallback for merchants like Saizeriya and
McDonald's, add your Anthropic API key to `backend/.env` as `LLM_API_KEY=sk-ant-...`, restart the
backend, then call `POST /transactions/categorize-pending?user_id=1` again (or just wait -- every
future sync auto-categorizes new transactions the same way). No code changes needed. Also please
reload the app (Fast Refresh should pick up the `Transactions.tsx` change automatically) and
confirm on your phone that transaction rows now show the time and that Food rows show a
Lunch/Dinner/Drinks/Snacks subcategory.

## Full UI redesign ("Spendly")

The human supplied a complete design handoff (`design_handoff_expense_tracker/`) -- an HTML
prototype (`Spendly.dc.html`, option `1a`) plus a detailed spec README -- and asked for the whole
app UI to be rebuilt to match it: a new 4-tab shell (Home, Summary, Activity, Settings), two
pushed full-screen flows (Quick Sort, Circle), two bottom sheets (Categorise, Add transaction),
and a from-scratch design-token system (the app previously had zero shared theme -- every screen
hardcoded its own hex colors).

**Scope decisions confirmed with the human up front:** Budget and savings-goal are real,
backend-persisted data (not mocked). Circle (friends) is built fully with mocked/static data, per
the design doc's own framing of it as a later-phase feature "shown in full." Settings' "where
transactions come from" list shows only real linked email accounts -- the design's fake SMS/phone
row was dropped since the backend has no SMS ingestion. Everything was built in one pass.

**Deliberate deviations from the literal design spec** (documented so they aren't mistaken for
bugs): kept the real 8-category taxonomy (`Food, Groceries, Transport, Shopping, Bills,
Entertainment, Health, Other`) instead of the design's fictional 5, with 8 hues assigned (4 new:
Shopping 300, Bills 190, Health 350, Other 80). Food subcategories stay `Lunch/Snacks/Dinner/
Drinks` (the human's own spec from the categorization feature) rather than the design's fictional
`Lunch/Dinner/Coffee/Takeaway`. Only Food has a subcategory step/breakdown anywhere in the UI --
the other 7 categories have no subcategory data server-side, so their categorise flow ends after
step 1 and their Summary row has no expand chevron. Quick Sort's "reason" hint is one static
sentence rather than fabricated per-merchant text, since the backend doesn't compute or store a
reason. Settings gained two rows the design didn't spec (Monthly budget, Savings goal edit panels,
styled like the design's existing Edit Name panel) since real backend data needs to be editable
somehow. "Week" = trailing 7 days; "Month" reuses `GET /summary`'s existing current-calendar-month
total directly, so Home's month figure and Summary's donut total are provably the same number.

**Backend:**
- New tables: `Budget` (`user_id` unique, `monthly_target`), `SavingsGoal` (`user_id` unique,
  `name`, `target_amount`, `saved_amount`); new `users.name` column. Migration `baab750f38e8`.
- New routers: `routers/budget.py` (`GET`/`PATCH /budget`, get-or-create with a `S$2,000/month`
  default), `routers/goals.py` (`GET`/`PATCH /goal`, get-or-create default `"Savings goal"` /
  `S$1,000` target / `S$0` saved), `routers/users.py` (`GET`/`PATCH /user` for the display name).
- `CategoryUpdateIn` and `TransactionCreateIn` extended with an optional `subcategory` field, so
  the app can explicitly set (or clear) a Food subcategory instead of only ever getting the
  auto time-derived guess.
- `routers/auth.py`'s Google/Microsoft OAuth callbacks now opportunistically set `User.name` from
  the provider profile (`name` / `displayName`) the first time an account links, if not already
  set -- no new API calls, that data is already fetched during the existing token exchange.

**App:** full rewrite. New `src/theme/` (`oklch.ts` -- a from-scratch OKLab->sRGB converter using
Björn Ottosson's public-domain matrices, since React Native has no `oklch()` support and every
design color is specified that way; `tokens.ts` -- colors/typography/spacing/radii/shadows).
New `src/components/` (`Toast`+`ToastProvider`, `BottomSheet`, `Donut` -- hand-drawn SVG arc
paths, `CategoryChip`, `ProgressBar`). New `src/utils/derive.ts` (pure functions: `formatMoney`,
`deriveSource`, `groupByDay`, `categoryTotals`, `topCategories`, `subcategoryTotals`,
`calendarDailyTotals`, `today/weekSpend`, etc. -- all operating on the already-fetched transaction
list, no new endpoints needed for day-grouping, the calendar heatmap, or "needs a category"
filtering). New `src/store/TransactionsProvider.tsx` -- a plain React Context fetching
transactions/summary/budget/goal/user once at the root and exposing mutation actions to every
screen, which is what makes Home's month figure and Summary's donut total provably the same
number instead of two independently-fetched values that can drift.

Navigation rewritten: root `native-stack` (the dependency existed but was unused) holding
`MainTabs` (`bottom-tabs`, a fully custom `TabBar` component with hand-drawn SVG icons and an
`expo-blur` frosted background rather than fighting React Navigation's default theming) plus
`QuickSort` and `Circle` as pushed transparent-modal screens. `App.tsx` now gates rendering on
`useFonts()` for the three required Google Fonts (DM Sans, Instrument Serif, JetBrains Mono).

Screens: `Home.tsx` (new -- greeting, budget card with Today/Week/Month segmented control,
needs-a-category card, SVG savings-goal ring, top-4-categories list), `Summary.tsx` (rewritten --
SVG donut + expandable category rows in chart view, a computed weekday-start heatmap grid + day
detail card in calendar view), `Activity.tsx` (renamed from `Transactions.tsx` -- day-grouped
list, filter pills, Quick Sort banner, empty state, `+` add button) plus `CategorizeSheet.tsx` and
`AddTransactionSheet.tsx`, `Settings.tsx` (new, replaces the standalone `ConnectEmail` tab --
profile edit, real linked-email rows with a "Change" action that re-runs the OAuth flow,
preference toggles, the new Budget/Goal edit rows, Circle entry card), `QuickSort.tsx` (new --
card-stack flow over the real uncategorized queue), `Circle.tsx` (new -- fully mocked friend data,
local-only nudge state).

New dependencies: `@expo-google-fonts/dm-sans`, `@expo-google-fonts/instrument-serif`,
`@expo-google-fonts/jetbrains-mono`, `expo-blur`. Removed `react-native-chart-kit` (the donut and
goal ring are hand-drawn SVG now, no charting library needed).

**Tested:** `pytest` in `backend/` -> 81 passed (new `test_budget.py`, `test_goals.py`,
`test_users.py`; extended `test_transactions.py` for subcategory pass-through and
`test_auth.py`/`test_ms_auth.py` for the OAuth name-capture behavior, including the
does-not-overwrite-an-existing-name case). `npm test` in `app/` -> 28 passed across 7 suites
(new `Home.test.tsx`, `Summary.test.tsx`, `Activity.test.tsx`, `Settings.test.tsx`,
`QuickSort.test.tsx`, `Circle.test.tsx`, `App.test.tsx`, plus a shared `src/testUtils.tsx` mock
helper) -- covering the month/today spend split, the needs-a-category card and Quick-Sort
hand-off, donut<->category-row selection sync, the July-2026-starts-Wednesday calendar offset
computed (not hardcoded), the one-step-for-non-Food/two-step-for-Food categorise flow in both the
Activity sheet and Quick Sort, Settings' edit panels actually calling the budget/goal/name APIs,
and Circle's nudge being confirmed local-only state. `npx tsc --noEmit` clean across all source
files (pre-existing `@types/jest`-related noise in test files only, unrelated to this change).

**Live-verified against the real dev Postgres:** `GET /budget?user_id=1` and `GET /goal?user_id=1`
both correctly get-or-created their defaults (`S$2,000.00`/month; `"Savings goal"`, `S$0.00` of
`S$1,000.00`) on first call.

**Manual steps for the human:** this touches fonts, navigation structure, and new native
dependencies (`expo-blur`, three font packages), so a full `npx expo start --clear` restart and a
fresh Expo Go scan is needed -- Metro won't have these in its dependency graph from a
still-running session. Please walk all 4 tabs, both bottom sheets, Quick Sort, and Circle on your
phone -- this is the one part I can't verify from here (native frosted-glass tab bar, the
hand-drawn SVG donut/ring actually painting correctly, real device safe-area insets). Your
existing real transaction data flows straight into the new Home/Summary/Activity screens
unchanged. Budget starts at S$2,000/month and the goal starts at "Savings goal" S$0/S$1,000 --
both editable immediately from the new Settings screen's "Budget & goals" section.

## Redesign follow-ups: period-aware Home, Summary donut drilldown, browsable week/month/year

Two rounds of feedback on the redesign, both app-only (no backend changes):

**Round 1 -- Home's "Where it went" was period-blind; Summary's donut only expanded for Food.**
`Home.tsx`'s "Where it went" top-categories list always used the full all-time transaction list
regardless of the Today/Week/Month segmented control above it -- now it derives from the same
period (`todayRangeTransactions`/`weekRangeTransactions`/`currentMonthTransactions`, new
`todayRangeTransactions` added to `derive.ts`). Every Summary category row is now expandable (the
chevron used to be hidden unless the category had subcategory data, which only Food has) and
reveals the actual transactions behind that slice via a new `categoryTransactions` derive
function; Food additionally still shows its Lunch/Snacks/Dinner/Drinks bars above the list.

**Round 2 -- Summary couldn't browse to a different week/month/year, the calendar was locked to
the current month, and the calendar grid was silently dropping Saturdays.** The Saturday bug was
a real React Native flexbox pitfall: the day grid was one flat `flexWrap` row of cells styled
`width: '${100/7}%'` -- `100/7` is a repeating decimal, so the summed percentage width across 7
siblings rounds fractionally over 100% of the row's pixel width, pushing the 7th cell (Saturday,
since the grid starts Sunday) onto the next line every time. Fixed by chunking the month into
explicit rows of exactly 7 `flex: 1` cells (new `calendarWeeks` helper in `derive.ts`) instead of
one wrapping container -- Yoga always divides `flex: 1` siblings evenly, no rounding drift
possible. Added two independent navigable "anchor" dates: `viewAnchor` for the chart view (paged
±7 days/±1 month/±1 year to match whichever of Week/Month/Year is selected; tapping a period pill
resets it to today, including tapping the already-active pill as a free jump-to-now), and
`calendarAnchor` for the calendar view (paged ±1 month, independent of the chart's period, resets
`selectedDay` to 1 on every page since the previously-selected day may not exist in the new
month). Browsable weeks needed a real Sun-Sat calendar week rather than Home's rolling
trailing-7-days window, so a `startOfWeek`/`endOfWeek`/`calendarWeekTransactions` trio was added
rather than reusing `weekRangeTransactions`. Also fixed a real correctness bug this surfaced: the
donut/category-rows total used to read `summary.total` (the server's always-current-month figure)
any time `sumPeriod === "month"`, unconditionally -- once month-paging existed that would show a
past month's label next to the *current* month's total. Now `summary.total` is only used when the
viewed month is genuinely today's real month (`isSameMonth`); any paged historical month falls
back to the client-derived sum, exactly like week/year already did.

**Tested:** `npm test` in `app/` -> 34 passed across 7 suites (up from 28). New Summary cases:
paging the month view back a month shows that month's own total and no longer equals
`summary.total`; the week view uses the Sun-Sat boundary (a transaction the day before that
boundary is correctly excluded, proving it isn't the old rolling-window logic); paging the
calendar resets the selected day and shows the new month's data; a grid-chunking sanity check that
every day 1-31 (including all four Saturdays: 4, 11, 18, 25 for July 2026) gets a `cal-day-N`
testID. Flagged honestly in the plan and here: `react-test-renderer` doesn't compute real pixel
layout, so no jest assertion can *prove* the visual Saturday-dropping bug is fixed -- the
row-chunked-`flex:1` structure is the textbook-correct fix for this exact class of bug, but final
confirmation needs a look on-device. `npx tsc --noEmit` clean. `pytest` in `backend/` unaffected
(still 81 passed) since neither round touched the backend.

**Manual step for the human:** please re-check Summary on your phone -- confirm every calendar row
now shows a Saturday, and that the new ‹ › chevrons (next to the Week/Month/Year pills, and next
to the calendar's month name) let you browse to a past period. This is a pure JS/rendering change
(no new native dependencies), so Fast Refresh on your already-running Expo session should pick it
up without a restart.

## Merchant/timing-based default subcategories for Food and Transport

Food subcategories changed from Lunch/Snacks/Dinner/Drinks to **Breakfast, Lunch, Dinner,
Beverage, Others**, and Transport got subcategories for the first time: **Public, Private,
Others**. Both are now derived automatically (as well as pickable manually, same as before).

**Backend (`categorize.py`):** `food_subcategory(merchant, txn_at)` (now takes the merchant name,
not just the timestamp) checks the merchant against a beverage-keyword regex first
(Starbucks/coffee/cafe/tea/juice/smoothie-type chains) -> `"Beverage"` if it matches, regardless
of time. Otherwise it buckets by SGT hour: `[5,11)` Breakfast, `[11,15)` Lunch, `[18,22)` Dinner,
anything else (the old afternoon-snack/late-night gap) -> `"Others"` -- there's no longer a
time-only bucket that absorbs everything, since Beverage moved to being merchant-driven. New
`transport_subcategory(merchant)` reuses the same public-transit keywords (BUS/MRT, MRT, Transit,
ComfortDelGro, EZ-Link) -> `"Public"` and ride-hailing keywords (Grab, Gojek, Cabcharge, Tada) ->
`"Private"` that already existed as one fused category-detection regex -- split into two named
patterns so both the category rule and the new subcategory rule reuse the same keyword lists
instead of duplicating them. `categorize_transaction` now dispatches on whichever category it
resolved (via `subcategory_for`), covering both the hardcoded-rule path and the AI-fallback path.

**Backend call sites:** `sync.py` previously only derived category+subcategory when the parser
hadn't already hardcoded a category (e.g. SimplyGo transit emails hardcode `category="Transport"`
directly) -- those rows were silently left with no subcategory. Added a branch: if the category is
already set but the subcategory isn't, still derive the subcategory. `categorize-pending`'s legacy
backfill block (for rows categorized before this feature existed) now also backfills Transport
rows, not just Food ones.

**Frontend:** the three places that gate a subcategory chip step on `category === "Food"`
(`QuickSort.tsx`, `CategorizeSheet.tsx`, `AddTransactionSheet.tsx`) now use a new
`subcategoriesFor(category)` helper in `theme/tokens.ts` that returns the right chip list for Food
or Transport (or `null` for everything else, meaning no subcategory step) -- so picking Transport
manually now also prompts for Public/Private/Others, the same two-step flow Food already had.
Summary's expandable category rows show a subcategory bar breakdown for Transport now too, not
just Food.

**Tested:** `pytest` in `backend/` -> 93 passed (up from 81). New `test_categorize.py` cases:
beverage merchants return "Beverage" across all time-of-day parametrizations; non-beverage
merchants hit each of the four time buckets; `transport_subcategory` across Public/Private/Others;
existing `categorize_transaction`/`sync`/`categorize-pending` tests updated for the new subcategory
values, plus a new Transport-backfill case in `categorize-pending`'s test. `npm test` in `app/` ->
36 passed (up from 34): QuickSort and Activity each gained a "picking Transport shows a
subcategory step" case (the two existing tests that used Transport as their "no subcategory step
needed" example were switched to Shopping, which genuinely has none); Summary's Transport-row
expansion test now also asserts the Public/Private subcategory bars render. `npx tsc --noEmit`
clean.

**Manual step for the human:** none required -- pure derivation-logic + UI-gating change, no new
env vars or credentials. Worth eyeballing Quick Sort and the categorize sheet on your phone to
confirm the new Food (Breakfast/Lunch/Dinner/Beverage/Others) and Transport (Public/Private/Others)
chip sets look right, and that picking Transport now asks a follow-up question the way Food always
did.

## Needs-a-category badge, account unlink, manage categories

Three more small feature requests, one visual, two new capabilities:

**Activity's "Needs a category" count is now a distinct circular badge** instead of plain inline
text concatenated into the pill label (`Activity.tsx`) -- reuses the exact same badge recipe
already used for the same number two elements below it (the Quick Sort banner) and on Home's
"Need a category" card, just sized to fit inside the pill.

**Settings -- linked accounts can now be unlinked.** Added `DELETE /email-accounts/{id}` (ownership
-checked via `user_id`), a `deleteEmailAccount` client call, and a `removeAccount` store action.
Unlinking only deletes the `EmailAccount` credential row -- there's no FK from `Transaction` to it,
so previously-synced transactions are untouched and stay in history, per your call. The new
"Remove" link sits next to "Change" and requires confirming a native `Alert.alert` dialog first
("Unlink {email}? Your past transactions from this account will stay.") since it's a destructive-
feeling action, even though the underlying data loss is limited to the connection itself.

**Manage categories -- users can now add and remove custom categories and subcategories.** New
backend: a `Subcategory` table (migration `6ad3a1dff90c`, chained after the existing head) plus a
new `/categories` router reusing the previously-unused `Category` table for custom top-level
categories. The backend only stores *custom* entries -- built-in categories/subcategories
(`Food`, `Transport`, etc. and their default subcategory lists) still live entirely in
`theme/tokens.ts` on the frontend, which merges the two together everywhere a category/subcategory
list is shown. This also meant custom categories needed a color with no backend column for it:
`categoryColor`/`categoryColorChip`/`categoryColorBar` now take a plain `string` and fall back to a
deterministic hash-based hue for any id that isn't one of the 8 built-ins, so a custom category
gets a stable color for free. `QuickSort`, `CategorizeSheet`, and `AddTransactionSheet` all switched
from the static `CATEGORIES` array to a merged built-in-plus-custom list, and their "does this
category have subcategories" checks now account for custom subcategories too (so e.g. a custom
category with only custom subcategories still gets the two-step picker flow). A new full-screen
`ManageCategories.tsx` (reached from a new Settings row, styled like the existing Circle entry)
lists every category with its subcategories as chips, an "Add category" input at the top and an
"Add subcategory" input per category card, and a remove affordance on every custom entry (built-ins
have none, matching your call that they should stay fixed).

**Tested:** `pytest` in `backend/` -> 109 passed (up from 93): 5 new tests for unlink (deletes the
account but leaves transactions queryable, 404s for another user's account or an unknown id) and 13
new tests for `/categories`/`/subcategories` (create/list/delete, blank-name and duplicate-name and
built-in-collision rejection, ownership scoping). `npm test` in `app/` -> 44 passed (up from 36): a
new `ManageCategories.test.tsx` (6 tests covering built-ins having no remove affordance, add/remove
for both categories and subcategories), an updated Activity test asserting the badge renders as
its own element with the right text content, an updated Settings test covering the full unlink
confirm-then-remove flow (mocking `Alert.alert` to auto-press "Unlink"), and a new Settings test for
the `manage-categories-entry` navigation. `npx tsc --noEmit` clean.

**Manual step for the human:** run `alembic upgrade head` against your dev Postgres before trying
Manage Categories (verified the new migration's revision chain resolves cleanly via `alembic
history`, but it hasn't been applied to a real database by me). Everything else is proactive/no
credentials needed -- worth a look on your phone at the new circular badge, the Remove link's
confirm dialog, and the Manage Categories screen's add/remove flows.

## Reconcile generic "GRAB" bank alerts against Grab receipt emails

DBS/UOB card alerts only ever say `"GRAB"` for any Grab charge -- the bank has no idea whether it
was a ride, a GrabFood order, a GrabMart delivery, etc. -- so every Grab charge was hardcoded to
`Transport`/`Private`, which is why a real GrabFood order (5/12) got misfiled as a ride.

**New `backend/app/services/grab_reconcile.py`:** `is_generic_grab_merchant(merchant)` only fires
for the bank's bare `"GRAB"` string (not an already-specific merchant). `parse_grab_receipt(text)`
is a pure function that reads a Grab receipt email body, extracts the stated `Total` amount
(specifically the total, not a line-item price -- receipts list item/delivery-fee amounts before
the total), and sniffs for `GrabFood`/`GrabMart`/`GrabExpress` keywords -> `Food`/`Groceries`/
`Other` respectively; a ride receipt has none of those keywords and returns `None`, meaning "no
override, keep the Transport/Private default."
`reconcile_grab_transaction(mail_service, access_token, merchant, amount, txn_at)` searches
`from:no-reply@grab.com subject:receipt` in the *same* mailbox (no new OAuth scope or second
consent needed -- both providers' existing scopes are already inbox-wide, not sender-restricted),
verifies the sender, and only accepts a match whose receipt **amount exactly equals** the bank
alert's amount -- the strongest correlation signal available, since DBS/UOB don't expose a shared
order ID. Wrapped in a blanket `try/except` returning `None` on any failure (mirroring
`ai_category`'s "never block a sync" philosophy), so a network hiccup or a not-yet-delivered
receipt can't break transaction ingestion.

**Wired into two places:** `sync.py`'s per-message loop tries reconciliation first for any
newly-parsed generic-Grab charge, falling back to the existing hardcoded classification only if no
matching receipt is found. `POST /transactions/categorize-pending` also got a third backfill pass
that re-checks *already-stored* `Transport` rows with a generic Grab merchant against the same
reconciliation logic -- this is what actually fixes previously-misfiled rows like the 5/12
transaction, and is safe to re-run (a correctly-reconciled row naturally leaves the `Transport`
filter on the next call). Promoted `sync.py`'s `_get_valid_access_token`/`_MAIL_SERVICES` to public
(`get_valid_access_token`/`MAIL_SERVICES`) since the backfill endpoint now needs them too, to reuse
a linked account's token without a second OAuth flow.

**Tested:** `pytest` in `backend/` -> 127 passed (up from 109). New `test_grab_reconcile.py` (15
tests) covers the pure `parse_grab_receipt`/`is_generic_grab_merchant` logic plus
`reconcile_grab_transaction` against a fake mail service (matches by amount, ignores non-Grab
senders, returns `None` for a ride or an amount mismatch, never raises on a mail-service failure).
Two new fixture files (`grab_food_receipt.txt`, `grab_ride_receipt.txt`) plus two new `test_sync.py`
cases (a GrabFood receipt reclassifies a "GRAB" DBS alert to `Food`; no matching receipt falls back
to `Transport`/`Private`) and one new `test_transactions.py` case reproducing the real scenario --
an existing `Transport`/`GRAB` row flips to `Food` once `categorize-pending` finds a matching
receipt.

**Real-world testing against the live dev server caught and fixed a genuine bug:** running the
reconciliation against your actual linked Outlook account, Microsoft Graph's `$search` (used by
`list_bank_messages`) turned out to be unreliable for structured `from:`/`subject:` matching on
this account -- it returned completely unrelated inbox mail (marketing, job alerts, a phishing
email) instead of Grab receipts, even though the request succeeded with `200`. Confirmed by testing
directly against the Graph API that `$filter=from/emailAddress/address eq 'no-reply@grab.com'` is
reliable where `$search` wasn't. Added a new shared-interface function,
`list_messages_from_sender(access_token, sender_email)`, to both `gmail.py` (reuses the existing
`from:`/`newer_than:` query, which needed no fix) and `graph.py` (uses `$filter` instead of
`$search`), and switched `grab_reconcile.py` to call that instead of reusing `list_bank_messages`
for this lookup. All tests updated to mock the new function; 127 passed.

**Two more real bugs found and fixed after you shared a screenshot of the actual "Your Grab
E-Receipt" email:**

1. **The search was scanning the wrong 50 emails.** The account has 1898 total emails from
   `no-reply@grab.com` (8 years of Grab marketing mail); my first `$filter`-only fix (no
   `$orderby`, since combining the two triggered Graph's "InefficientFilter" error) returned an
   *unordered* batch of 50, which happened to all be 2018-2020 mail -- nowhere near the actual
   2026 receipt. Fixed by filtering + sorting on `receivedDateTime` instead (a native, indexed
   property that *does* support `$filter` + `$orderby` together) within a window centered on the
   transaction's own timestamp, then matching the sender client-side. Also updated Gmail's version
   of `list_messages_from_sender` to center on the transaction time the same way (via `after:`/
   `before:` Unix timestamps) rather than "newer than N days before whenever this happens to run"
   -- more robust for both a live sync and a backfill of an older row.
2. **The amount regex matched the wrong number.** Your receipt's body (once HTML-stripped) reads
   `"...Subtotal SGD 6.40 PICKUP20- SGD 1.28 TOTAL (INCL. TAX) SGD 5.12..."` -- the old
   `Total\s+...` regex wasn't word-boundary-anchored, so it matched inside **Sub**`total` and
   grabbed 6.40 instead of the real 5.12. Also found the receipt's *own* summary line reads
   `"TOTALSGD 5.12"` with zero whitespace between the two (an HTML-stripping artifact). Fixed with
   `\bTOTAL\b(?:\s*\([^)]*\))?\s*(?:S\$|SGD)\s*(...)`, which won't match "Subtotal", tolerates the
   optional "(INCL. TAX)" wording and the no-space case, and takes the *last* such match in the
   body if there are several restating the same figure.

With both fixes, `reconcile_grab_transaction` now correctly finds your real "Your Grab E-Receipt"
email and returns `("Food", "Others")` for the 5.12 transaction -- "Others" because it was a 1:16
AM order (SGT), outside the Breakfast/Lunch/Dinner windows, which is the correct existing
`food_subcategory` bucket for that hour, not a bug. Added a new `test_parse_grab_receipt_handles_a
_real_receipt_ignoring_the_subtotal` regression test using your receipt's actual (anonymized-free,
it's already just your own data) body text. 128 tests passing.

**Manual step for the human:** none required for the feature itself. I re-ran
`POST /transactions/categorize-pending?user_id=1` against your dev server with both fixes in place
-- see below for the actual result on your real transaction.

## Use the Grab receipt's real merchant name, and a curated beverage-brand list

Two follow-ups on the "Others" result above, both driven by the actual receipt screenshot you
shared:

1. **Merchant name now comes from the receipt.** `reconcile_grab_transaction` extracts the
   `"Order from:"` line from the receipt body (e.g. `"CHAGEE - Tampines West Community Club"`,
   bounded by the next known receipt-template label since HTML-stripping runs it straight into the
   next field with no separator) and now returns a 3-tuple `(category, subcategory, merchant)`
   instead of 2. Both call sites (`sync.py` for new transactions, `categorize-pending`'s backfill
   pass for existing rows) now overwrite `merchant_raw`/`merchant_clean` with that real name when
   present, instead of leaving the bank's generic `"GRAB"` string in place. Crucially, subcategory
   is now derived from *that* real name via `food_subcategory`, not the generic one -- this is
   what actually lets beverage-brand detection engage for Grab-mediated orders.
2. **Curated beverage-brand list.** Researched (via web search, not guessed) current Singapore
   bubble-tea/milk-tea chains and added ~20 to `_BEVERAGE_PATTERN` in `categorize.py`: Chagee,
   Mixue, HEYTEA, ChaPanda, Naixue (+ its pre-rebrand name Nayuki), Molly Tea, Tiger Sugar,
   PlayMade, Sharetea, Chicha San Chen, Xing Fu Tang, Kung Fu Tea, Kebuke, Bober Tea, TP Tea, Ten
   Ren('s) Tea, R&B Tea, Each-A-Cup, Whale Tea, Yocha, Bobii Frutii. Deliberately left out a
   several researched names that are too generic/collision-prone for plain substring matching
   (e.g. "The Alley" alone, "Winnie's", "Tea Tree" -- collides with the skincare product line) --
   short/ambiguous names get the same `\b`-word-boundary treatment the existing "KOI" entry
   already used, so e.g. "TP TEA" won't match inside an unrelated string, and added a regression
   test (`test_food_subcategory_koi_word_boundary_does_not_match_unrelated_merchant`) proving KOI's
   guard still holds.

**Tested:** `pytest` in `backend/` -> 151 passed (up from 128). New/updated cases: `parse_grab_receipt`
now asserts the extracted merchant on both a synthetic and the real CHAGEE receipt text; a new
`reconcile_grab_transaction` case proves the real receipt now resolves to `("Food", "Beverage",
"CHAGEE - Tampines West Community Club")`; `test_categorize.py` gained 21 new beverage-brand
parametrized cases plus the KOI word-boundary regression; `test_sync.py`/`test_transactions.py`
updated to assert `merchant_raw`/`merchant_clean` actually change after reconciliation.

**Manual step for the human:** I re-ran the fix against your real transaction directly (see below)
since it had already flipped to `Food` in the previous round, so `categorize-pending`'s backfill
pass -- which only re-scans rows still sitting at `Transport` -- wouldn't touch it again on its
own.

## Activity row layout fix + delete transaction

1. **Long merchant names no longer push the amount off-screen.** The Activity row's merchant
   `Text` was `numberOfLines={1}` with no `flexShrink` set anywhere in the row, which let a long
   merchant string grow past its allotted width and shove the amount column out of frame instead
   of truncating in place -- a known React Native flexbox gotcha (unlike web CSS, a `flex:1` child
   doesn't reliably shrink below its content's intrinsic width without an explicit `flexShrink`).
   Changed `numberOfLines` to `2` (so a long name wraps to a second line instead of truncating with
   an ellipsis) and added `flexShrink: 1` to both the merchant column and the `Text` itself, plus
   `flexShrink: 0` on the amount column so it always keeps its natural width and stays visible.
2. **Delete transaction.** Added `DELETE /transactions/{id}?user_id=` (`backend/app/routers/
   transactions.py`), scoped to the owning user (404 otherwise) and hard-deleting the row --
   mirrors the existing `delete_category`/`unlink_email_account` pattern. Wired up
   `deleteTransaction` (`app/src/api/client.ts`) and a `removeTransaction` action on
   `TransactionsProvider` that also refreshes the summary. The entry point is a "Delete
   transaction" link at the bottom of the existing tap-to-categorise `CategorizeSheet`, guarded by
   a native `Alert.alert` confirmation (same pattern as the Settings "unlink account" flow).

**Tested:** backend `pytest` -> 153 passed (up from 151): new `test_delete_transaction_removes_the_row`
and `test_delete_transaction_404s_for_another_users_row`. Frontend `jest` -> 45 passed: new Activity
test drives the full delete flow (open sheet, tap Delete, confirm via mocked `Alert.alert`, assert
`deleteTransaction` was called and the row disappears).

## Follow-up: the long-name overflow was actually in the CategorizeSheet header, not the list row

Screenshot from the human showed the Activity *list* row wrapping correctly (the earlier fix
worked), but the *detail sheet* opened by tapping a row -- `CategorizeSheet.tsx` -- had the exact
same unfixed bug in its own header: `headerRow` was `flexDirection: row` with the merchant `Text`
and amount `Text` as siblings, neither constrained (`flex`/`flexShrink`/`numberOfLines`), so a long
merchant name ran directly into the amount digits mid-line instead of wrapping cleanly. Applied the
same fix as the Activity row: merchant text gets `flex: 1`, `flexShrink: 1`, `numberOfLines={2}`;
amount text gets `flexShrink: 0` and a left margin; `alignItems` on the row changed from `baseline`
to `flex-start` since the merchant can now be two lines tall.

**Tested:** frontend `jest` -> still 45 passed (no behavior asserted by tests changed, this was a
pure layout fix -- verified against the screenshot's exact merchant string manually).

## Edit transaction details (merchant name + amount)

Added `PATCH /transactions/{id}/details` (`backend/app/routers/transactions.py`, new
`TransactionDetailsUpdateIn` schema in `schemas.py`) -- user-scoped like the delete endpoint
(404 for another user's row), rejects a blank merchant or non-positive amount (400), and writes
the edited name to both `merchant_raw` and `merchant_clean` (same convention `categorize-pending`'s
Grab backfill already uses when it overwrites a merchant name).

Frontend: `updateTransactionDetails` (`app/src/api/client.ts`) and an `editTransaction` action on
`TransactionsProvider` that patches the transaction into local state and refreshes the summary
(amount changes affect category totals). UI lives in `CategorizeSheet.tsx`: a small "Edit" link
next to the timestamp/source line swaps the merchant/amount header for a form (merchant text
input, amount input reusing the same S$-prefixed box style as `AddTransactionSheet`) with
Cancel/Save buttons; Save is disabled until both fields are non-empty.

**Tested:** backend `pytest` -> 156 passed (up from 153): new
`test_update_transaction_details_persists_merchant_and_amount`,
`test_update_transaction_details_rejects_blank_merchant_or_non_positive_amount`, and
`test_update_transaction_details_404s_for_another_users_row`. Frontend `jest` -> 46 passed: new
Activity test opens the sheet, taps Edit, changes both fields, saves, and asserts the updated
merchant name renders in the list.

## Login-via-connect-account onboarding flow

Replaced the hardcoded `CURRENT_USER_ID = 1` single-user shortcut with a real (if minimal)
login flow, so a fresh database self-bootstraps instead of needing a manual seed script. This
was the structural fix for the Render/Supabase deploy bug where Home/Settings rendered blank
forever and "Add transaction" silently failed -- both were foreign-key violations against an
empty `users` table, since nothing ever created that first row.

**Backend** (`backend/app/routers/auth.py`, `backend/app/services/oauth_state.py`): `/auth/google`
and `/auth/microsoft` no longer require an existing `user_id`. When it's omitted, the callback
resolves-or-creates a `User` by the OAuth account's own email (`_resolve_user`) instead of
assuming one already exists -- connecting an account *is* how you get an account now. Wrapped the
create branch in a `try/except IntegrityError` (rollback + refetch) as cheap insurance against a
double-tapped connect button racing two new-user callbacks for the same email. Both callbacks now
always include `user_id=<resolved id>` in the redirect back to the app (previously only
`linked`/`provider`/`email`), so the frontend reads it the same way regardless of whether this was
a login or an existing user linking a second mailbox.

**Frontend**: added `@react-native-async-storage/async-storage` (first persistent storage in the
app). New `AuthProvider`/`useAuth()` (`app/src/store/AuthProvider.tsx`) reads a stored user id on
launch and **validates it with a live `getUser` call** before trusting it -- this closes a real
edge case a Plan-agent design review flagged: a device that logged in against an old database
still has that id in storage after the backend gets redeployed/wiped, which would otherwise
reproduce the exact blank-screen bug this feature fixes, just relocated to "stale AsyncStorage"
instead of "hardcoded 1". `App.tsx` now gates on this: blank while resolving, a new `Login` screen
(`app/src/screens/Login.tsx`) when logged out, today's tab-bar tree when logged in --
`TransactionsProvider` is never mounted until a real user id exists, so its immediate `refetch()`
can't fire against nothing. `CURRENT_USER_ID` in `client.ts` changed from `const` to `let` with a
`setCurrentUserId` setter (kept its default of `1` so every existing screen-level test, which
renders a screen directly and bypasses the new auth gate entirely, needed zero changes).
`Settings.tsx`'s existing "Connect Gmail/Outlook" buttons (link-an-additional-account, unrelated to
login) now pass `CURRENT_USER_ID` explicitly, since `buildAuthUrl`'s userId param is no longer
defaulted -- the previously-inert "Sign out" text is now wired to `logout()`.

**Tested:** backend `pytest` -> 162 passed (up from 156): new cases in `test_auth.py`/
`test_ms_auth.py` for the no-`user_id` login path (creates a new user; reuses an existing one by
email, no duplicate) plus a regression case proving the existing-`user_id` linking path is
unchanged. Frontend `jest` -> 51 passed (up from 46): new `Login.test.tsx` (successful connect
persists the id from the redirect; cancelling resets the button instead of leaving it stuck); new
`App.test.tsx` cases for the logged-out path and the stale-stored-id-falls-back-to-Login path; new
`Settings.test.tsx` case for sign-out clearing storage. Added an official jest mock for
`@react-native-async-storage/async-storage` (`app/__mocks__/...`) so this is transparent to every
other existing test file.

## Historical backfill sync prompt whenever an account is linked

Connecting an account previously only ever got whatever the *default* window picked up (Gmail:
`newer_than:60d`; Graph: no date bound at all, whatever `$search`'s default page returned). Now,
whenever a genuinely *new* mailbox gets linked -- first-time signup via `Login.tsx`, or a second/
third provider linked later from Settings -- the app offers a native date picker to backfill older
transactions. Re-linking an already-connected provider (Settings' "Change", refreshing an expired
token) does not reprompt, since that's not "connecting an account" in the sense this feature means.

**Backend**: `_upsert_email_account` (`backend/app/routers/auth.py`) now reports whether it created
a new `EmailAccount` row vs. updated an existing one; both OAuth callbacks surface this as
`is_new_account=true/false` on the redirect back to the app (built as an explicit lowercase string
-- passing a bare Python bool through `urlencode` would silently stringify to `"True"`/`"False"`
and break the frontend's `=== "true"` check forever). Added `list_bank_messages_since(access_token,
since)` to both `gmail.py` and `graph.py` (a uniform 5th function on the shared provider interface)
-- unlike the everyday sync, this **fully paginates** (Gmail's `nextPageToken`, Graph's
`@odata.nextLink`) since a backfill spanning months could easily exceed one page, and this codebase
has already been bitten twice by single-page-scan bugs. Graph's version can't use `$search` (Graph
doesn't allow combining `$filter` and `$search` on `/messages` at all), so it filters by
`receivedDateTime` server-side and the full bank-sender allowlist client-side instead -- a known
accepted tradeoff is that this scans the whole mailbox in the date range, not just bank senders,
which is fine for a synchronous personal-use request but worth revisiting if it ever times out.
`POST /sync` gained an optional `since` date param, converted to **Singapore midnight** (not UTC
midnight -- SGT is UTC+8, so a naive UTC bound would start 8 hours late and silently miss real
transactions) via the same `SGT` constant `categorize.py` already uses.

**Frontend**: new `@react-native-community/datetimepicker` dependency, and a shared
`SyncBackfillSheet` component (built on the existing `BottomSheet`) reused by both `Login.tsx`
(after a fresh signup connect) and `Settings.tsx` (after linking an additional provider) --
`Settings.tsx`'s `connect()` previously ignored the OAuth redirect's query params entirely, now
parses `is_new_account` the same way `Login.tsx` does. Picked dates are serialized via the `Date`
object's **local calendar fields** (`getFullYear()`/`getMonth()+1`/`getDate()`), deliberately not
`toISOString()`, which converts to UTC first and can shift the calendar date back a day for anyone
whose device timezone is behind UTC. A failed backfill sync never strands the user: `Login.tsx`
still calls `login()` afterward regardless of outcome (the account itself already connected
successfully), just with a toast noting the sync didn't come through.

**Tested:** backend `pytest` -> 169 passed (up from 162). New direct `httpx.get`-mocking tests in
`test_gmail.py`/`test_graph.py` covering the pagination loops themselves (a deliberate, narrow
exception to this codebase's usual "monkeypatch at the function boundary" convention, since
multi-page walking is genuinely new logic here); new `test_sync.py` case proving `since=` routes
through the paginated path instead of the normal one; `test_auth.py`/`test_ms_auth.py` extended
with `is_new_account` assertions for the new-EmailAccount, second-provider, and re-link-doesn't-
reprompt cases. Frontend `jest` -> 57 passed (up from 51): new `Login.test.tsx` cases (new-account
connect shows the sheet instead of transitioning immediately; skip transitions with no sync call;
sync calls `syncTransactions` with the picked date then transitions; a sync failure still
transitions via a toast); new `Settings.test.tsx` cases (new provider shows the sheet; re-linking
doesn't). Added a manual jest mock for `@react-native-community/datetimepicker`
(`app/__mocks__/...`) -- the package's own jest helper only covers Android-dialog interception, not
a renderable stand-in, so this mock renders as a pressable test hook that fires `onChange` with a
fixed, known date for deterministic "the person picked a different date" tests.

## Browser-accessible web frontend (Expo web)

The app was mobile-only until now. Since `app/` is already Expo/React Native, the web version
reuses the exact same screens/components/styling via `react-native-web` (`npm run web`) rather
than a separate React app or a redesign -- same code, same style, same functions, as requested.

Discovery surfaced three real web-incompatibilities and fixed each:

1. **`@react-native-community/datetimepicker` has no web build** (its fallback renders `null` and
   warns) -- new platform-split `DateField` component: `app/src/components/DateField.tsx` (native,
   wraps the existing picker unchanged) and `DateField.web.tsx` (a plain HTML `<input
   type="date">`), resolved automatically by Metro's `.web.tsx` convention. `SyncBackfillSheet.tsx`
   now uses `DateField` instead of `DateTimePicker` directly. The local-calendar-field
   `Date`<->`"YYYY-MM-DD"` serialization (deliberately not `toISOString()`, which can shift the
   date across a UTC day boundary) moved out to a shared `app/src/utils/dateSerialization.ts` so
   both the sheet and the new web input use identical logic in both directions.
2. **`Alert.alert(...)` has no real multi-button implementation in `react-native-web`** -- new
   `app/src/utils/confirm.ts` (`confirmDestructive`): calls `Alert.alert` on native exactly as
   before, falls back to `window.confirm` on web (title+message concatenated, since
   `window.confirm` only supports one message and OK/Cancel -- same function, different chrome).
   Replaces the three direct `Alert.alert` call sites (`Settings.tsx` sign-out and unlink-account,
   `CategorizeSheet.tsx` delete-transaction).
3. **No backend CORS configuration at all** -- a browser calling the API from a different origin
   would be blocked outright. Added `CORSMiddleware` (`backend/app/main.py`) with an
   `allow_credentials=False` policy (auth here is a `user_id` in query params/bodies, never
   cookies, so there's no cross-origin-credentials case) and a new `CORS_ALLOWED_ORIGINS` setting
   (`backend/app/config.py`, comma-separated), defaulting to the local Expo web dev server's ports
   so `npm run web` works with zero `.env` changes; a deployed frontend's real origin has to be
   added explicitly.

One thing initially assumed, then disproven by reading `google_oauth.py`/`ms_oauth.py`: OAuth does
**not** need any new redirect URIs registered with Google/Microsoft for web. Both providers are
always sent the fixed backend callback URL (`GOOGLE_REDIRECT_URI`/`MS_REDIRECT_URI`) -- the
frontend's own redirect (`AuthSession.makeRedirectUri()`) only ever travels inside this app's own
opaque `state` param and is used solely by our own backend's callback to build its final redirect.
The existing OAuth app registrations are unchanged.

Enabled Expo web itself: `npx expo install react-dom react-native-web @expo/metro-runtime`, plus
`app.json`'s `web.bundler`/`web.output` set explicitly (`"single"` -- the app has no web routing,
React Navigation renders entirely client-side inside one static `index.html`, so no server
rewrite rules are needed to host it).

**Tested:** backend `pytest` -> 172 passed (up from 169): new `test_cors.py` (an allowed origin
gets `Access-Control-Allow-Origin` echoed back; a disallowed one doesn't; an `OPTIONS` preflight to
`POST /sync` succeeds with the right `Access-Control-Allow-Methods`, since this app's JSON POSTs
are non-"simple" requests and trigger real preflights in a browser). Frontend `jest` -> 64 passed
(up from 57): new `confirm.test.ts` (both the native `Alert.alert` branch and the web
`window.confirm` branch, including the cancel-does-nothing case) and `dateSerialization.test.ts`
(the local-timezone-not-UTC round trip). `DateField.web.tsx` itself can't be exercised by this
repo's Jest config (`jest-expo`'s haste platforms don't include `'web'`, so `.web.tsx` files are
invisible to it) -- verified manually instead, alongside the OAuth popup flow, `react-native-svg`
rendering, and overall visual parity through a real browser session.

**Manual steps for the human:**
- Nothing required for local dev -- `npm run web` and `pytest`/`jest` all work with the defaults
  above. Optionally set `EXPO_PUBLIC_API_BASE_URL` in `app/.env` if the backend isn't on
  `localhost:8000`.
- **Deploying the web build** is a separate, later step (not done here, same as how the backend's
  Render deployment was walked through manually): `npx expo export -p web` produces a static
  `app/dist/`, deployable as a Render Static Site (build command `npx expo export -p web` run from
  `app/`, publish directory `app/dist`). Set `EXPO_PUBLIC_API_BASE_URL` as a **build-time** env var
  on that static site (Expo inlines `EXPO_PUBLIC_*` at build time, not runtime). Once its URL is
  known, add it to the backend's `CORS_ALLOWED_ORIGINS` on Render.

## Sync-on-app-open catch-up

Render's free web service sleeps after ~15 minutes idle, which suspends the in-process 10-minute
background scheduler along with it -- previously, opening the app after a sleep window just showed
whatever stale data happened to already be in the database, with no way to force a fresh read
short of the next scheduler tick (which itself requires the service to already be awake).

No backend change was needed: `sync_email_account`'s normal (no `since`) path already builds its
Gmail query from `account.last_synced_at` when set, and Graph's default query re-scans and relies
on `source_email_id` dedup either way -- both already mean "catch up since the last successful
sync," which is exactly what's wanted. The gap was that nothing ever actually called `POST /sync`
on app open; `TransactionsProvider`'s mount effect only ever read existing data
(`getTransactions`/`getSummary`/etc.), never triggered a sync.

**Frontend** (`app/src/store/TransactionsProvider.tsx`): the mount effect now calls
`syncTransactions(CURRENT_USER_ID)` (no `since` -- the incremental path above) before `refetch()`,
best-effort (a cold Render start timing out, a network hiccup, or one account's expired token must
never block the app from showing whatever's already stored, so failures are swallowed and
`refetch()` still runs). This also happens to be *why* it helps with the sleep problem specifically:
the sync call is itself a real HTTP request, so opening the app is what wakes the service back up
in the first place. Scoped to the mount effect only, not the general-purpose `refetch()` used after
every mutation (categorizing a transaction, editing a budget, etc.) -- those shouldn't each trigger
a mail sync.

**Tested:** frontend `jest` -> 66 passed (up from 64): new `TransactionsProvider.test.tsx` asserts
the sync call fires with the current user id before data loads, and that a rejected sync still lets
already-stored data render. `mockClientDefaults()` (`app/src/testUtils.tsx`) now mocks
`syncTransactions` by default, since every screen-level test mounts `TransactionsProvider`.
Backend unchanged, still 172 passed.

## Web-only dashboard layout: sidebar nav + multi-column screens

The web build reused the mobile layout verbatim -- one stacked column with a bottom tab bar,
just stretched into a browser window. This reworks the *layout* for web specifically (same
colors/type/components, no design-system changes): a left sidebar instead of the bottom tab bar,
and Home/Summary/Settings reflowed into two-column panels on wide windows. Native is untouched.

**Sidebar** (`app/src/navigation/Sidebar.tsx`, new): `createBottomTabNavigator`'s custom `tabBar`
prop can't produce a left column on its own (its internal container is a fixed content-then-bar
column, which is why the mobile `TabBar.tsx` position-absolutes itself at the bottom rather than
relying on the outer direction) -- so the sidebar lives in a new `app/src/navigation/MainTabs.web.tsx`,
picked up automatically by Metro's platform-extension resolution in place of `MainTabs.tsx` on web
(same mechanism as the existing `DateField`/`DateField.web.tsx` split), with zero changes to
`RootNavigator.tsx` or `App.tsx`. It renders a `flexDirection:"row"` wrapper -- `Sidebar` next to a
`flex:1` tab navigator with `tabBar={() => null}` -- tracking the active route via the navigator's
own `screenListeners.state` into local state, and navigating via the documented nested-navigate
form (`navigation.navigate("MainTabs", { screen: routeName })`). The route-to-icon map that used to
live inline in `TabBar.tsx` moved to a shared `ROUTE_ICONS` export in `icons.tsx` so both it and
`Sidebar.tsx` use the same mapping. `TabBar.tsx`/`MainTabs.tsx` (native) are otherwise untouched.

**Multi-column screens** (`app/src/components/ResponsiveColumns.tsx`, new -- first use of
`useWindowDimensions` in this codebase): renders `left`/`right` side by side above a ~900px width
threshold on web, otherwise stacks them in a plain `View`, identical to what was already there --
so native (`Platform.OS` is never `"web"`) always hits the stacked branch. Applied by regrouping
**existing** JSX sections, not rewriting them: `Home.tsx` (left = greeting/hero/needs-category/
goal cards, right = "where it went" categories), `Summary.tsx` (chart view: donut left, category
list right; calendar view: calendar left, day detail right), `Settings.tsx` (left = profile +
linked accounts, right = budget/goals/preferences/manage-categories/circle/sign-out). `Activity.tsx`
keeps its single list -- a chronological list doesn't benefit from a column split. All five main
screens (plus `Login.tsx`, narrower) got a one-line web-only `maxWidth`+centered style added to
their existing content container, so a wide monitor doesn't stretch everything edge to edge.

**`BottomSheet.tsx`**: web-only override drops the full-bleed `left:0, right:0` for a capped,
centered width (`maxWidth: 480, alignSelf:"center"`) so the categorize/add-transaction/sync-backfill
sheets don't span an entire ultrawide browser window. Slide-up/`Modal` mechanics unchanged.

**Tested:** frontend `jest` -> 72 passed (up from 66): new `ResponsiveColumns.test.tsx` (stacks on
native regardless of width; stacks on web below the threshold; row layout on web above it -- window
width mocked via `react-native/Libraries/Utilities/useWindowDimensions`, the narrowest submodule
that could be mocked without pulling in native-only pieces of the `react-native` barrel export) and
`Sidebar.test.tsx` (all 4 routes render, `onNavigate` fires the right route name, active row is
visually distinct). All pre-existing Home/Summary/Settings/Activity/Login tests pass unchanged --
confirms the native rendering path is byte-for-byte the same as before this feature. Backend
untouched, still 172 passed. `MainTabs.web.tsx` itself is invisible to this repo's Jest config
(same `.web.tsx`-resolution gap noted for `DateField.web.tsx`) -- its sidebar-swap composition
needs a manual browser check like `DateField.web.tsx` did.

**Manual steps for the human:** log into the web app and visually confirm the sidebar renders and
switches/highlights tabs correctly, Home/Summary/Settings show two columns on a wide window and
collapse to one column when narrowed below ~900px, Activity/Login are width-capped rather than
edge-to-edge, and the three bottom-sheet flows are centered/capped rather than full-bleed --
this environment could confirm the web bundle compiles cleanly (703 modules, no errors) but has no
way to click through the OAuth login flow to see the actual rendered dashboard.

## Web dashboard redesign matching a provided mockup

The user shared a claude.ai artifact URL as the target design -- a considerably richer web
dashboard than the sidebar+2-column pass above. It's a "bundled" artifact format (self-decoding
HTML+JS, not plain markup), so it was decoded manually: extracted the manifest's compressed JS
assets and the inline `<x-dc>` template HTML/CSS via a small Python/gzip script, rather than read
directly. Confirmed via the decoded `<style>` block that it was built directly from this app's own
design tokens (`#F6F4EF`, `oklch(.6 .09 158)`, DM Sans/Instrument Serif/JetBrains Mono all matched
`app/src/theme/tokens.ts` exactly) -- so this was a layout/IA change, not a new visual identity.

**New backend feature**: per-category monthly budget limits (`CategoryBudget` model/router/tests).
Key finding that shaped the design: built-in categories (Food, Transport, ...) have no row in the
existing `categories` table at all (that table only holds *custom* categories a user added), so a
limit keyed by `Category.id` would silently exclude most categories -- `CategoryBudget` is instead
keyed by a free-text `category` string per user, mirroring `Subcategory`'s existing convention.

**New shared web pieces**: `Sidebar.tsx` rewrite (236px, 5 nav items including a new Budgets page,
a "Feeds" card listing linked accounts with relative sync times, a pinned Add-expense button);
`PageHeader.tsx` (date, page title, live merchant search, avatar); `SearchProvider.tsx` (defaults
to an always-empty no-op search with no provider mounted, so it's harmless on native);
`BottomSheet.web.tsx` (centered dialog with fade/rise-in, replacing the previous session's
inline width-cap tweak -- native keeps the slide-up sheet unchanged); four new `derive.ts` helpers
(`previousMonthTransactions`, `dailyTotalsForRange`, `deriveRecurring` -- a same-merchant/
consistent-amount heuristic over already-loaded transactions, not real subscription data --
and `relativeTime`).

**New/rewritten screens**: `Home.web.tsx` (full platform split, not a column reflow -- two full
layouts, "A" and "B", toggleable, with a 14-day sparkline, vs-last-month delta, safe-to-spend-today,
needs-review queue, 3 data-derived insight cards, and recurring charges, all computed from real
data); `Summary.web.tsx` (adds a 6-month trend chart and biggest-movers panel on top of the
existing donut/category-list and calendar views); `Budgets.tsx` (new page: per-category spend,
with a progress bar only for categories where a real limit was explicitly set -- unset ones show a
plain amount, never a fabricated bar; the existing single savings goal; recurring charges).
`Home.tsx`/`Summary.tsx` (native) revert to their pre-dashboard-redesign form now that the web
layouts live in dedicated files -- `ResponsiveColumns` (last session's reflow component) is deleted
as unused. `Activity.tsx`/`Settings.tsx`/`QuickSort.tsx` were restyled in place rather than split:
Activity gets per-category filter pills and live search; Settings gets a 7/5 web column split with
a new "Manage budgets" link while keeping its existing budget/goal editors fully working on both
platforms; QuickSort gets a narrow web max-width cap matching Login's.

**Scope decisions, confirmed with the user up front**: both Home layouts (not just the mockup's
default) were built, since the user asked for the full A/B toggle; per-category budgets are a real
feature (new backend table+API), not fabricated numbers; the single-goal data model was kept as-is
(no multi-goal backend change); recurring/subscription detection is a client-side heuristic, not a
new backend integration. The mockup's own "mobile preview frame" and platform-preview toggle button
are demo-only tooling for the artifact itself and were not built as real product features.

**Tested:** backend `pytest` -> 178 passed (up from 172): new `test_category_budgets.py` covering
upsert, delete, built-in-category coverage (the free-text-key design point above), and cross-user
scoping. Frontend `jest` -> 84 passed (up from 82, net after adding `derive.test.ts`'s 10 cases and
deleting `ResponsiveColumns.test.tsx`'s 3): `Sidebar.test.tsx` updated for 5 routes/Feeds/Add-button.
`.web.tsx` files (`Home.web.tsx`, `Summary.web.tsx`, `BottomSheet.web.tsx`, `MainTabs.web.tsx`) are
invisible to this repo's Jest config, same as previous `.web.tsx` files -- verified instead by
confirming the web bundle compiles cleanly (708 modules, no errors) and via `npx tsc --noEmit`
across the whole change. Every pre-existing native screen test passed unchanged throughout every
commit in this feature, confirming native rendering stayed untouched.

**Manual steps for the human:** load the web app and click through it for real -- this environment
can't authenticate through OAuth to see live data. Specifically worth checking: both Home layouts
with real numbers (sparkline, safe-to-spend, insights, recurring charges); setting a category
budget limit on the new Budgets page and confirming the progress bar appears; the header search
actually filtering Activity's list; Add-expense/Categorize opening as centered dialogs; the
"Manage budgets" link from Settings; and a spot-check on a phone/Expo Go that Home, Summary, and
the Add/Categorize sheets are pixel-identical to before this feature (everything here is additive
on web only).

## Five fixes to the web dashboard redesign

Follow-up polish after trying the redesign against the mockup for real. All web-only, no backend
changes: (1) the header search box now only renders on the Activity tab, since that's the only
screen it actually filters; (2) Home's layout toggle renamed `"a"/"b"` -> `"focused"/"command"`,
plus two things that were just missing versus the mockup -- a "LAYOUT" label beside the toggle and
a highlighted background on the active pill (previously only the text changed); (3) the "where it
went" donut was pinned to the left edge of a wide card with the category list stretched to fill
the rest -- fixed by giving the list a fixed width and centering the row as one compact block; (4)
Settings' two web columns started at different heights (the right column's first label carried a
top margin meant for mid-stack use, the left column's first item didn't) and Preferences was in
the wrong column per the mockup -- moved to the left column, with each section defined once and
composed in a *different order* for native vs. web (not just conditional styling), so native's
original stacked order stays completely untouched.

(5), the largest: the calendar view's Week/Month/Year pills previously did nothing -- calendar
always showed a fixed month grid with its own separate state, ignoring the period selector
entirely. Unified onto one shared `sumPeriod`/`viewAnchor` pair that now drives both Chart and
Calendar view, added a 4th "Day" option, and made the calendar grid genuinely period-shaped: day
shows a notice + the day-detail panel directly, week is a single 7-cell row (new use of
`dailyTotalsForRange` from the derived-stats work), month is the existing grid unchanged, year is
a new 12-tile month heat-map that drills into that month (switches period to "month") on click.
Added a period-total line at the bottom of the calendar card, reusing the same period-scoped
`grand` value the chart view already computed.

**Tested:** `npx tsc --noEmit` clean, frontend `jest` still 84 passed (no count change expected --
the touched files are either `.web.tsx`, invisible to this repo's Jest config same as every prior
`.web.tsx` file, or `Settings.tsx`'s native path, which `Settings.test.tsx`'s existing 11 cases
confirmed still passes unchanged after the section-reordering refactor). Web bundle recompiled
cleanly (692 modules) after every fix as a runtime sanity check.

**Manual steps for the human:** verify in the browser -- search only on Activity; the Home toggle
reads "LAYOUT  Focused  Command" with a visible active highlight; the donut reads centered, not
stretched; Settings' columns start level with Preferences on the left; and the big one, Summary's
calendar view actually responding to Day/Week/Month/Year with a period total at the bottom and
Year's tiles drilling into a month on click.

## Calendar view: real drill-down navigation (Year → Month → Week → Day)

Follow-up on the calendar rework above -- the right panel was still wrong: it always showed one
arbitrarily-selected *single day's* transactions regardless of which grid was showing on the left,
and clicking a cell just changed which day was highlighted in place rather than navigating.

Right panel now always shows **every transaction in the active period** (day/week/month/year) via
the same `periodTransactions` already computed for the chart view, grouped by day with
`groupByDay` (`derive.ts` -- same helper `Activity.tsx` already uses) so week/month/year periods
with many rows still read cleanly. The whole `selectedDate`/single-day-detail mechanism from the
previous commit is gone, replaced by this simpler "always show the full period" model.

Clicking now genuinely drills down: a day cell in Month view zooms into that day's **Week**
(confirmed with the user: any day cell doubles as the "select this week" affordance, no separate
week-row control); a day cell in Week view zooms into **Day**. Year's month-tile drill (already
built) is unchanged. Since clicking now navigates away instead of persisting an in-place selection,
the old `calCellSelected` highlight logic had nothing left to compare against and was removed.

Pills no longer reset `viewAnchor` to today on click -- confirmed with the user this should "zoom
out from current context" instead, so `selectSumPeriod` now just changes the period, leaving
`viewAnchor` (wherever drilling/paging left it) to carry over and naturally land on the containing
week/month/year.

**Tested:** `npx tsc --noEmit` clean, frontend `jest` still 84 passed (no count change expected,
`.web.tsx` file same as always). Web bundle recompiled cleanly (692 modules).

**Manual steps for the human:** verify the full chain in the browser -- Year's right panel lists
the whole year grouped by day; click a month tile, its whole month lists; click a day in that
month's grid, that day's whole week lists; click a day in the week row, Day view shows just that
day; and confirm clicking "Month"/"Year" pills while drilled into a week/day zooms out to the
containing month/year rather than jumping to today.

## Three more web fixes: Settings header alignment, Home empty state, Budgets edit-all

**Settings (`Settings.tsx`):** each group label ("WHERE TRANSACTIONS COME FROM", "PREFERENCES",
"BUDGET & GOALS") was a `<Text>` sibling rendered *above* its card rather than inside it -- the
root cause of the two web columns' first boxes starting at different heights, since whichever
section happened to be first in a column carried extra top margin the other column's first box
(the profile card, already self-contained) didn't have. Moved each label to be the first child
*inside* its card (new `groupLabelInline` style, card-internal padding instead of external
margin) so every section is a uniform self-contained box and both columns' tops now align
automatically -- the `groupLabelFirst`/`isFirstInColumn` special-casing from the previous round is
no longer needed and was removed.

**Home (`Home.web.tsx`):** the "NEEDS REVIEW" card (both the Focused and Command layouts) rendered
an empty caption/list/button when nothing needed review, reading as broken rather than done.
Added a centered "All transactions categorised!" message in both layouts' cards when
`reviewQueue.length === 0`.

**Budgets (`Budgets.tsx`, web-only screen):** replaced the per-category "Set a limit"/"Edit limit"
inline links with a single header-level "Edit" button that switches every category (all 8
built-ins plus any custom ones, not just ones with spend or an existing limit) into edit mode at
once, with one "Save all"/"Cancel" pair committing (`Promise.all` of per-category `PUT
/category-budgets/{category}` calls, since there's no batch endpoint) or discarding all drafts
together. Categories without a saved limit prefill with a real, editable **suggested** limit
(`monthly_target × share`) for the 8 built-in categories, via a new `SUGGESTED_CATEGORY_SHARE`
table adapted from WalletHub's budget-percentage guide
(https://wallethub.com/edu/b/budget-percentages/145359) and rescaled to sum to 100% across just
this app's 8 tracked spending categories (Groceries 18%, Transport 15%, Bills 15%, Food 12%,
Shopping 12%, Entertainment 10%, Other 10%, Health 8%) -- documented as a judgment-call adaptation,
not a verbatim source quote, in a comment above the constant. Custom categories get no suggestion.

**Tested:** `npx tsc --noEmit` clean (no new errors in any touched file). Frontend `jest` still 84
passed, 14 suites (no count change -- `Budgets.tsx` has no existing test file, `Settings.tsx`'s and
`Home.tsx`'s native-facing suites pass unchanged since these were `.web.tsx`/shared-file styling
changes). Web bundle served cleanly via `expo start --web` (200, ~3.7MB, no Metro resolution
errors).

**Manual steps for the human:** in the browser, confirm Settings' two columns now start flush at
the top with every label inside its box; clear all uncategorised transactions and confirm Home's
needs-review card shows the centered message (both dashboard layouts); open Budgets, click Edit,
confirm every category shows an input (existing limits verbatim, unset built-ins prefilled with a
sensible suggested number, custom categories empty), and that Save all persists the changes while
Cancel discards them.

## Bug fix: PayNow / Scan-and-Pay alerts were silently dropped by the bank-sender allowlist

The human reported PayNow and Scan-and-Pay transactions weren't showing up at all. Root cause was
in the bank-sender allowlist added last round (`bank_senders.py`, "Restrict sync to an exact
bank-sender allowlist"): it assumed all of a bank's alert types share one sender address
(`ibanking.alert@dbs.com` for DBS, `unialerts@uobgroup.com` for UOB) and hard-filtered out anything
else in `sync.py` before the parser ever ran. In reality each bank uses a *different* address per
alert type -- DBS sends card transactions from `ibanking.alert@dbs.com` but PayNow/NETS Scan & Pay/
own-account transfers from `alerts@dbs.com.sg`; UOB's card alerts come from `unialerts@uobgroup.com`
but PayNow from `alerts@uob.com.sg`. The parser itself (`parser.py`) already handled these emails
correctly -- confirmed by `test_parser.py`'s fixtures, which use exactly these addresses and were
passing the whole time -- they just never reached it in the live sync path. There was even a test
(`test_bank_senders.py`) that explicitly asserted `alerts@dbs.com.sg` should be *rejected* as a
lookalike sender, which was the mistake: it's a real bank address, not a spoof.

**Fix:** `KNOWN_BANK_SENDERS` in `bank_senders.py` now maps each bank to a *list* of addresses
instead of one (`dbs: [ibanking.alert@dbs.com, alerts@dbs.com.sg]`, `uob: [unialerts@uobgroup.com,
alerts@uob.com.sg]`), confirmed with the human before changing since this is a security-relevant
allowlist controlling which senders' email bodies get read. `GMAIL_SENDER_FILTER`/
`GRAPH_SENDER_QUERY`/`is_allowlisted_sender` all now consider every address across every bank.
`gmail.py`, `graph.py`, and `sync.py` needed no changes -- they only ever consumed the derived
filter/query/predicate, not the dict shape directly. Corrected the wrong `test_bank_senders.py`
assertion and added a positive test that both PayNow addresses are now accepted; the "reject
lookalikes" test now uses an actual look-alike domain (`alerts@dbs.com.sg.evil.com`) instead of a
real address.

**Tested:** full backend suite `pytest -q` -- 179 passed (was 178; +1 new allowlist test), no
regressions across `test_bank_senders.py`, `test_sync.py`, or `test_parser.py`.

**Manual steps for the human:** trigger a manual sync (or wait for the next scheduled one) and
confirm PayNow and Scan-and-Pay transactions now appear in Activity going forward. This only fixes
sync *going forward* -- any PayNow/Scan-and-Pay alerts received since the allowlist was added won't
retroactively appear unless a backfill sync is re-run for the affected date range (Settings →
account → re-link triggers the backfill-sync prompt covering the last 60 days).

## Bug fix #2: the allowlist wasn't the (whole) problem -- the DBS parser regexes never matched real emails

The human reported PayNow/Scan-and-Pay were *still* missing after the allowlist fix, and sent
screenshots of two real DBS alert emails. Those screenshots showed the true root cause: DBS's
NETS Scan & Pay and PayNow alerts are sent from `ibanking.alert@dbs.com` -- the address already in
the allowlist all along -- so the allowlist was never actually blocking them. The real bug was in
`parser.py`: `_DBS_PAYNOW_RE` and `_DBS_NETS_RE` matched a compact single-line SMS-style format
("Fr DBS: Successful PayNow: S$87.00 from A/C ending 6540 to X (UEN ending Y), 22 Jul 18:01 SGT.")
that turns out to be fictional -- it was never verified against a real inbox, unlike the card-txn
regex added in an earlier phase, which was. DBS's real emails all use the same "Date & Time: / Amount:
/ From: / To:" table template for card purchases, NETS Scan & Pay, *and* PayNow alike (only the
framing sentence before the table differs), so the old PayNow/NETS regexes never matched anything
real and `parse_email` silently returned `None` for every one of them.

**Fix:** replaced the three separate (and two fictional) DBS regexes with one `_DBS_TABLE_RE`
matching the real shared table format, confirmed directly against the exact text from both
screenshots. Since a PayNow "To:" field carries a distinguishing "(... ending NNNN)" suffix that a
plain card/NETS merchant name never does, that's now what tells a PayNow-to-a-person transfer
apart from a merchant purchase (same UEN-vs-mobile/NRIC classification as before) -- and an
"A/C ending NNNN" merchant field (own-account transfer) is now also recognized inside the same
table regex as a bonus, in case DBS's real own-transfer alert turns out to use the same template
too (unverified, no screenshot for that one yet). Corrected fixtures
(`dbs_nets.txt`/`dbs_paynow_person.txt`/`dbs_paynow_merchant.txt`) to the real wording, updated
their test sender to the now-confirmed `ibanking.alert@dbs.com`, and fixed `test_sync.py`'s
`DBS_PAYNOW_TEXT` constant (same fictional format) so its sync-flow tests exercise real-shaped
text too. Corrected the misleading comment in `bank_senders.py` left over from the first (wrong)
diagnosis. UOB's PayNow regex is unchanged -- no screenshot to verify it against yet, so if UOB
PayNow/Scan-and-Pay is also missing, that's the next place to check with a real sample.

**Tested:** full backend suite `pytest -q` -- 179 passed, no regressions. Also ran `parse_email`
directly against the *exact* text transcribed from both screenshots (not just the fixture files)
to confirm the real-world match: NETS Scan & Pay → S$6.00 CHICKEN RICE (expense), PayNow →
S$2.20 LEX KOX SIXX (`type` since reclassified -- see next entry below).

**Manual steps for the human:** trigger a sync and confirm PayNow/Scan-and-Pay transactions now
appear. As with the previous fix, this only helps going forward -- re-run a backfill sync
(Settings → account → re-link) to pick up any missed since the original allowlist change. If you
also use UOB PayNow, forward a sample alert (or a screenshot like the DBS ones) if it's still not
showing up -- its regex is unverified and likely has the same class of bug.

## Bug fix #3: PayNow transaction type was guessed from payee ID type, not from the money's direction

The human flagged that `type` (expense vs transfer) was still wrong for some PayNow transactions.
The old `_classify_paynow` guessed from the payee's ID suffix on the "To:" field -- UEN (business)
-> expense, mobile/NRIC (person) -> transfer -- on the assumption that paying a business is always
spending and paying a person never is. That assumption doesn't hold: plenty of real merchants
(hawker stalls, small vendors) register PayNow on a personal mobile number instead of a UEN, so
those legitimate expenses were being silently excluded from spend totals and budgets as "transfers".

**New rule (confirmed with the human):** `type` is now decided by whether the email text contains
the word "receive" or "received" -- money coming *into* the account isn't spending (transfer),
anything else is money going out (expense), regardless of who the payee is. This replaces
`_classify_paynow`'s UEN/mobile/NRIC check everywhere it's already called (both DBS's and UOB's
PayNow parsing); DBS's "Own Funds Transfer" (moving money between your own accounts) is
deliberately *not* touched by this rule and stays hardcoded as `transfer` -- confirmed with the
human as out of scope, since that's unambiguously not spending regardless of wording.

One nuance: under the current table-parsing structure, `_classify_paynow` only runs on the
*outgoing*-shaped PayNow branch (a "To:" field with a "(... ending NNNN)" suffix) -- so with real
emails observed so far (neither of which contains "receive"/"received"), every PayNow-to-a-person
case now comes out as `expense`, same as PayNow-to-a-business. The `transfer` branch is exercised
by a synthetic test rather than a verified real "you received a payment" email (none has been seen
yet); if that alert type turns out to have a different shape entirely, it may need its own parsing
path later.

**Tested:** full backend suite -- 180 passed (was 179; +1 new test covering the receive/received
branch directly). Updated `dbs_paynow_person`/`uob_paynow` fixture-test expectations from
`transfer` to `expense` to match the new rule.

**Manual steps for the human:** watch upcoming PayNow-to-a-person transactions in Activity --
they'll now show as expenses. If you get an actual "payment received" alert email, forward it (or
a screenshot) so the receive-detection path can be verified against real wording instead of the
synthetic test text.

## Transfer-type transactions were saved but invisible in the app

The human asked whether `transfer`-type transactions were still being saved to the database at
all. They are -- `save_parsed_transaction`/`sync.py` never filter by `type` before inserting. The
actual gap was on the *read* side: `GET /transactions` defaults to `type=expense`
(`routers/transactions.py`), and the only frontend call site (`TransactionsProvider.tsx`, feeding
every screen) calls `getTransactions()` with no argument, which itself defaults to `"expense"`
too. So the app has never fetched or shown transfer-type rows anywhere -- not a regression from
the receive/received change above, a pre-existing gap.

**Fix, scoped to Activity only (confirmed with the human):** rather than widening the global
`TransactionsProvider` fetch (which feeds Home/Summary/Budgets' spend totals too, several of which
turned out to have inconsistent `isExpense` filtering that would have let transfers leak into
places like Summary's month-view calendar panel), `Activity.tsx` now makes its own separate
`getTransactions("transfer")` call and merges the result into the "All" filter view only (sorted
back into `txn_at`-descending order, since `groupByDay` expects pre-sorted input and the two
fetches arrive sorted independently). The "Needs a category" and per-category filters are
untouched, still sourced from the expense-only `transactions` -- and spend totals/budgets
everywhere else are unaffected, since they never see the merged list.

`testUtils.tsx`'s `mockClientDefaults` previously mocked `getTransactions` with one fixed return
value regardless of the `type` argument, which would have made this second call resolve to the
same array as the first (duplicating rows in tests) -- changed to a `mockImplementation` keyed on
`type`, with a new optional `overrides.transfers` (defaults to `[]`, preserving every existing
test's behavior unchanged).

**Tested:** frontend suite -- 85 passed (was 84; +1 new test asserting a transfer row appears in
"All" but doesn't count toward the "Needs a category" badge). `npx tsc --noEmit` clean. Web bundle
still compiles (200, ~3.7MB).

**Manual steps for the human:** open Activity's "All" filter and confirm any Own Funds Transfer
(or other transfer-type) transactions now show up in the feed, still excluded from Summary/Budgets
spend totals as before.

## Bug fix #4: incoming PayNow ("you've received a transfer") had no parsing support at all

Following up on the "no transfers, all expenses" report, the human confirmed a real incoming
transfer was completely missing (not just mistyped) and sent a screenshot: subject "digibank Alert
- You've received a transfer", from `ibanking.alert@dbs.com`. This is a *third* distinct DBS email
template, structurally nothing like the outgoing Date & Time/Amount/From/To table (`_DBS_TABLE_RE`)
-- no "Amount:"/"Date & Time:" labels at all, just "You have received SGD 17.40 via PayNow on 23
Jul 2026 22:31 SGT. From: LOU SIM TENG To: Your DBS/POSB account ending 6540." So it matched
nothing and `parse_email` silently dropped it, same root cause as the NETS/PayNow bug (bug fix #2)
but a format that hadn't been seen yet.

**Fix:** added `_DBS_PAYNOW_RECEIVED_RE`, a dedicated regex for this template, tried right after
the existing Own Funds Transfer check. Verified directly against the exact screenshot text before
writing the fixture (`dbs_paynow_received.txt`): SGD 17.40, sender "LOU SIM TENG", 23 Jul 2026
22:31 SGT. Unlike every other DBS branch so far, this one is a genuine incoming transaction, so
`direction=DirectionEnum.credit` (not the `debit` every other branch hardcodes) -- and `type` runs
through the same `_classify_paynow(text)` used elsewhere, which correctly returns `transfer` since
the text contains "received". This format also includes an explicit 4-digit year (unlike the
others, which infer the current year), so `_sgt_datetime` is called with `year=` explicitly here.

Note: this confirms incoming PayNow specifically, not DBS's "Own Funds Transfer" (moving money
between your own accounts) -- that regex (`_DBS_OWN_TRANSFER_RE`) is still unverified against a
real email; if a genuine self-to-self transfer ever goes missing, that's the next one to check
with a screenshot.

**Tested:** full backend suite -- 181 passed (was 180; +1 new fixture-based test case). Direct
`parse_email` call against the untouched screenshot text confirmed the exact match before the
fixture was even written.

**Manual steps for the human:** trigger a sync and confirm this and any future "you've received a
transfer" emails now appear in Activity's "All" filter as transfer-type, credit-direction rows.

## Transfer rows: green "+" prefix, and subtract from the day's total instead of adding

The human asked for transfer rows in Activity to render in green with a "+" before the amount,
and for the day-group total to subtract transfers rather than add them -- so a day mixing an
expense and an incoming transfer shows a net-spend total, not an inflated sum of two unrelated
cash flows.

`groupByDay` (`derive.ts`) now applies a signed amount per transaction (`-amount` for `type ===
"transfer"`, `+amount` otherwise) when accumulating each day's `total`. This only changes anything
for Activity's "All" filter, the one place transfer and expense rows are mixed together (per the
previous entry) -- every other `groupByDay` caller (Summary's calendar drill-down) still only ever
sees expense-typed input, so the new branch is a no-op there. `Activity.tsx`'s row now renders a
"+" prefix and `colors.success` (the same green used for "Change"/success links elsewhere) when
`txn.type === "transfer"`, expense rows unchanged.

Since a day's total can now go negative (an all-transfer day, or transfers outweighing that day's
spend), fixed `formatMoney` to put the sign before the currency prefix ("-S$5.00", not the
previous "S$-5.00").

**Tested:** frontend suite -- still 85 passed (extended the existing transfer-visibility test with
assertions for the "+S$10.00" text, its green color, and the net "S$0.00" day total, rather than
adding a new test). `npx tsc --noEmit` clean. Web bundle still compiles (200, ~3.7MB).

**Manual steps for the human:** open Activity's "All" filter and confirm transfer rows show green
with a "+", and that a day mixing both types shows the net total rather than the sum.

## QuickSort: fixed the web Activity-list backdrop leak, added a Tinder-style slide-out

A screenshot showed QuickSort opening as a narrow centered card on web with Activity's full
transaction list still visible in the gutters on either side, behind it. Root cause (found by
reading React Navigation's web internals): `QuickSort` is a root-stack route with `presentation:
"transparentModal"` (`RootNavigator.tsx`) -- on web there's no separate compositing layer, so
`@react-navigation/native-stack`'s web renderer deliberately keeps the presenting screen
(`MainTabs`, i.e. all of Activity) mounted and visible for any `transparentModal` route. That's
harmless as long as the modal's own screen is opaque and full-bleed -- which `Circle.tsx`/
`ManageCategories.tsx` (the other two `transparentModal` routes) already are, but `QuickSort.tsx`
wasn't: its `maxWidth: 460, alignSelf: "center"` was applied directly on the `flex:1` root that
also carried the background color, so that root's box was only 460px wide and nothing painted in
the gutters beyond it.

**Fix:** split `QuickSort.tsx`'s single `container` style into the same `container` (full-bleed,
opaque, `flex:1`) / `content` (the padded, web-capped 460px column) two-layer pattern already used
by `Activity.tsx`/`Settings.tsx`/`Budgets.tsx`. No changes to `RootNavigator.tsx` or the modal
presentation/native behavior -- purely a QuickSort-local styling fix.

**Tinder-style slide-out:** added a `sortedIds` local-exclusion state (mirroring the existing
`skipped` pattern) so the queue advances to the next transaction the instant a category is picked,
instead of waiting on `categorize()`'s real network round-trip (`TransactionsProvider.tsx`, a
`PATCH` + a `getSummary` call) -- otherwise there'd be a visible stall before anything happened. A
snapshot of the just-picked transaction then renders in an `Animated.View` on top of the
already-advanced card underneath, sliding right (`translateX` 0→480) with a slight rotation
(0→10deg) and a late opacity fade, clearing itself once the animation completes. No new dependency
-- reused the exact `Animated.timing`/`useNativeDriver: true`/`Easing.out(Easing.ease)` pattern
already established in `BottomSheet.web.tsx`/`Toast.tsx`/`ProgressBar.tsx`; confirmed via research
that `react-native-reanimated`/`gesture-handler` aren't installed and aren't needed since this is a
triggered exit animation, not a drag gesture. Applies on both platforms (no `Platform.OS` gating)
since QuickSort is used natively too. The success toast and `sortedCount` increment still wait for
`categorize()` to actually persist, so a failed save doesn't show a misleading success toast --
only the visual queue advance is optimistic.

Factored the merchant/amount/source/hint markup (previously duplicated) into a shared `CardContent`
component used by both the current and exiting cards.

**Tested:** frontend suite -- 86 passed (was 85; +1 new test asserting the exiting card and the
newly-revealed next card coexist immediately after a tap, proving the optimistic advance).
`npx tsc --noEmit` clean. Web bundle still compiles (200, ~3.7MB). Existing `QuickSort.test.tsx`
cases needed no changes -- `updateTransactionCategory` is still called synchronously enough after
`fireEvent.press`, and `findByText` assertions resolve, if anything faster than before since the
queue no longer waits on the mocked network promise.

**Manual steps for the human:** open QuickSort from Activity's "Quick sort" banner in the browser
and confirm no Activity content is visible in the background at any viewport width; pick a category
and confirm the card visibly slides out to the right with a slight rotation while the next
transaction is revealed underneath. Also worth checking on a physical device via Expo Go, since the
animation change applies there too.

## Add Transaction: rename, expense/income toggle, date picker; income relabel; Settings spacing

Four independent fixes.

**Sidebar button renamed** (`Sidebar.tsx`): "Add expense" -> "Add transaction", matching the sheet
it opens (which already called itself "Add a transaction" internally). Copy-only -- the
`onAddExpense` prop name and `sidebar-add-expense` testID are untouched internal identifiers.

**Add Transaction sheet gets an expense/income toggle and a date picker**
(`AddTransactionSheet.tsx`): previously had no type field at all (relied on the backend's
`expense`/`debit` defaults) and hardcoded `txn_at` to `new Date().toISOString()`. Added two
Pressable pills (Expense/Income) driving both `type` and `direction` (`expense`->`debit`,
`income`->`credit`) in the save payload -- the backend already accepted both fields with no
changes needed. Added a `DateField` (the app's only cross-platform date input, already used by
`SyncBackfillSheet.tsx` -- native wraps `@react-native-community/datetimepicker`, web is a plain
`<input type="date">`, since the picker library has no web build) for the transaction's date; since
only the *date* was asked for (not time), the picked date's Y/M/D is combined with the current
time-of-day to build `txn_at`, rather than adding a time picker that doesn't exist as a component
in this codebase.

**Incoming PayNow relabelled `income`, not `transfer`** (`backend/app/services/parser.py`):
`_classify_paynow`'s "receive"/"received" branch now returns `TransactionTypeEnum.income` instead
of `.transfer` -- `transfer` is now reserved specifically for DBS's "Own Funds Transfer" (moving
money between the user's own accounts), which is a separate code path
(`_DBS_OWN_TRANSFER_RE`/`_DBS_TABLE_OWN_ACCOUNT_RE`) untouched by this change. This surfaced a real
bug during planning: `backend/app/routers/transactions.py`'s `/summary` endpoint only excluded
`transfer` from the monthly spend total, so incoming money reclassified as `income` would have
started counting *toward* spend. Fixed by filtering `type == expense` instead of `type != transfer`
(equivalent to excluding both non-expense types, and clearer intent).

Frontend consumption updated to match (confirmed with the user: a self-transfer is still money
leaving the viewed account, so it shouldn't look like an inflow):
- `Activity.tsx`'s "All" filter now fetches `income` as a third type alongside the existing
  `expense`/`transfer` fetches, merged and re-sorted by `txn_at`.
- The green "+"" styling moved from `type === "transfer"` to `type === "income"` only --
  `amountTransfer` renamed to `amountIncome`. Self-transfers render plain, like an expense row.
- `groupByDay`'s (`derive.ts`) day-total math is now three-way: `income` subtracts (real money
  in), `transfer` is excluded entirely (neither adds nor subtracts -- not spending, but not
  confirmed net-new money either), everything else (`expense`) adds normally as before.
- `testUtils.tsx`'s `mockClientDefaults` mock gained an `overrides.income` branch alongside the
  existing `overrides.transfers`.

**Settings: gap between cards** (`Settings.tsx`): `column`'s style had no `gap` at all (only
`Platform.OS === "web"`-gated to `{ flex: 1 }`, empty on native), and most section cards had zero
margin after them, so they sat flush against whatever followed. Added `gap: spacing.lg` (14) to
`column` on both platforms, and wrapped native's previously-unwrapped flat list of sections in a
`<View style={styles.column}>` too (a bare fragment can't carry a `gap` style). Removed the
now-redundant explicit `marginTop`s on `manageCategoriesCard`/`circleCard`/`signOut` that would
otherwise double up with the new uniform gap. Also converted `profileSection`/`budgetGoalsSection`
from fragments to single wrapping `View`s -- both can render more than one top-level piece (a card
plus a conditional edit panel, or plus the web-only "Manage budgets" link), and since each section
is now a direct child of the gapped `column`, a fragment would have let flexbox `gap` leak *inside*
a section (between its card and its own edit panel/link) rather than only between sections.

**Tested:** backend `pytest -q` -- 181 passed (unchanged count; updated the `dbs_paynow_received`
fixture-test and the synthetic receive-wording test to expect `income`, added an `income` row to
the summary-exclusion test, renamed to `..._and_income`). Frontend `npx tsc --noEmit` clean,
`jest --runInBand` -- 86 passed (unchanged count; updated the Activity "All filter" test to cover
transfer *and* income side by side, asserting income gets the green "+" and only income affects
the day total while transfer is excluded). Web bundle still compiles (200, ~3.7MB).

**Manual steps for the human:** confirm the sidebar button reads "Add transaction"; open it and
check the Expense/Income toggle and date field both work and the saved transaction reflects them;
trigger a sync and confirm a real "received" PayNow transaction shows green with a "+" under
`income` in Activity's "All" filter; check Settings' cards now have visible, even spacing on both
web and (if you can) native.

## Removed `type` entirely -- only `direction` remains; added PayLah! sender; scoped FAST fix

The human asked to remove the `type` field (`expense`/`transfer`/`income`) from the database
altogether, relying only on `direction` (`debit`/`credit`) to decide whether a transaction adds to
or subtracts from spend totals. This whole `type` concept had been the source of repeated bugs
over the last several rounds (allowlist gaps, wrong regexes, a wrong classification just fixed last
round) -- collapsing to one field removes that entire class of future bugs.

**Confirmed consequence, deliberately accepted:** without `type`, a self-transfer (moving money
between the user's own accounts) is indistinguishable from a real expense -- both are
`direction=debit`. I flagged this explicitly before starting (it directly reverses the "exclude
self-transfers from the day total" behavior from two rounds ago), and the human chose full removal
with no replacement anyway. Self-transfers now count toward spend totals and budgets like any
other debit.

**Backend:** `TransactionTypeEnum` and the `type` column are gone from `models.py`
(`backend/alembic/versions/1b9027170e89_drop_transaction_type.py` drops the column and the
`transaction_type_enum` Postgres type; downgrade re-adds both). `TransactionCreateIn`/
`TransactionOut` (`schemas.py`) drop the field. `list_transactions` (`routers/transactions.py`)
now takes an optional `direction` filter instead of `type` -- omitted means "everything," a
deliberate simplification enabling the frontend change below. `/summary` filters
`direction == debit` instead of `type == expense`.

In `parser.py`, `_classify_paynow`/`_RECEIVE_RE` are deleted outright -- their only job was
computing `type`; `direction` was *already* independently, correctly hardcoded at every call site
regardless of what that function returned, so nothing else depended on the receive/received
wording detection once `type` was gone. `_DBS_TABLE_OWN_ACCOUNT_RE`'s branch (inside the generic
`_DBS_TABLE_RE` handling) became behaviorally identical to the plain fallback case once its only
distinguishing output (`type=transfer`) disappeared, so that branch and regex were removed too --
`_DBS_OWN_TRANSFER_RE` and `_DBS_TABLE_PAYNOW_SUFFIX_RE` stay, since both still produce useful
output (a clean merchant name) independent of `type`.

**Frontend:** `TransactionType` is gone from `client.ts`; `getTransactions` takes an optional
`direction` instead. `TransactionsProvider` now fetches with no filter at all -- every transaction,
once -- which let `Activity.tsx` drop its separate `transfers`/`income` fetches and merge logic
entirely; the "All" filter just uses `transactions` directly now. `derive.ts`'s `isExpense` checks
`direction === "debit"` (same name, ~11 call sites unchanged); `groupByDay`'s three-way income/
transfer/expense logic collapsed to the two-way rule the human asked for: debit adds, credit
subtracts. Activity's green "+" styling moved from checking `type === "income"` to
`direction === "credit"` (`amountIncome` renamed `amountCredit`). `AddTransactionSheet`'s local
toggle state renamed `type`→`direction` (UI labels stay "Expense"/"Income" -- still the right words
to show a user even though only `direction` is stored); its payload no longer sends a redundant
`type` alongside `direction`. `Home.web.tsx`/`Budgets.tsx`'s remaining `t.type === "expense"`
checks became `isExpense(t)`/`t.direction === "debit"`.

**Added `paylah.alerts@dbs.com`** to the sender allowlist (`bank_senders.py`) -- a one-line change,
everything else derives from that list automatically. This only allowlists the sender; it does
**not** add PayLah! email parsing, since PayLah!'s wallet alerts are almost certainly worded
differently from the DBS/POSB bank alerts already handled, and every previous attempt to guess an
unseen format in this project turned out wrong when checked against a real screenshot. Needs a
real sample email before a parser regex can be written.

**FAST interbank transfers confirmed entirely unhandled** -- none of the existing DBS/UOB regexes
reference "FAST" or could plausibly match FAST-network wording (`_DBS_OWN_TRANSFER_RE` is
specifically for the user's own accounts, not a transfer to a different bank/person). No fixture or
test mentions FAST anywhere. Same conclusion as PayLah!: blocked on a real sample email, not
implemented this round.

**Tested:** backend `pytest -q` -- 181 passed (unchanged count net: removed the now-meaningless
synthetic receive-wording test, added a direction-filter test and a credit-row summary-exclusion
case). Frontend `npx tsc --noEmit` clean, `jest --runInBand` -- 86 passed (updated the Activity
"All filter" test to use one `transactions` list with mixed `direction` instead of separate
transfer/income mocks, and to reflect that an uncategorized debit now correctly appears in "Needs a
category"). Ran `alembic upgrade head` against the local dev Postgres and confirmed via `\d
transactions`/`\dT` that the `type` column and `transaction_type_enum` type are both actually gone.
Web bundle still compiles (200, ~3.7MB).

**Manual steps for the human:** this migration also needs to run wherever the deployed Render
backend's database lives (separate from local dev) -- `alembic upgrade head` there too, whenever
convenient before/during the next deploy. Send a real PayLah! alert email and a real FAST
interbank-transfer alert email (screenshots, same as the NETS/PayNow/received-transfer ones
earlier) so both can get actual parsing support -- guessing the format has failed every time it's
been tried without evidence in this project.

## PayLah! and FAST transfers: turned out already parseable, just needed proof and a merchant-name fix

The human sent real screenshots of both. Both surprised the plan from last round: neither needed a
new regex at all. DBS reuses the exact same shared "Date & Time:/Amount:/From:/To:" table template
(`_DBS_TABLE_RE`, `parser.py`) for PayLah! transfers and FAST interbank transfers alike, just like
it does for card purchases/NETS/PayNow -- confirmed by running `parse_email` directly against the
*exact* screenshot text before writing anything. Last round's "FAST is confirmed entirely
unhandled" conclusion was reasoning from absence (no regex mentions "FAST"), which didn't account
for the generic table handler not caring about the intro wording at all -- a lesson for next time
this comes up: test against the real text before assuming a new regex is needed.

**PayLah!** (`dbs_paylah_transfer.txt`, sent from `paylah.alerts@dbs.com`, added to the allowlist
last round): parsed correctly as-is -- `_DBS_TABLE_PAYNOW_SUFFIX_RE` already strips the "(Mobile
ending NNNN)" suffix from the "To:" field, giving a clean `merchant_raw="egg"`.

**FAST** (`dbs_fast_transfer.txt`, sent from `ibanking.alert@dbs.com`, already allowlisted):
parsed correctly too, but with a less clean merchant name -- FAST's "To:" field has no parens
("Austin A/C ending 2047" vs PayNow's "Austin (Mobile ending 2047)"), so it fell through to the
generic fallback showing the whole raw string. Added `_DBS_TABLE_ACCOUNT_SUFFIX_RE`
(`^(?P<name>.+?)\s+A/C ending \d+$`) as a new check alongside the PayNow-suffix one, stripping this
different suffix style too -- confirmed against the real screenshot to give `merchant_raw="Austin"`.

Also softened the `bank_senders.py` comment on `paylah.alerts@dbs.com`: the screenshot proved the
*content* parses, but showed the sender's display name ("PayLah! Alerts"), not the raw address, so
that specific address is still not directly confirmed -- flagged for whoever debugs this next if
PayLah! mail ever goes missing.

**Tested:** full backend suite -- 183 passed (was 181; +2 new fixture-based test cases,
`dbs_paylah_transfer`/`dbs_fast_transfer`), both fixtures built from the exact screenshot text and
verified via a direct `parse_email` call before being committed to a test file.

**Manual steps for the human:** trigger a sync and confirm PayLah! transfers and FAST interbank
transfers both now show up correctly in Activity (FAST with a clean merchant name, not the raw
"Name A/C ending NNNN" string).

## Four UI/data fixes: Summary year-total bug, QuickSort merchant edit, Home chart lock, manual subscriptions

**Summary's year (and week/day) total silently undercounted spend.** The headline total (`grand`)
fell back to `Object.values(categoryTotals(periodTransactions))`, but `categoryTotals` skips any
transaction with `category === null` -- so any uncategorized expense vanished from the total. Month
view never showed this because a bypass swaps in the server's accurate `summary.total` for the
current real month; year/week/day have no such bypass. Fixed by adding a category-agnostic
`expenseTotal()` helper (`derive.ts`) and using it for the non-month fallback in both `Summary.tsx`
and `Summary.web.tsx` -- this incidentally also fixes the same latent bug for week and day, not just
year.

**QuickSort now supports editing the merchant name**, mirroring the existing edit pattern already
built for `CategorizeSheet.tsx` (an `editing` boolean + `TextInput` swapped in for the merchant
`<Text>`, Save/Cancel, persisted via the already-existing `editTransaction` action). Scoped to the
merchant name only -- amount wasn't part of this request.

**Home's "Where it went" card was accidentally coupled to the Today/Week/Month toggle** on mobile
(`Home.tsx`) -- switching to "Today" or "Week" also narrowed the category breakdown list, which
should always reflect the current month regardless. (`Home.web.tsx` was already correct -- it never
had this coupling.) Fixed by sourcing `top4` from `currentMonthTransactions` unconditionally instead
of the period-dependent `periodTransactions`. This directly reverses a behavior an existing test
(`Home.test.tsx`) previously asserted on purpose -- that test was rewritten to assert the new,
requested behavior instead.

**Budgets' Subscriptions card now supports manually-added subscriptions** alongside the existing
auto-detected recurring charges. Added a new `Subscription` model/table (name, amount, a new
`FrequencyEnum` of weekly/monthly/quarterly/yearly, next_due) with a `subscriptions` CRUD router
(GET/POST/DELETE), mirroring the existing `CategoryBudget` pattern exactly (per-user table, simple
REST router, no update endpoint needed). Frontend: `TransactionsProvider` now fetches
`subscriptions` alongside everything else and exposes `addSubscription`/`removeSubscription`;
`Budgets.tsx` merges `deriveRecurring(transactions)` (auto-detected, undeletable) with manually-added
ones (deletable) into one list, normalizing non-monthly frequencies to a monthly-equivalent amount
(yearly/12, quarterly/3, weekly*52/12) so the "$X a month across N services" caption stays
meaningful across mixed frequencies. New `AddSubscriptionSheet.tsx` (name/amount/frequency
chips/next-due date, reusing `BottomSheet`/`CategoryChip`/`DateField`) opened via an "Add" button on
the card.

**Tested:** backend `pytest -q` -- 189 passed (+6 new `test_subscriptions.py` cases: create, list
ordering, delete, 404 on missing, per-user scoping). Frontend `jest --runInBand` -- 95 passed across
15 suites (+2 `expenseTotal` cases in `derive.test.ts`, +1 year-view case in `Summary.test.tsx`, +2
merchant-edit cases in `QuickSort.test.tsx`, 1 rewritten case in `Home.test.tsx`, +4 cases in new
`Budgets.test.tsx`). Ran `alembic upgrade head` against local dev Postgres and confirmed via `\d
subscriptions` that the table and `frequency_enum` type exist as designed.

**Manual steps for the human:** this migration also needs to run wherever the deployed Render
backend's database lives, whenever convenient before/during the next deploy.

## Moved Budget & Goals editing from Settings to Budgets; simplified Settings to a single centered column

**Budget & Goals moved off Settings.** The "BUDGET & GOALS" card (edit monthly budget target, edit
savings goal name/target/saved) previously lived in `Settings.tsx`, entirely separate from the
read-only budget/goal displays already on `Budgets.tsx` (the MONTHLY BUDGETS card's total and the
SAVINGS GOAL ring card). Moved the editing UI onto `Budgets.tsx` instead of duplicating a
navigation link between the two: the MONTHLY BUDGETS card now has an "Edit target" link (next to
the existing per-category-limits "Edit" button -- two distinct edit affordances, since editing the
overall monthly target and editing individual category limits are different actions that happened
to share one button's name in the old Settings copy) that reveals an inline edit panel; the goal
ring card gained a small "Edit" link that reveals a name/target/saved-so-far edit panel below it.
Both reuse the already-existing `updateBudget`/`updateGoal` actions from `TransactionsProvider` --
no backend or provider changes needed, this was purely moving UI. Settings' now-empty
`budgetGoalsSection`, its state (`editingBudget`/`budgetDraft`/`editingGoal`/`goalNameDraft`/
`goalTargetDraft`/`goalSavedDraft`), `saveBudget`/`saveGoal`, and the "Manage budgets →" link were
all deleted -- the sidebar already has a direct "Budgets" nav entry, so no navigation gap was left.

**Settings layout simplified to one centered column.** Settings previously branched into a
two-column layout on web (`Platform.OS === "web"` check) vs. a single stacked column on native, with
the removed budget/goals card driving part of that column split. Replaced both branches with a
single column always, centered via `maxWidth: 640` + `alignSelf: "center"` on the content
container (was `maxWidth: 1100` sized for two ~540-wide columns) -- same pattern used elsewhere for
centered-narrow-column screens (e.g. `Login.tsx`'s `maxWidth: 420`). Removed the now-unused
`columns` style and the `Platform` import (no longer branched on anywhere in this file).

**Tested:** frontend `jest --runInBand` -- 95 passed across 15 suites (unchanged count: the two
budget/goal-edit tests moved from `Settings.test.tsx` to `Budgets.test.tsx` verbatim, same
assertions, since the behavior itself didn't change -- only which screen renders the UI). Backend
suite untouched by this change, reconfirmed still 189 passed.

**Manual steps for the human:** none -- purely a frontend UI relocation, no schema or API changes.

## Pie charts now show an Uncategorized slice so their percentages actually tally

**The bug:** the Summary donut and the Home page's "Where it went" donut are both built from
`categoryTotals()`, which silently excludes any transaction with `category === null`. After last
round's fix made the *headline total* (`grand`) correctly include uncategorized spend, this made
the mismatch more visible, not less: the wedges/rows (categorized-only) now summed to noticeably
less than the number shown in the middle of the donut, and each category row's `%` no longer added
up to 100% across the whole breakdown.

**Fix:** in `Summary.tsx`, `Summary.web.tsx`, and `Home.web.tsx` (the three places with an actual
pie/donut chart -- `Home.tsx`'s native "Where it went" is a plain bar list, not a pie, so it has no
"slices don't tally" failure mode and was left alone), fold the period's uncategorized total into
the same `sortedCats` array that feeds both the `Donut` segments and the category-row list, instead
of leaving it out. Added `UNCATEGORIZED_LABEL = "Uncategorized"` (`derive.ts`) as the shared sentinel
category name, and taught `categoryTransactions()` to route to `uncategorized()` when it's asked for
that label, so Summary's existing row-expand-to-see-transactions behavior works for the new row with
zero special-casing in the screen files themselves.

**Uncategorized needed its own color**, not a random hashed hue (`categoryColor()`'s fallback for
any unrecognized id) that could coincidentally look like a real category. `categoryColor`/
`categoryColorChip`/`categoryColorBar` (`theme/tokens.ts`) now special-case `"Uncategorized"` to a
fixed neutral gray (same lightness as normal, chroma forced to 0) rather than hashing it like a
custom category name would be.

**Tested:** frontend `jest --runInBand` -- 96 passed across 15 suites (+1: `Summary.test.tsx` now
asserts an `Uncategorized` row appears with the correct amount/percentage and expands to show its
transactions). `Home.web.tsx`/`Summary.web.tsx` aren't reachable by this project's Jest config at
all (confirmed: Jest has no `.web.tsx` platform resolution configured, so `import Summary from
'../src/screens/Summary'` in any test always resolves to the plain `.tsx` file, never the `.web.tsx`
one -- this predates this change) -- verified instead via `npx expo export -p web`, which compiled
cleanly (678 modules, no errors). Backend untouched, reconfirmed 189 passed.

**Manual steps for the human:** open Summary (year/month/week) and Home in a browser and confirm
an "Uncategorized" gray slice/row now appears whenever there's uncategorized spend in the period,
and that the category percentages sum to 100%.

## Free (Gemini) AI auto-categorization, with a merchant->category cache

**The user had a lot of uncategorized transactions and asked for a free LLM to auto-categorize
them.** Turned out auto-categorization already existed (`hardcoded_category()` regex rules, then
an AI fallback) but the AI step called **Anthropic Claude Haiku**, gated on `LLM_API_KEY` -- which
almost certainly was never set locally (Claude has no literal free tier), so nearly everything was
silently falling through to `None`. Confirmed with the user via `AskUserQuestion`: swap to **Google
Gemini** (genuinely free tier, no card required) -- a full swap, not "alongside Anthropic": removed
the `anthropic` dependency (`pip uninstall anthropic` too, not just the pyproject.toml line) and
`LLM_API_KEY`, replaced with `google-genai` and `GEMINI_API_KEY`.

**Verified the SDK shape by installing it and introspecting the actual package**, not by trusting
recalled or web-fetched docs -- Gemini's Python API has shifted since this project's knowledge
cutoff (a newer "Interactions API" now exists alongside the classic one). `inspect.signature()`
against the installed `google-genai` 2.14.0 confirmed `client.models.generate_content(model=,
contents=, config=GenerateContentConfig(...))` with a plain `.text` accessor is still fully
present and stable, so `ai_category()` (`backend/app/services/categorize.py`) now asks Gemini
(`gemini-2.5-flash-lite`, `thinking_config=ThinkingConfig(thinking_budget=0)` to keep classification
calls fast/cheap) for **plain text** (just the category name), matched case-insensitively against
the 8 known categories -- deliberately simpler than replicating Anthropic's structured-output/
Pydantic-schema approach, since the answer space here is tiny.

**The actual efficiency ask: a merchant->category cache, not per-transaction AI calls.** New
`MerchantCategoryCache` table (`merchant_key` unique index, `category`) -- deliberately **not**
user-scoped, since "STARBUCKS is Food" is a fact independent of whose account synced it, so a
global cache maximizes hits across every user. `categorize_transaction()` now checks this cache
between the hardcoded-rules step and the AI step; a hit skips Gemini entirely. **Also caches manual
corrections**, not just AI results (the user's explicit second ask): `remember_category()`
upserts by merchant, called from `update_category` (every QuickSort/CategorizeSheet recategorize)
and `create_manual_transaction` (manual add with a category picked) as well as from a successful AI
classification -- so a user's correction permanently overwrites any prior (possibly wrong) guess
for that merchant, and every future transaction from it is categorized instantly with zero further
API calls, even for users who never configure a `GEMINI_API_KEY` at all.

**Caught a real bug during testing, not just a hypothetical one**: this project's SQLAlchemy
sessions are all created with `autoflush=False` (`backend/app/db.py` and `tests/conftest.py`
both), so my first draft of `remember_category()` silently failed to make a newly-cached row
visible to a later lookup in the *same* batch/request (e.g. two transactions from the same new
merchant in one sync run) -- a plain `db.add(...)` isn't enough here. Fixed by adding an explicit
`db.flush()` inside `remember_category()`; caught by the new caching tests actually failing on the
first attempt, not by inspection.

**Also added a self-service way to clear the existing backlog**: the backend already had a
`POST /transactions/categorize-pending` backfill endpoint, but nothing in the frontend called it.
Added `categorizePending()` to `client.ts` and a "Try auto-categorize first" button next to
Activity's existing "Quick sort" banner (shown whenever the "Needs a category" filter has rows),
which calls it, toasts a result, and refetches -- this is what actually clears transactions that
already exist, separate from the pipeline change that only affects newly-synced ones.

**Tested:** backend `pytest -q` -- 196 passed (was 189; new cases in `test_categorize.py` for the
Gemini mock swap and the cache write/hit/overwrite behavior, new cases in `test_transactions.py`
confirming `update_category` and manual-add both write/overwrite the cache and that a subsequent
transaction from the same merchant is categorized from the cache with `ai_category` mocked to
raise if called). Frontend `jest --runInBand` -- 98 passed across 15 suites (+2 in
`Activity.test.tsx` for the new button). Applied the new migration locally and confirmed via
`\d merchant_category_cache`; ran the full backend suite again after `pip uninstall anthropic` to
confirm nothing depended on it being present.

**Manual steps for the human:** get a free key at https://aistudio.google.com/apikey (no card
required) and set `GEMINI_API_KEY` in `backend/.env`; run `alembic upgrade head` on the deployed
Render database whenever next deployed, same as every prior schema change in this project.

## Live-tested the Gemini key against the real API and fixed two real issues it surfaced

Once the human set a real `GEMINI_API_KEY`, testing `ai_category()` directly against the live API
(rather than trusting the mocked unit tests alone) surfaced two problems no amount of code review
would have caught:

1. **`gemini-2.5-flash-lite` is already deprecated for new accounts** -- `404 NOT_FOUND: ... no
   longer available to new users`. Queried `client.models.list()` against the real key to find
   what's actually available for this account rather than guessing again, and found
   `gemini-flash-lite-latest` (an alias Google keeps pointed at their current recommended
   lightweight model) works -- switched to that alias specifically so this doesn't need another
   manual fix the next time Google rotates model generations.
2. **`thinking_config=ThinkingConfig(thinking_budget=0)`** (added to keep classification calls
   cheap/fast) **caused an outright `400 INVALID_ARGUMENT`** on this model -- it doesn't accept
   that field. Removed it; the model classifies correctly and fast without it regardless.

Also hit a stale-local-database issue unrelated to the code: `alembic current` showed the dev
Postgres one revision behind head (the `merchant_category_cache` migration wasn't actually applied
-- likely the docker container got recreated at some point after the earlier session applied it).
Re-ran `alembic upgrade head` to fix.

**Also found and fixed a real test-hygiene gap**: once a real key was in `backend/.env`,
`test_categorize_pending_backfills_hardcoded_matchable_rows` started actually calling the live
Gemini API for its "unresolvable merchant" fixture and got a real (non-None) category back,
breaking an assertion that implicitly assumed no AI key would ever be configured locally.
Monkeypatched `ai_category` to `None` in that test specifically, since it's testing the
hardcoded-rule/subcategory-backfill path, not AI behavior -- makes the test deterministic
regardless of what's in whoever's local `.env`.

**Verified end-to-end** with the real key: `ai_category()` correctly classifies real merchant
names (SAIZERIYA -> Food, DAISO JAPAN -> Shopping, SPOTIFY -> Entertainment, an unrecognizable
name -> Other), and `categorize_transaction()`'s cache correctly short-circuits a second call for
the same merchant (confirmed by inspecting the `merchant_category_cache` row directly, not just
trusting the mocked test). Full backend suite re-confirmed at 196 passed after these fixes.

## Made the web build usable on mobile-phone browsers

**The problem**: the web build was only designed for desktop-width browsers. Opening it on an
actual phone browser was broken -- `MainTabs.web.tsx` unconditionally rendered a fixed 236px
`Sidebar` as a flex sibling next to page content with no responsive collapse at all, leaving only
~139px for everything else at a 375px phone width. On top of that, `Home.web.tsx`,
`Summary.web.tsx`, and `Budgets.tsx` all used unconditional `flexDirection: "row"` multi-column
desktop layouts with numeric `flex` ratios that don't wrap or stack. There was **no responsive
infrastructure anywhere** in the codebase (no `useWindowDimensions`, no breakpoint hook) -- built
from scratch.

**New `app/src/hooks/useIsMobileWeb.ts`** (new `hooks/` directory, no prior convention): exports
`isMobileWebWidth(platformOS, width, breakpoint = 640)` as a pure function (so it's unit-testable
with plain arguments, sidestepping the fact that jest-expo's haste `defaultPlatform` is always
`"ios"`, so `Platform.OS` can't be meaningfully mocked to `"web"` in a real Jest test) plus
`useIsMobileWeb()` wrapping it with real `useWindowDimensions()`. Breakpoint is 640, matching
`Settings.tsx`'s own single-column `maxWidth: 640` so "mobile" has one consistent meaning already
established in the app. Gates on `Platform.OS === "web"` internally, so it's always `false` on
native and safe to call unconditionally from a shared file like `Budgets.tsx` without touching
native's behavior at all.

**Reused the native app's existing bottom tab bar instead of inventing a new mobile nav pattern**:
`app/src/navigation/TabBar.tsx` (blur background, safe-area-aware, already includes a `Budgets`
icon) was already built for native and already passed to the same `createBottomTabNavigator` that
`MainTabs.web.tsx` uses (previously forced to `tabBar={() => null}` since the Sidebar substituted
for it). `MainTabs.web.tsx` now branches on `useIsMobileWeb()`: desktop keeps the Sidebar +
`PageHeader` + hidden tab bar exactly as before; mobile drops the Sidebar and swaps in `tabBar={(props) => <TabBar {...props} />}` -- zero changes needed to `TabBar.tsx` itself, since `Tab.Navigator` already had all 5 routes registered.

**`PageHeader.tsx` restyles rather than disappearing on mobile** -- it's the only page-title
source for `Home.web.tsx`/`Summary.web.tsx`/`Budgets.tsx` (none have an in-content title the way
native `Home.tsx` does). On mobile it stacks to a column and the Activity-only search box (fixed
230px on desktop, squeezed next to the avatar) moves to its own full-width row below the title
instead of being dropped -- search stays reachable on phones.

**`Home.web.tsx`/`Summary.web.tsx`/`Budgets.tsx` each got the same treatment**: a local `rowFlex(n)`
helper that returns `{flex: n}` on desktop and `undefined` on mobile (so a stacked card takes its
own natural full width instead of stretching by a ratio that only makes sense in a row), applied
to every page-level `styles.row` split; `content`'s padding switches from a flat `paddingBottom: 56`
to `spacing.screenBottom` (96, the same constant native screens already use) so stacked content
doesn't hide behind the new mobile tab bar. `Summary.web.tsx`'s 3-across `yearGrid` tiles are
already percentage-based (`width: "31%"`) and left as-is -- self-reflows at any width, flagged for
manual QA rather than pre-emptively redesigned.

**Tested:** `jest --runInBand` -- 113 passed across 20 suites (+17: a new `useIsMobileWeb.test.ts`
testing the pure breakpoint function directly; new `MainTabsWeb.test.tsx`, `PageHeader.test.tsx`,
`HomeWeb.test.tsx`, `SummaryWeb.test.tsx` -- **the first Jest coverage these `.web.tsx` files have
ever had**, since jest-expo's haste resolver defaults to `ios` platform and silently substitutes
the native sibling for any extensionless import, so these new files import via the explicit `.web`
path and mock `useIsMobileWeb` directly to exercise both branches; plus 2 new cases in the existing
`Budgets.test.tsx`). Added minimal `testID`s to the stacked row containers (`home-hero-row`,
`summary-chart-row`, `budgets-row`, etc.) purely so tests could assert on `flexDirection` directly.
`npx expo export -p web` re-confirmed a clean compile (no errors).

**Not verified**: actual visual layout at real phone pixel widths -- no browser-automation tool is
available in this environment (confirmed via `ToolSearch`), and RTL's test renderer doesn't perform
real flexbox layout/measurement, so it can only assert *intended* styles, not resulting pixel
layout. This needs a manual pass.

**Manual steps for the human:** run `npm run web`, open Chrome DevTools' device toolbar at
320/375/393/428px and confirm: no horizontal scroll/overflow anywhere, the bottom tab bar (all 5
routes including Budgets) replaces the sidebar and is fully tappable, every card on
Home/Summary/Budgets stacks to full-width and is legible, the Activity search box is reachable and
functional, scrolling to the bottom of any screen doesn't hide content behind the tab bar, and
`Summary`'s year-view month tiles are legible at the smallest widths (fallback if not: an
`isMobile && { width: "48%" }` override for 2-across instead of 3, same pattern as the other gated
styles). Also spot-check desktop web (>640px) still looks pixel-identical to before.

## Password-based account registration/login, decoupled from email OAuth linking

**The user's complaint**: they always had to redo the full Gmail/Outlook OAuth "link an email"
flow to get back into the app. Root-caused (not assumed): `AuthProvider.tsx`'s launch-time session
check (`getUser(storedId)`) treated *any* failure -- including a plain network/timeout error from
Render's free-tier backend still cold-starting -- identically to "this user id doesn't exist,"
wiping the locally stored session and dropping the user onto `Login.tsx`, whose only affordance was
OAuth (hardcoded to `prompt=consent`, forcing a full re-consent screen every time, not a quick
re-auth). Confirmed with the user via `AskUserQuestion`: fix that bug **and** still add a
decoupled password-based registration/login on top, so signing back in never depends on OAuth (or
cold-start timing) at all -- email linking becomes purely a Settings-level action for the
bank-alert-parsing feature (already supported there, unchanged), not the login mechanism.

**Mid-implementation discovery, surfaced before continuing rather than silently working around
it**: applying the new migration revealed `backend/.env`'s `DATABASE_URL` now points at a
**Supabase-hosted Postgres**, which has its own separate, full-featured built-in `auth.users`
table (Supabase Auth/GoTrue -- real sessions, email verification, password reset) completely
independent of this app's own `public.users` table. This meant a genuinely better foundation
(real tokens instead of hand-rolled hashing) was available for the taking -- flagged it via
`AskUserQuestion` rather than silently either using it or ignoring it. User chose to stick with the
already-approved hand-rolled approach for now (smaller, self-contained, ships faster); switching to
Supabase Auth was explicitly deferred, not rejected, as a bigger separate effort (new dependency,
JWT verification in FastAPI, rethinking the whole API's `user_id`-trust model).

**1. The actual bug fix** (`app/src/store/AuthProvider.tsx`, `app/src/api/client.ts`): added
`ApiError` (carries the HTTP status) so a confirmed `404` can be told apart from a network/timeout
failure, which throws a plain `Error`/`TypeError` instead. The launch check now only clears
`AsyncStorage` on a real 404; anything else retries up to 3 times with backoff (0s, +3s, +7s --
covers most Render cold-starts with zero user action), and only after all retries fail does it
surface a new `sessionError` state (`App.tsx`'s new `SessionErrorScreen`, "Couldn't reach the
server -- Retry") instead of silently treating a slow backend as a logout.

**2. Backend password support** (`backend/app/models.py`, new Alembic migration, new
`backend/app/security/passwords.py`, `backend/app/routers/auth.py`): added a nullable
`password_hash` column to `User` (nullable since OAuth-only accounts never set one). Hashing uses
stdlib `hashlib.pbkdf2_hmac` with a random salt (600k iterations) -- no new dependency, avoided
since `cryptography` (already a dependency) is used for a different concern (OAuth token
encryption) and stdlib PBKDF2 is a well-established, sufficient choice here. New
`POST /auth/register` (creates a new account, or -- if the email already exists from a prior OAuth
link with no password set -- **attaches** a password to that same identity instead of fragmenting
into two accounts; 409s only if a password is already set) and `POST /auth/login` (a single
generic 401 "Invalid email or password" for wrong-password/unknown-email/OAuth-only-no-password
alike, standard practice, no extra cost to do correctly).

**3. Frontend** (`app/src/screens/Login.tsx`): added an email/password form (Sign in / Create
account toggle) above the existing, unchanged OAuth buttons -- both paths remain fully valid.
Reuses the existing `login(user.id)` action from `AuthProvider` unchanged. Confirmed
`Settings.tsx`'s existing "connect an additional mailbox" flow already supports linking Gmail/
Outlook to an *already logged-in* user with zero changes needed -- it just had no reason to be used
before, since OAuth was also the only way to log in in the first place.

**Explicitly out of scope, stated plainly rather than silently decided**: this does not add real
session tokens across the API. Every endpoint still trusts a client-supplied `user_id` with no
verification (documented in `client.ts` as "one device logged into one user") -- a password *gate
at login* doesn't change that trust model, and retrofitting bearer-token auth everywhere is a much
larger, separate change.

**Tested:** backend `pytest -q` -- 203 passed (+15 in `test_auth.py`: register creates a hashed,
never-plaintext, never-returned password; duplicate registration on a password-having account
409s; registering on an existing password-less OAuth account attaches a password instead of
erroring; login succeeds/401s correctly for right password, wrong password, OAuth-only account, and
unknown email). Frontend `jest --runInBand` -- 122 passed across 21 suites (+15: new
`AuthProvider.test.tsx` covering the 404-vs-network-error distinction and retry-then-recover via
`retryAuth()`, using fake timers wrapped in `act()` -- needed after discovering bare
`jest.advanceTimersByTimeAsync()` calls don't reliably flush a promise-driven state update into the
rendered tree without it; new cases in `Login.test.tsx` for register/sign-in success and 401/409
handling; one existing `App.test.tsx` case updated from a generic mocked `Error('404')` to a real
`ApiError(404)`, since a bare Error is now correctly treated as a retryable connectivity failure,
not a confirmed logout -- that distinction is the entire point of the fix).

**Manual steps for the human:** this migration already ran against the live Supabase database while
diagnosing the discovery above (confirmed via `alembic current` -> head) -- no separate step
needed unless a different environment/database is used for deployment. Register a test account
through the app, close and reopen it, confirm it goes straight to Home with no OAuth prompt.

## Also removed hardcoded prompt=consent from Google/Microsoft OAuth

Small follow-up once the user asked *why* Microsoft always re-asked for mail permission: two
separate things were going on. `Mail.Read`/`gmail.readonly` is genuinely required (that's the
whole feature) and isn't going anywhere -- but `prompt=consent` was also hardcoded on every single
authorization request in both `google_oauth.py` and `ms_oauth.py`, forcing the *full* consent
screen even on a repeat connect for an already-authorized account. Removed it from both. Google's
refresh_token is only issued on the very first consent per user+client+scope once this is removed,
but `_upsert_email_account` (`routers/auth.py`) already only overwrites the stored refresh token
when the response actually includes one, so a repeat grant correctly keeps the existing token
instead of losing it -- verified this by reading the code, not assumed. `pytest -q` -- 203 passed,
unaffected (no test asserted on `prompt` being present).

## Transaction detail sheet now shows time; credit transactions get their own category list

Two related gaps, found by tracing the code rather than assumed:

1. **QuickSort showed date+time; Activity's tap-to-open detail sheet (`CategorizeSheet.tsx`) only
   showed a bare date** -- it called `new Date(...).toLocaleDateString()` directly instead of the
   shared `formatDateTime` helper `QuickSort.tsx` already used. Fixed by switching to the same
   helper, so both screens now show the identical "23 Jul, 3:45 PM" format.

2. **Every category picker showed the same fixed 8 expense categories (Food, Groceries, Transport,
   ...) regardless of whether the transaction was a debit or a credit** -- confirmed
   `allCategories()` had no direction concept at all, and `AddTransactionSheet.tsx`, despite
   already having its own Expense/Income toggle, didn't use it to change the category list. A
   salary deposit had to be filed under something like "Groceries." `QuickSort.tsx` needed no
   change -- its queue only ever contains debit transactions by construction (`uncategorized()`
   filters on `isExpense`).

**New preloaded credit-category list** (`app/src/theme/tokens.ts`'s `CREDIT_CATEGORIES`, mirrored
in `backend/app/services/categorize.py`'s `CREDIT_CATEGORIES` -- same independent-duplication
pattern the debit `CATEGORIES` list already has between frontend/backend, no shared-constants
infra exists to dedupe it): `Salary`, `Transfer Received`, `Refund`, `Reimbursement`, `Interest`,
`Gift`, `Investment`, `Other Income`. `Transfer Received` specifically covers the PayNow-received
alerts this app already parses. Each got a curated hue in a new `CREDIT_CATEGORY_HUES` map, same
"designed, not random" treatment the 8 expense categories already get -- `hueFor()` now checks
`CATEGORY_HUES ?? CREDIT_CATEGORY_HUES ?? hashHue(id)`, so every existing color call site needed no
changes itself.

**Frontend**: `allCategories(customCategories, direction = "debit")` -- `"credit"` returns the new
list untouched (custom categories stay debit-only for now; Settings' Manage Categories UI has no
direction concept, and adding one is a bigger feature not asked for here). Wired into
`CategorizeSheet.tsx` (`transaction?.direction`) and `AddTransactionSheet.tsx` (its existing
`direction` state) -- the latter also now resets `category`/`subcategory` when the Expense/Income
toggle is pressed, since a category picked under one direction may not exist in the other's list.

**Backend auto-categorization got the same fix, not just the manual picker** -- otherwise every
sync would keep reintroducing wrong categories on auto-parsed credit alerts (e.g. PayNow received).
`categorize_transaction()` gained a `direction` param: credit transactions skip
`hardcoded_category()` entirely (its regex rules -- NTUC, Grab, Starbucks -- are all
expense-merchant patterns) and go straight to a credit-scoped cache/AI classification;
`ai_category()` gained a `categories` param so one function serves either list instead of
duplicating the Gemini-calling logic. **Also fixed a real latent bug while doing this**: the
merchant->category cache key wasn't scoped by direction at all, so a debit and credit transaction
that happened to share a merchant string would have silently shared one cached category across two
unrelated taxonomies -- now the cache key is `f"{direction.value}:{merchant}"`, no migration
needed since `merchant_key` was already a plain string column.

**Tested:** backend `pytest -q` -- 206 passed (+3 new cases: credit transactions skip hardcoded
rules and classify against `CREDIT_CATEGORIES`; a merchant string shared between a debit and
credit transaction gets independently cached categories, not a shared one; existing cache-key
assertions in `test_transactions.py` updated for the new `"debit:..."`-prefixed key format).
Frontend `jest --runInBand` -- 130 passed across 21 suites (+7: `derive.test.ts` cases for
`allCategories`'s new direction param; `Activity.test.tsx` cases for credit-category chips
appearing/not-appearing correctly by direction, categorizing a credit transaction end-to-end, the
detail sheet showing a time, and the Add Transaction Income toggle swapping categories and clearing
a stale pick).

**Manual steps for the human:** none -- purely additive, no schema changes.

## "Connecting…" loading screen for Render cold-starts; centered Manage Categories layout

On the free Render plan the backend spins down after inactivity, so opening the app after a while
previously showed a genuinely blank screen (just the canvas background color, no text/spinner) for
however long the cold-start took -- at two separate points: `App.tsx`'s `!ready` gate (while
`AuthProvider` verifies the stored session, already backoff-retried from an earlier fix but
rendered blank the whole time) and the initial data load (`TransactionsProvider` mounts
unconditionally after auth resolves, and every screen independently blanked out via its own
`if (loading) return <View testID="X-screen" />` guard while the first `refetch()`'s 8 parallel API
calls were in flight).

**`app/App.tsx`**: new `ConnectingScreen` component (same local-component pattern as the existing
`SessionErrorScreen`) -- a centered `ActivityIndicator` + "Connecting…" text, reused at both gates
via a `testID` prop. The `!ready` gate now renders it instead of a blank view. A new
`AuthenticatedApp` component (a child of `TransactionsProvider`, reading its `loading` via
`useAppData()`) renders `ConnectingScreen` while the initial load is in flight and only mounts
`NavigationContainer`/`RootNavigator` once it's done -- confirmed `loading` is a one-time flag that
never re-fires on later manual refetches, so this single gate covers every tab's cold-start blank
screen without touching Home/Summary/Activity/Budgets/Settings's own `loading` guards (left as-is;
they still serve their other conditions like `!budget`/`!goal`). The outer font-loading gate in
`App()` stays a plain blank view -- custom fonts genuinely aren't loaded yet at that point, so a
styled "Connecting…" screen can't render there, and it's a near-instant JS-bundle concern, not the
cold-start scenario being fixed.

**`app/src/screens/ManageCategories.tsx`**: its `content` style had no `maxWidth`/`alignSelf`
treatment, so its cards stretched full-width on web unlike Settings' already-centered single
column. Added the same `maxWidth: 640, width: "100%", alignSelf: "center"` Settings.tsx's `content`
style already has -- every card on the page is plain flex-based single-column with no fixed widths,
so centering just the outer wrapper was sufficient.

**Tested:** frontend `jest --runInBand` -- 133 passed across 21 suites (+3: `App.test.tsx` cases
asserting `auth-loading`/`app-loading` render "Connecting…" instead of a blank view or the tab bar
while the session check and initial data load are respectively still pending;
`ManageCategories.test.tsx` case asserting the screen's `contentContainerStyle` includes the
centering properties).

**Manual steps for the human:** none -- purely UI, no schema or API changes.

## Fixed a Render deploy-breaking syntax error, then built overseas spending: Travel category, YouTrip email parsing, country detection & filtering

**Deploy fix first:** `_normalize_merchant_key` (`categorize.py`) had `re.sub(r'\s+', ' ',
merchant)` inline inside an f-string's `{}` expression -- a `SyntaxError` on Python 3.11 (Render's
runtime) even though it's legal on 3.12+ (this machine's local Python), so the bug was invisible
until the crash showed up in Render's deploy logs. Fixed by extracting the `re.sub` call to a local
variable before the f-string. (This landed as a separate commit the human pushed directly while the
main feature below was still in progress.)

**The feature:** overseas spending was previously invisible -- no "country" concept anywhere, every
bank email parser hardcoded `currency="SGD"` with an amount regex that structurally couldn't match a
non-SGD amount, and subcategories were never a generic per-category mechanism (only Food/Transport
were special-cased, both algorithmically derived, not static lists). Scoped to YouTrip only for
now, per explicit instruction -- other banks' overseas-alert formats are unknown.

**New built-in "Travel" category** (`app/src/theme/tokens.ts` + `backend/app/services/categorize.py`,
same hand-duplicated-constants convention as every other built-in category list) with a genuinely
static subcategory list -- Food, Groceries, Transport, Shopping, Entertainment, Accommodations --
via a third branch in `subcategoriesFor()`/dispatched independently of `subcategory_for()` (which
only knows Food/Transport). `ManageCategories.tsx` needed no changes -- it's already fully generic
over `CATEGORIES`/`subcategoriesFor()`.

**Currency -> country derivation** (`app/src/utils/derive.ts`, frontend-only, no schema change): a
curated ~20-entry `CURRENCY_COUNTRY` map (SGD->Singapore, CHF->Switzerland, etc.) plus
`countryForCurrency()`/`countriesInTransactions()`, falling back to the raw currency code for
anything unmapped. The backend doesn't need this map at all -- it only ever needs `currency !=
"SGD"` as the overseas signal, so country *names* stay purely a frontend display/filter concern,
consistent with this app's existing "everything filterable is derived client-side" pattern (no new
`GET /transactions` query param, matches how category/search filtering already works).

**YouTrip email parsing** -- built from 2 real screenshots the human shared of an actual YouTrip
"Summary of your recent online purchases & ATM withdrawals" alert (sender
`noreply=you.co@mail.you.co`, VERP-shaped -- flagged with the same "not directly confirmed, check
the real address first" caveat this file already has for PayLah!). This is a rolling "last 24
hours" digest that can list multiple transactions in one email, each showing a merchant, a stable
per-transaction "Ref. No:", an amount as `{ISO currency code} {amount}` (not S$-prefixed like every
other bank here), and a bare time-of-day with **no date at all**. Two real architecture changes,
not just a new regex:
1. **One email -> many transactions.** `parse_email(text, sender, received_at)` changed from
   returning `ParsedTxn | None` to `list[ParsedTxn]`; every existing single-transaction parser
   (DBS/UOB/SimplyGo) now returns `[ParsedTxn(...)]`/`[]` instead, zero behavior change for them.
   `ParsedTxn` gained `dedup_suffix: str | None`, which YouTrip sets to its own Ref. No so
   `sync.py` can build a per-transaction dedup key (`f"{message_id}:{dedup_suffix}"`) instead of
   every transaction in one digest colliding on the email's own id.
2. **Date inference from the email's own received timestamp**, not the body (which has none) --
   both `gmail.py` (parses the already-present `internalDate`) and `graph.py` (added
   `receivedDateTime` to `fetch_message`'s `$select`) gained a `get_received_at(message)` function.
   For a rolling "last 24 hours" digest, a transaction's time-of-day later than the email's own
   received time can only mean the day before -- done **per transaction**, not once per email,
   since a single digest can straddle midnight.

Auto-categorization: `categorize_transaction()` gained a `currency` param -- any non-SGD currency
skips the normal hardcoded-rules/CATEGORIES path entirely and classifies straight against
`TRAVEL_SUBCATEGORIES` via the same `ai_category(merchant, bank, categories=...)` mechanism already
used for `CREDIT_CATEGORIES`, setting `category="Travel"` unconditionally and returning directly
(bypassing the trailing `subcategory_for()` call, which would otherwise null out the Travel
subcategory just set). The merchant cache's scope param was generalized from
`direction: DirectionEnum` to a plain `scope: str` ("debit"/"credit"/"travel") since overseas-ness
is orthogonal to money-flow direction -- a Travel purchase is still `direction=debit`. Two gaps
caught in review before shipping: `categorize_pending`'s backfill path needed `currency` threaded
through too (not just the live sync path, or a pre-existing uncategorized YouTrip row would never
route to Travel when backfilled); and the existing Grab-reconciliation shortcut in `sync.py` now
only runs for SGD transactions, so an overseas Grab ride paid via YouTrip routes through Travel
instead of being swept into the local (SGD-only) Grab-receipt lookup.

**Manual entry** (`AddTransactionSheet.tsx`) previously had zero currency support at all (hardcoded
"S$", no field sent to the backend even though `TransactionCreateIn.currency` already existed
server-side). Added a currency chip row; picking non-SGD auto-selects Travel (still
user-overridable), mirroring the existing direction-toggle's reset pattern.

**Country filtering** -- Activity.tsx gained a second pill row (hidden unless >1 country present);
Summary.tsx/Summary.web.tsx gained a country selector that pre-filters every downstream computation.
Caught and fixed one real edge case: both files' headline total had a shortcut using the backend's
own unfiltered `/summary` total when viewing the current real month -- now disabled whenever a
country filter is active, or the total would silently ignore the filter. Also extended the existing
`cat === "Food" || cat === "Transport"` subcategory-breakdown special case to include `"Travel"`.

**Currency-aware display**: `formatMoney()` gained an optional `currency` param (default unchanged
"S$..." behavior) -- wired into Activity's transaction rows and CategorizeSheet's detail view,
which already fetched `currency` but never displayed it. Day/period aggregate totals intentionally
stay S$-formatted (summing mixed currencies has no single correct symbol).

**Tested:** backend `pytest -q` -- 216 passed (+19: YouTrip parser cases including a real
multi-transaction-per-digest test with per-item midnight-rollover date inference built from the
actual screenshot text; end-to-end sync tests confirming multi-transaction dedup and the
currency-gated Grab check, both against a real Gemini API call since a key is configured locally;
overseas/Travel categorization + independent cache-scope tests; the `categorize_pending`
currency-backfill gap). Frontend `jest --runInBand` -- 152 passed across 21 suites (+19: currency/
country derivation, Travel category chips in Manage Categories, the Activity/Summary country filter
pill rows shown/hidden by country count and their filtering behavior, the Summary `grand`-shortcut
edge case in both native and web, the manual-entry currency picker's auto-Travel-category behavior,
currency-aware amount display).

**Manual steps for the human:** none for the code itself. Once a real YouTrip email has synced
through the live app, check the parsed merchant/amount/category/subcategory/date against what
actually landed -- the regex was built from 2 screenshots (rendered, not raw HTML/plain-text
source), so the token order is inferred from the visual layout, not confirmed against real
extracted text; a non-matching email just silently produces no transaction (never a crash), so this
is safe to have shipped best-effort and refine against real data.
