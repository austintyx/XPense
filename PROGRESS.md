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
