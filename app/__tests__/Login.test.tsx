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
