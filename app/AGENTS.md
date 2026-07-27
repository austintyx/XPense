# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

Note: the currently installed SDK is Expo 54 (`app/package.json` pins `"expo": "54"`), not 57 --
this file predates a version change that didn't fully land. Cross-check against the installed
version (`node_modules/expo/package.json`) before trusting a v57-specific detail.

## Running on the web

`npm run web` starts Metro's web dev server (same fast-refresh workflow as `npm start`/native).
Requires `EXPO_PUBLIC_API_BASE_URL` in `app/.env` pointing at a backend reachable from the browser
(localhost, or the deployed Render/ngrok URL) -- same env var the native app already uses.

`@react-native-community/datetimepicker` has no web build and `Alert.alert` has no real
`react-native-web` implementation -- see `src/components/DateField.web.tsx` and
`src/utils/confirm.ts` for the platform-split workarounds. Keep using these (not the raw
`DateTimePicker`/`Alert.alert` APIs) in any new screen code that needs a date picker or a
confirm dialog, so it keeps working on web.
