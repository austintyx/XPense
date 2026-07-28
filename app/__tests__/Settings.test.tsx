import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import Settings from '../src/screens/Settings';
import * as client from '../src/api/client';
import { mockClientDefaults, renderWithProviders } from '../src/testUtils';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'exp://127.0.0.1:8081/--/'),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockNavigate.mockClear();
});

test('shows the profile name, member-since year, and only real linked accounts (no fake SMS row)', async () => {
  mockClientDefaults({
    user: { id: 1, email: 'demo@xpense.dev', name: 'Wei Ling Tan', created_at: '2025-03-01T00:00:00Z' },
    accounts: [
      { id: 1, provider: 'google', provider_email: 'weiling@gmail.com', last_synced_at: null, created_at: '2026-01-01T00:00:00Z' },
    ],
  });

  renderWithProviders(<Settings />);

  expect(await screen.findByText('Wei Ling Tan')).toBeTruthy();
  expect(screen.getByText(/Member since 2025/)).toBeTruthy();
  expect(screen.getByText('weiling@gmail.com')).toBeTruthy();
  expect(screen.queryByText(/9123 4567/)).toBeNull();
  expect(screen.getByTestId('connect-microsoft')).toBeTruthy();
});

test('editing the display name saves via the API', async () => {
  mockClientDefaults();
  const updateNameSpy = jest
    .spyOn(client, 'updateUserName')
    .mockResolvedValue({ id: 1, email: 'demo@xpense.dev', name: 'New Name', created_at: '2025-03-01T00:00:00Z' });

  renderWithProviders(<Settings />);

  fireEvent.press(await screen.findByTestId('edit-name-toggle'));
  fireEvent.changeText(screen.getByTestId('name-input'), 'New Name');
  fireEvent.press(screen.getByTestId('save-name'));

  expect(updateNameSpy).toHaveBeenCalledWith('New Name');
});

test('preference toggles are local UI state, not backed by an API call', async () => {
  mockClientDefaults();

  renderWithProviders(<Settings />);

  const toggle = await screen.findByTestId('pref-roundup');
  expect(toggle.props.value).toBe(false);
  fireEvent(toggle, 'valueChange', true);
  expect(toggle.props.value).toBe(true);
});

test('removing a linked account confirms, then unlinks it while keeping the app usable', async () => {
  mockClientDefaults({
    accounts: [
      { id: 7, provider: 'google', provider_email: 'weiling@gmail.com', last_synced_at: null, created_at: '2026-01-01T00:00:00Z' },
    ],
  });
  const deleteSpy = jest.spyOn(client, 'deleteEmailAccount').mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === 'Unlink')?.onPress?.();
  });

  renderWithProviders(<Settings />);

  fireEvent.press(await screen.findByTestId('remove-7'));

  expect(deleteSpy).toHaveBeenCalledWith(7);
  expect(await screen.findByText('+ Connect Gmail')).toBeTruthy();
});

test('signing out confirms, then clears the stored login', async () => {
  await AsyncStorage.setItem('xpense.userId', '1');
  mockClientDefaults();
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === 'Sign out')?.onPress?.();
  });

  renderWithProviders(<Settings />);

  fireEvent.press(await screen.findByTestId('sign-out'));

  expect(await AsyncStorage.getItem('xpense.userId')).toBeNull();
});

test('connecting a brand-new provider shows the backfill sheet', async () => {
  mockClientDefaults();
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
    type: 'success',
    url: 'exp://127.0.0.1:8081/--/?linked=true&provider=microsoft&email=someone%40outlook.com&user_id=1&is_new_account=true',
  });

  renderWithProviders(<Settings />);

  fireEvent.press(await screen.findByTestId('connect-microsoft'));

  expect(await screen.findByTestId('sync-backfill-sheet')).toBeTruthy();
});

test('re-linking an already-connected provider does not show the backfill sheet', async () => {
  mockClientDefaults({
    accounts: [
      { id: 1, provider: 'microsoft', provider_email: 'someone@outlook.com', last_synced_at: null, created_at: '2026-01-01T00:00:00Z' },
    ],
  });
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
    type: 'success',
    url: 'exp://127.0.0.1:8081/--/?linked=true&provider=microsoft&email=someone%40outlook.com&user_id=1&is_new_account=false',
  });

  renderWithProviders(<Settings />);

  fireEvent.press(await screen.findByTestId('change-microsoft'));

  await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalled());
  expect(screen.queryByTestId('sync-backfill-sheet')).toBeNull();
});

test('tapping the manage-categories entry navigates to ManageCategories', async () => {
  mockClientDefaults();

  renderWithProviders(<Settings />);

  fireEvent.press(await screen.findByTestId('manage-categories-entry'));
  expect(mockNavigate).toHaveBeenCalledWith('ManageCategories');
});

test('tapping the Circle entry card navigates to Circle', async () => {
  mockClientDefaults();

  renderWithProviders(<Settings />);

  fireEvent.press(await screen.findByTestId('circle-entry'));
  expect(mockNavigate).toHaveBeenCalledWith('Circle');
});
