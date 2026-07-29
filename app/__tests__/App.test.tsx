import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';

import App from '../App';
import * as client from '../src/api/client';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'exp://127.0.0.1:8081/--/'),
}));
jest.mock('@expo-google-fonts/dm-sans', () => ({
  DMSans_400Regular: 'DMSans_400Regular',
  DMSans_500Medium: 'DMSans_500Medium',
  useFonts: () => [true],
}));
jest.mock('@expo-google-fonts/instrument-serif', () => ({
  InstrumentSerif_400Regular: 'InstrumentSerif_400Regular',
  useFonts: () => [true],
}));
jest.mock('@expo-google-fonts/jetbrains-mono', () => ({
  JetBrainsMono_400Regular: 'JetBrainsMono_400Regular',
  useFonts: () => [true],
}));

beforeEach(async () => {
  // The mock's backing store is a module-level object that survives between tests -- clear it
  // first so each test starts from a known state instead of leaking the previous test's login.
  await AsyncStorage.clear();
  // Simulate a device that's already logged in, matching this file's existing assumption that
  // the app goes straight to the tab bar. The logged-out/stale-id paths get their own tests below.
  await AsyncStorage.setItem('xpense.userId', '1');
  jest.spyOn(client, 'getTransactions').mockResolvedValue([]);
  jest.spyOn(client, 'getSummary').mockResolvedValue({
    user_id: 1,
    month: '2026-07',
    categories: [],
    total: '0',
  });
  jest.spyOn(client, 'getBudget').mockResolvedValue({
    user_id: 1,
    monthly_target: '2000.00',
    weekly_target: '285.71',
    daily_target: '66.67',
  });
  jest.spyOn(client, 'getGoal').mockResolvedValue({
    user_id: 1,
    name: 'Savings goal',
    target_amount: '1000.00',
    saved_amount: '0.00',
  });
  jest.spyOn(client, 'getUser').mockResolvedValue({
    id: 1,
    email: 'demo@xpense.dev',
    name: null,
    created_at: '2026-01-01T00:00:00Z',
  });
  jest.spyOn(client, 'getLinkedAccounts').mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders without crashing, defaulting to the Home tab', async () => {
  render(<App />);
  await screen.findByTestId('home-screen');
  expect(screen.getByTestId('tab-Home')).toBeTruthy();
  expect(screen.getByTestId('tab-Summary')).toBeTruthy();
  expect(screen.getByTestId('tab-Activity')).toBeTruthy();
  expect(screen.getByTestId('tab-Settings')).toBeTruthy();
});

test('shows the Login screen instead of the tab bar when no user is stored', async () => {
  await AsyncStorage.clear();

  render(<App />);

  expect(await screen.findByTestId('login-screen')).toBeTruthy();
  expect(screen.queryByTestId('tab-Home')).toBeNull();
});

test('a stored user id the backend confirms no longer exists (a real 404) falls back to the Login screen', async () => {
  // Simulates a device logged in against a database that was since wiped/redeployed (e.g. a
  // fresh Render/Supabase instance) still has an old id sitting in storage -- a *confirmed* 404,
  // not just a request that failed to complete (see the network-error test below, which must NOT
  // clear storage the same way).
  await AsyncStorage.setItem('xpense.userId', '999');
  jest.spyOn(client, 'getUser').mockRejectedValue(new client.ApiError('User not found', 404));

  render(<App />);

  expect(await screen.findByTestId('login-screen')).toBeTruthy();
  expect(await AsyncStorage.getItem('xpense.userId')).toBeNull();
});

test('a stored user id that fails to verify due to a network/timeout error is kept, not treated as a logout', async () => {
  // This is the actual bug the fix targets: a Render cold-start timeout must never look
  // indistinguishable from "this user doesn't exist" -- the session should be preserved and
  // retried, not silently wiped.
  jest.useFakeTimers();
  await AsyncStorage.setItem('xpense.userId', '42');
  jest.spyOn(client, 'getUser').mockRejectedValue(new TypeError('Network request failed'));

  render(<App />);
  await jest.advanceTimersByTimeAsync(0);
  await jest.advanceTimersByTimeAsync(3000);
  await jest.advanceTimersByTimeAsync(7000);

  expect(await screen.findByTestId('session-error')).toBeTruthy();
  expect(screen.queryByTestId('login-screen')).toBeNull();
  expect(await AsyncStorage.getItem('xpense.userId')).toBe('42');
  jest.useRealTimers();
});
