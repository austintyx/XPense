# BUILD PLAN — Auto Expense Tracker (email-parsing backend + mobile app)

> This document is the build specification for **Claude Code**. Read it fully before writing
> any code. Build **one phase at a time, in order**. Do not start a phase until the previous
> phase's **Definition of Done** passes. Each phase has automated tests that must be green
> before advancing.

---

## 0. Working agreement (how Claude Code should operate)

1. **Phase gate:** implement a phase → write its tests → run them → all green → commit → only then move on.
2. **Never skip tests.** Every phase has a "Tests" section. Write those tests as real, runnable tests (pytest for backend, Jest/React Native Testing Library for the app). If a test can't pass, stop and report why — do not proceed.
3. **Commit per phase** with message `Phase N: <name>` so progress is reversible.
4. **Keep secrets out of code.** Everything sensitive comes from environment variables / `.env` (git-ignored). Provide `.env.example` with placeholder keys.
5. **Ask before assuming external credentials.** OAuth client IDs, DB URLs, and API keys are provided by the human. Where a real credential is required to proceed, implement the code, write the test as skippable-if-no-credential, and print clear setup instructions.
6. **Update `PROGRESS.md`** after each phase: what was built, how it was tested, what the human must do manually (e.g., register an OAuth redirect URI).

---

## 1. Product summary

An app that automatically tracks expenses by reading the user's **bank alert emails**. The user connects an email account (Gmail or Outlook); the backend reads only bank-sender emails, parses each into a transaction (amount, merchant, date), and the mobile app displays and lets the user categorize them.

**Non-goals / known limits (do not attempt):**
- Do NOT try to read phone push notifications or Apple Wallet data — impossible on iOS and out of scope.
- Apple Pay / contactless spends that produce no email are unsupported; provide a manual-add path instead.
- Transfers between the user's own accounts and person-to-person PayNow are NOT expenses — parse them but mark them `type = transfer` and exclude from spend totals.

---

## 2. Locked tech stack (do not substitute without asking)

| Layer | Choice | Notes |
|---|---|---|
| Mobile app | **Expo (React Native) + TypeScript** | Runs on iOS + Android from one codebase |
| Backend | **Python 3.11 + FastAPI** | Chosen for strong email-parsing / future LLM work |
| DB access | **SQLAlchemy 2.x + Alembic** (migrations) | |
| Database | **PostgreSQL** (local Docker in dev; Supabase or Railway in prod) | |
| Backend tests | **pytest** + httpx `AsyncClient` | |
| App tests | **Jest + @testing-library/react-native** | |
| Scheduler | **APScheduler** (polling) | Upgrade to push later |
| Auth to email | **Gmail API** (`gmail.readonly`) + **Microsoft Graph** (`Mail.Read`) | |
| Local tunneling | **ngrok** | For OAuth callbacks in dev |

---

## 3. Repository layout (create this in Phase 0)

```
expense-tracker/
├── BUILD_PLAN.md
├── PROGRESS.md
├── docker-compose.yml          # local Postgres
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   ├── alembic/                # migrations
│   ├── app/
│   │   ├── main.py             # FastAPI entrypoint
│   │   ├── config.py           # settings from env
│   │   ├── db.py               # engine/session
│   │   ├── models.py           # SQLAlchemy models
│   │   ├── schemas.py          # Pydantic models
│   │   ├── routers/
│   │   │   ├── health.py
│   │   │   ├── transactions.py
│   │   │   └── auth.py         # OAuth endpoints
│   │   ├── services/
│   │   │   ├── gmail.py
│   │   │   ├── graph.py        # Microsoft Outlook
│   │   │   ├── parser.py       # regex + LLM parsing
│   │   │   └── scheduler.py
│   │   └── security/crypto.py  # token encryption
│   └── tests/
│       ├── fixtures/emails/    # sample bank email bodies (see §7)
│       ├── test_health.py
│       ├── test_transactions.py
│       └── test_parser.py
└── app/                        # Expo project
    ├── package.json
    ├── app.json
    ├── src/
    │   ├── api/client.ts
    │   ├── screens/ConnectEmail.tsx
    │   ├── screens/Transactions.tsx
    │   └── screens/Summary.tsx
    └── __tests__/
```

---

## 4. Data model (create in Phase 1)

```
users(id PK, email, created_at)

email_accounts(id PK, user_id FK, provider ENUM('google','microsoft'),
               provider_email, access_token_enc, refresh_token_enc,
               expires_at, last_synced_at, created_at)

transactions(id PK, user_id FK, source_email_id UNIQUE, provider,
             amount NUMERIC(12,2), currency, direction ENUM('debit','credit'),
             type ENUM('expense','transfer','income') DEFAULT 'expense',
             merchant_raw, merchant_clean, category, txn_at TIMESTAMPTZ,
             bank, raw_parsed JSONB, created_at)

categories(id PK, user_id FK, name, icon)
```

`source_email_id` is UNIQUE → guarantees no double-counting. Tokens are stored **encrypted** (`*_enc`).

---

## 5. Environment variables (`backend/.env.example`)

```
DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/expenses
TOKEN_ENCRYPTION_KEY=            # 32-byte base64 (Fernet)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://<your-ngrok>.ngrok.io/auth/google/callback
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_REDIRECT_URI=https://<your-ngrok>.ngrok.io/auth/microsoft/callback
LLM_API_KEY=                     # optional, Phase 7 only
```

---

## 6. PHASES

Each phase: **Objective → Implement → Tests → Definition of Done (DoD)**. Advance only when DoD passes.

### Phase 0 — Scaffolding & tooling
**Objective:** empty but runnable repo, both apps boot.
**Implement:** repo layout (§3); `docker-compose.yml` with Postgres; FastAPI app with nothing but startup; Expo app showing a blank screen; configure pytest and Jest.
**Tests:**
- `pytest` runs and collects 0 failures (a trivial `test_smoke` asserting `True`).
- `npm test` in `app/` runs the default passing test.
**DoD:** `docker compose up` starts Postgres; `uvicorn app.main:app` boots without error; Expo app opens in Expo Go; both test runners are green.

---

### Phase 1 — Health endpoint + DB schema + migrations
**Objective:** backend talks to Postgres; schema exists.
**Implement:** `GET /health` returns `{"ok": true}`; SQLAlchemy models (§4); Alembic migration that creates all tables; `config.py` reads `DATABASE_URL`.
**Tests (`test_health.py`):**
- `GET /health` → 200 and `{"ok": true}`.
- A DB test spins up tables (test DB), inserts a `user`, reads it back.
**DoD:** `alembic upgrade head` creates all tables; health + DB round-trip tests green.

---

### Phase 2 — Transactions API (with fake data)
**Objective:** the API contract the app depends on, before any email logic.
**Implement:**
- `GET /transactions?user_id=` → list, newest first, expenses only by default.
- `POST /transactions/{id}/category` body `{ "category": "Food" }` → updates, returns row.
- `POST /transactions` (manual add) → for the Apple-Pay-no-email fallback case.
- `GET /summary?user_id=` → totals per category for current month.
- Seed script inserts fake transactions for local testing.
**Tests (`test_transactions.py`):**
- List returns seeded rows in correct order.
- Category update persists and is reflected on next GET.
- Manual add creates a row.
- Summary sums categories correctly and **excludes** rows where `type='transfer'`.
**DoD:** all four endpoints covered by passing tests.

---

### Phase 3 — Gmail OAuth
**Objective:** user can authorize Gmail; a refresh token is stored (encrypted).
**Implement:**
- `GET /auth/google` → redirect to Google consent (scope `gmail.readonly`, `access_type=offline`, `prompt=consent`).
- `GET /auth/google/callback` → exchange code, encrypt tokens (Fernet via `security/crypto.py`), upsert into `email_accounts`.
- Token refresh helper that re-mints access tokens from the refresh token.
**Tests:**
- `crypto.py` encrypt→decrypt round-trip test.
- Callback handler test with a **mocked** Google token response → asserts an `email_accounts` row is written with encrypted (non-plaintext) tokens.
**DoD:** unit tests green; `PROGRESS.md` documents the manual step (register ngrok redirect URI in Google Cloud Console, add self as test user). Real end-to-end auth verified once manually by the human.

---

### Phase 4 — Email fetch + parse (regex)
**Objective:** turn real bank emails into transaction rows. **This is the core.**
**Implement:**
- `services/gmail.py`: list messages matching a bank-sender query (e.g. `from:(dbs.com.sg OR uob.com.sg OR simplygo) newer_than:60d`), fetch each, base64url-decode body, strip HTML → text.
- `services/parser.py`: `parse_email(text, sender) -> ParsedTxn | None`. Per-bank regex extractors (see §7 fixtures). Classify `type`:
  - own-funds transfer between user's accounts → `type='transfer'`
  - PayNow to a person (mobile/NRIC) → `type='transfer'` (configurable)
  - merchant/UEN payment, card spend, transit fare → `type='expense'`
- Insert parsed rows; dedupe on `source_email_id`.
**Tests (`test_parser.py`) — use fixtures in §7, no network:**
- Each sample email parses to the expected amount, merchant, date, bank, direction.
- DBS "Own Funds Transfer" → `type='transfer'`.
- NETS/PayNow-to-merchant → `type='expense'`.
- Re-parsing the same email does NOT create a duplicate row.
- An unparseable email returns `None` (and is later routed to Phase 7).
**DoD:** every fixture in §7 has a passing assertion; dedup test green.

---

### Phase 5 — Sync scheduler + endpoint
**Objective:** new emails become transactions automatically.
**Implement:** `POST /sync?user_id=` runs a full parse pass; APScheduler job runs it every 10 min per linked account; update `last_synced_at`; only fetch mail newer than last sync.
**Tests:**
- `/sync` with a mocked Gmail service inserts N new transactions.
- Second `/sync` with no new mail inserts 0 (idempotent).
**DoD:** sync is idempotent and covered by tests.

---

### Phase 6 — Outlook (Microsoft Graph)
**Objective:** provider selection works; Outlook parity with Gmail.
**Implement:** `/auth/microsoft` + callback (scope `Mail.Read`, offline access); `services/graph.py` mirrors `gmail.py`; parser is provider-agnostic. The app's "user selects email type" feature is satisfied by having both providers write to the same tables via the `provider` column.
**Tests:** Graph callback writes an encrypted `email_accounts` row (mocked); a mocked Graph message list flows through the same parser and produces transactions.
**DoD:** both providers reach identical transaction output through one parser.

---

### Phase 7 — LLM fallback parser (optional but recommended)
**Objective:** handle messy / unknown senders regex can't.
**Implement:** if regex returns `None`, call an LLM with a strict prompt: "Return JSON {amount, currency, merchant, datetime, direction} or null." Validate against a Pydantic schema; reject hallucinated fields. Cache by sender template to avoid repeat cost.
**Tests:** with a mocked LLM response, an otherwise-unparseable fixture yields a valid transaction; malformed LLM output is rejected safely (no crash, row not created).
**DoD:** fallback path tested with mocked LLM; never blocks the regex path.

---

### Phase 8 — App: Connect Email screen
**Objective:** user links Gmail/Outlook from the phone.
**Implement:** `ConnectEmail.tsx` with two buttons; use `expo-auth-session` / `expo-web-browser` to open the backend OAuth URL and return to the app; show linked-account status from the backend.
**Tests:** component renders both provider buttons; tapping calls the auth handler (mocked); linked state renders when the API reports an account.
**DoD:** app tests green; manual check: real Gmail link works on device.

---

### Phase 9 — App: Transactions + categorize + summary
**Objective:** the usable product.
**Implement:** `Transactions.tsx` (list from `GET /transactions`, pull-to-refresh, tap → category picker → `POST` category); `Summary.tsx` (per-category totals from `GET /summary`, simple chart via `victory-native`). `api/client.ts` centralizes calls.
**Tests:** list renders mocked API data; selecting a category fires the correct POST; summary renders category totals.
**DoD:** app tests green; manual end-to-end: connect Gmail → real transactions appear → categorize → summary updates.

---

### Phase 10 — Security hardening
**Objective:** safe enough to run with real inboxes.
**Implement:** confirm tokens encrypted at rest; enforce bank-sender allowlist before reading any body; do NOT persist full email bodies (keep only `raw_parsed` extracted fields); HTTPS-only; no secrets in the app bundle; rate-limit `/sync`.
**Tests:** a test asserts that a non-bank sender email is never parsed/stored; a test asserts stored transactions contain no full email body.
**DoD:** both guard tests green; `PROGRESS.md` lists the pre-launch tasks (Google restricted-scope security assessment, Microsoft equivalent) as required before public release.

---

### Phase 11 — Deployment
**Objective:** running off a real URL, not ngrok.
**Implement:** Dockerize backend; deploy to Railway/Render/Fly; managed Postgres (Supabase/Railway); set env vars; update OAuth redirect URIs to the production domain; document build for the Expo app (EAS build) for TestFlight / internal testing.
**Tests:** a post-deploy smoke test hits `/health` on the live URL.
**DoD:** live `/health` returns 200; app configured to point at the deployed API.

---

## 7. Parser test fixtures (real formats to build Phase 4 against)

> These are modeled on the user's actual Singapore bank alerts. Email **body** wording may
> differ slightly from the push text — Claude Code should replace these with real forwarded
> email samples when available, but they define the expected extraction behavior.

| Fixture | Sample text | Expected parse |
|---|---|---|
| `dbs_paynow_merchant.txt` | `Fr DBS: Successful PayNow: S$87.00 from A/C ending 6540 to 24HRS CITY FLORIST (UEN ending 378B), 22 Jul 18:01 SGT.` | amount 87.00, SGD, merchant "24HRS CITY FLORIST", debit, **type=expense**, bank DBS |
| `dbs_paynow_person.txt` | `Fr DBS: Successful PayNow: S$2.20 from A/C ending 6540 to LEX KOX SIXX (MOBILE ending 0596), 21 Jul 14:26 SGT.` | amount 2.20, merchant "LEX KOX SIXX", **type=transfer** (person, mobile) |
| `dbs_nets.txt` | `Your NETS Scan & Pay transaction of S$6.00 from A/C ending 6540 to CHICKEN RICE on 21 Jul 14:25 SGT was successful.` | amount 6.00, merchant "CHICKEN RICE", **type=expense** |
| `dbs_own_transfer.txt` | `An Own Funds Transfer of SGD200.00 from A/C ending 6540 to A/C ending 9249 on 21 Jul 14:20 (SGT) was completed.` | amount 200.00, **type=transfer** (own accounts) |
| `uob_paynow.txt` | `You made a PayNow transfer of SGD 200.00 to AUSXXX TEX YUXX XUXX (Mobile ending 7132) on your a/c ending 2047 at 7:37PM SGT, 18 Jul 26.` | amount 200.00, merchant person, **type=transfer**, bank UOB |
| `simplygo_fare.txt` | `Fare $1.38 - Kovan - Sengkang - 22 Jul 22:46` | amount 1.38, merchant "Transit: Kovan-Sengkang", **type=expense**, category Transport |
| `dbs_card_wallet.txt` | `DBS Bank — Star Western, Singapore, SG $19.80` | amount 19.80, merchant "Star Western", **type=expense** — NOTE: this arrives only as an Apple Wallet push in practice; include only if an email equivalent exists, else document as manual-entry case |

Parser rules to encode:
- Amount regex handles both `S$87.00` and `SGD 200.00` / `SGD200.00`.
- "Own Funds Transfer" or "to A/C ending" → transfer.
- "(MOBILE ending" / "(Mobile ending" / NRIC → person transfer.
- "(UEN ending" or a NETS/card merchant → expense.
- Dates are SGT (`Asia/Singapore`, UTC+8); store as timezone-aware `txn_at`.

---

## 8. Definition of "done" for the whole project (MVP)

A user installs the Expo app, connects a Gmail account, and within one sync cycle sees their
real DBS/UOB transactions listed, correctly split into expenses vs transfers, can tap to
categorize, and sees a monthly per-category summary — with all tests across phases green.
Outlook works through the same flow. Apple-Pay-only spends are handled via manual add.
