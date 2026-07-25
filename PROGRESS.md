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

**Manual steps for the human (Phase 8's DoD explicitly requires a real-device check):**
1. Make sure `ngrok http 8000` is running and `backend/.env`'s `GOOGLE_REDIRECT_URI` /
   `MS_REDIRECT_URI` match its current URL (same as every prior phase's manual OAuth test).
2. In `app/`, confirm `.env`'s `EXPO_PUBLIC_API_BASE_URL` matches that same ngrok URL, then
   `npx expo start` and scan the QR code with Expo Go on your phone.
3. Tap "Connect Gmail" (or Outlook) -- sign in -- confirm the in-app browser closes automatically
   and the screen updates to "Connected as your@email" without you manually backing out.
   This exact end-to-end mobile flow can't be verified from this machine (no simulator, and the
   deep-link auto-close behavior is meaningful only on a real device/Expo Go session) -- it's the
   one part of Phase 8 that genuinely needs your hands.
