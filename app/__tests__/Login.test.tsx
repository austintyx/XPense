import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import Login from '../src/screens/Login';
import { ToastProvider } from '../src/components/Toast';
import { AuthProvider } from '../src/store/AuthProvider';
import * as client from '../src/api/client';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'exp://127.0.0.1:8081/--/'),
}));

function renderLogin() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </ToastProvider>,
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(client, 'getUser').mockResolvedValue({
    id: 7,
    email: 'someone@gmail.com',
    name: null,
    created_at: '2026-01-01T00:00:00Z',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('a successful connect persists the resolved user id from the redirect', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
    type: 'success',
    url: 'exp://127.0.0.1:8081/--/?linked=true&provider=google&email=someone%40gmail.com&user_id=7',
  });

  renderLogin();

  fireEvent.press(screen.getByTestId('login-connect-google'));

  await waitFor(async () => {
    expect(await AsyncStorage.getItem('xpense.userId')).toBe('7');
  });
});

test('cancelling the connect flow resets state instead of leaving the screen stuck', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' });

  renderLogin();

  fireEvent.press(screen.getByTestId('login-connect-google'));

  expect(await screen.findByText('Connection cancelled')).toBeTruthy();
  expect(await AsyncStorage.getItem('xpense.userId')).toBeNull();
  // the button must be re-enabled, not stuck showing a spinner forever
  expect(screen.getByText('Continue with Gmail')).toBeTruthy();
});

test('connecting a brand-new account shows the backfill sheet instead of logging in immediately', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
    type: 'success',
    url: 'exp://127.0.0.1:8081/--/?linked=true&provider=google&email=someone%40gmail.com&user_id=7&is_new_account=true',
  });

  renderLogin();

  fireEvent.press(screen.getByTestId('login-connect-google'));

  expect(await screen.findByTestId('sync-backfill-sheet')).toBeTruthy();
  // not logged in yet -- the sheet decides that once the person picks Sync or Skip
  expect(await AsyncStorage.getItem('xpense.userId')).toBeNull();
});

test('skipping the backfill sheet still logs in, with no sync call', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
    type: 'success',
    url: 'exp://127.0.0.1:8081/--/?linked=true&provider=google&email=someone%40gmail.com&user_id=7&is_new_account=true',
  });
  const syncSpy = jest.spyOn(client, 'syncTransactions');

  renderLogin();
  fireEvent.press(screen.getByTestId('login-connect-google'));
  fireEvent.press(await screen.findByTestId('sync-backfill-skip'));

  await waitFor(async () => {
    expect(await AsyncStorage.getItem('xpense.userId')).toBe('7');
  });
  expect(syncSpy).not.toHaveBeenCalled();
});

test('syncing from the backfill sheet calls syncTransactions with the picked date, then logs in', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
    type: 'success',
    url: 'exp://127.0.0.1:8081/--/?linked=true&provider=google&email=someone%40gmail.com&user_id=7&is_new_account=true',
  });
  const syncSpy = jest.spyOn(client, 'syncTransactions').mockResolvedValue({ user_id: 7, inserted: 3, accounts: [] });

  renderLogin();
  fireEvent.press(screen.getByTestId('login-connect-google'));
  fireEvent.press(await screen.findByTestId('sync-backfill-date-picker'));
  fireEvent.press(screen.getByTestId('sync-backfill-sync'));

  await waitFor(() => expect(syncSpy).toHaveBeenCalledWith(7, '2025-01-15'));
  await waitFor(async () => {
    expect(await AsyncStorage.getItem('xpense.userId')).toBe('7');
  });
});

test('a failed backfill sync still logs the person in instead of stranding them', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
    type: 'success',
    url: 'exp://127.0.0.1:8081/--/?linked=true&provider=google&email=someone%40gmail.com&user_id=7&is_new_account=true',
  });
  jest.spyOn(client, 'syncTransactions').mockRejectedValue(new Error('network error'));

  renderLogin();
  fireEvent.press(screen.getByTestId('login-connect-google'));
  fireEvent.press(await screen.findByTestId('sync-backfill-sync'));

  expect(await screen.findByText("Couldn't sync past transactions, but your account is connected")).toBeTruthy();
  await waitFor(async () => {
    expect(await AsyncStorage.getItem('xpense.userId')).toBe('7');
  });
});

test('signing in with a password logs in without any OAuth flow', async () => {
  const loginSpy = jest.spyOn(client, 'loginWithPassword').mockResolvedValue({
    id: 9,
    email: 'weiling@example.com',
    name: 'Wei Ling',
    created_at: '2026-01-01T00:00:00Z',
  });

  renderLogin();

  fireEvent.changeText(screen.getByTestId('login-email'), 'weiling@example.com');
  fireEvent.changeText(screen.getByTestId('login-password'), 'correct-password');
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() => expect(loginSpy).toHaveBeenCalledWith('weiling@example.com', 'correct-password'));
  await waitFor(async () => {
    expect(await AsyncStorage.getItem('xpense.userId')).toBe('9');
  });
});

test('a wrong password shows the backend error and does not log in', async () => {
  jest.spyOn(client, 'loginWithPassword').mockRejectedValue(new client.ApiError('Invalid email or password', 401));

  renderLogin();

  fireEvent.changeText(screen.getByTestId('login-email'), 'weiling@example.com');
  fireEvent.changeText(screen.getByTestId('login-password'), 'wrong-password');
  fireEvent.press(screen.getByTestId('login-submit'));

  expect(await screen.findByText('Invalid email or password')).toBeTruthy();
  expect(await AsyncStorage.getItem('xpense.userId')).toBeNull();
});

test('switching to Create account and registering logs in with the new account', async () => {
  const registerSpy = jest.spyOn(client, 'registerAccount').mockResolvedValue({
    id: 11,
    email: 'new@example.com',
    name: 'New Person',
    created_at: '2026-01-01T00:00:00Z',
  });

  renderLogin();

  fireEvent.press(screen.getByTestId('login-toggle-mode'));
  fireEvent.changeText(screen.getByTestId('login-email'), 'new@example.com');
  fireEvent.changeText(screen.getByTestId('login-name'), 'New Person');
  fireEvent.changeText(screen.getByTestId('login-password'), 'a-new-password');
  fireEvent.press(screen.getByTestId('login-submit'));

  await waitFor(() => expect(registerSpy).toHaveBeenCalledWith('new@example.com', 'a-new-password', 'New Person'));
  await waitFor(async () => {
    expect(await AsyncStorage.getItem('xpense.userId')).toBe('11');
  });
});

test('registering with an email that already has a password shows the conflict error', async () => {
  jest.spyOn(client, 'registerAccount').mockRejectedValue(
    new client.ApiError('An account with this email already exists.', 409),
  );

  renderLogin();

  fireEvent.press(screen.getByTestId('login-toggle-mode'));
  fireEvent.changeText(screen.getByTestId('login-email'), 'dup@example.com');
  fireEvent.changeText(screen.getByTestId('login-password'), 'whatever');
  fireEvent.press(screen.getByTestId('login-submit'));

  expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
  expect(await AsyncStorage.getItem('xpense.userId')).toBeNull();
});

test('the submit button is disabled until both email and password are filled in', async () => {
  renderLogin();

  const submit = await screen.findByTestId('login-submit');
  expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('login-email'), 'weiling@example.com');
  expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBeTruthy();

  fireEvent.changeText(screen.getByTestId('login-password'), 'something');
  expect(submit.props.accessibilityState?.disabled).toBeFalsy();
});
