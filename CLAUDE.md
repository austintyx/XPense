# CLAUDE.md — XPense

Auto expense tracker: FastAPI/Postgres backend parses bank alert emails into transactions;
an Expo (React Native/TypeScript) app displays and categorizes them. Full spec: `BUILD_PLAN.md`.

## Working agreement (from BUILD_PLAN.md §0)

1. **Phase gate.** Build one phase at a time, in the order listed in `BUILD_PLAN.md` §6. Implement
   → write its tests → run them → all green → commit → only then move to the next phase.
2. **Never skip tests.** Every phase has a "Tests" section — write them as real, runnable tests
   (pytest for `backend/`, Jest + React Native Testing Library for `app/`). If a test can't pass,
   stop and report why instead of proceeding.
3. **Commit per phase**, message format `Phase N: <name>`.
4. **Secrets only via env vars / `.env`** (git-ignored). Keep `backend/.env.example` in sync with
   any new variable, using placeholder values.
5. **Ask before assuming external credentials** (OAuth client IDs, DB URLs, API keys). Where a
   real credential is required, implement the code, make the test skippable-if-no-credential, and
   print clear setup instructions rather than inventing values.
6. **Update `PROGRESS.md`** after each phase: what was built, how it was tested, and what the
   human must do manually.

## Layout

- `backend/` — FastAPI app (`app/`), pytest tests (`tests/`), `pyproject.toml`, `.env.example`.
  Python deps are added incrementally per phase (currently just `fastapi`/`uvicorn` +
  `pytest`/`httpx` — no SQLAlchemy/Alembic yet, those land in Phase 1).
- `app/` — Expo TypeScript app, Jest tests in `__tests__/`.
- `docker-compose.yml` — local Postgres for dev.

## Environment notes

- No `poetry`/`uv` on this machine — backend uses a plain `venv` (`backend/.venv`) + `pip`.
- No Xcode/iOS Simulator — use Expo Go on a physical device (QR code from `npx expo start`) to
  preview the app, not `npm run ios`.
