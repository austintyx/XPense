# XPense

Auto expense tracker: FastAPI/Postgres backend parses bank alert emails into transactions; an Expo
(React Native/TypeScript) app displays and categorizes them. Full spec: `BUILD_PLAN.md`.

## Running the app

- **Mobile**: `cd app && npx expo start`, then scan the QR code with Expo Go (no Xcode/iOS
  Simulator on this machine, so this is the way to preview on a physical device).
- **Web**: `cd app && npm run web`. Requires `EXPO_PUBLIC_API_BASE_URL` in `app/.env` pointing at
  a backend reachable from the browser (localhost, or the deployed Render/ngrok URL). The backend
  must also have that origin listed in its `CORS_ALLOWED_ORIGINS` env var (see
  `backend/.env.example`) -- it defaults to the local Expo web dev server's ports, so no extra
  config is needed for local dev.

See `app/AGENTS.md` for Expo-specific notes and `backend/.env.example` for backend configuration.
