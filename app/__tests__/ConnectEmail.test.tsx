import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as client from '../src/api/client';
import ConnectEmail from '../src/screens/ConnectEmail';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'exp://127.0.0.1:8081/--/'),
}));

const WebBrowser = require('expo-web-browser');

describe('ConnectEmail', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders both provider buttons', async () => {
    jest.spyOn(client, 'getLinkedAccounts').mockResolvedValue([]);

    render(<ConnectEmail />);

    expect(await screen.findByText('Connect Gmail')).toBeTruthy();
    expect(screen.getByText('Connect Outlook')).toBeTruthy();
  });

  test('tapping a provider button opens the backend auth URL via the auth handler', async () => {
    jest.spyOn(client, 'getLinkedAccounts').mockResolvedValue([]);
    WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });

    render(<ConnectEmail />);
    fireEvent.press(await screen.findByText('Connect Gmail'));

    await waitFor(() => expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(1));
    const [authUrl, redirectUri] = WebBrowser.openAuthSessionAsync.mock.calls[0];
    expect(authUrl).toContain('/auth/google');
    expect(redirectUri).toBe('exp://127.0.0.1:8081/--/');
  });

  test('refreshes and shows the linked email after a successful auth session', async () => {
    const getLinkedAccounts = jest.spyOn(client, 'getLinkedAccounts');
    getLinkedAccounts.mockResolvedValueOnce([]);
    WebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'exp://done' });

    render(<ConnectEmail />);
    fireEvent.press(await screen.findByText('Connect Gmail'));

    getLinkedAccounts.mockResolvedValueOnce([
      {
        id: 1,
        provider: 'google',
        provider_email: 'someone@gmail.com',
        last_synced_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);

    expect(await screen.findByText('Connected as someone@gmail.com')).toBeTruthy();
  });

  test('shows linked account email when the API already reports one', async () => {
    jest.spyOn(client, 'getLinkedAccounts').mockResolvedValue([
      {
        id: 1,
        provider: 'google',
        provider_email: 'someone@gmail.com',
        last_synced_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);

    render(<ConnectEmail />);

    expect(await screen.findByText('Connected as someone@gmail.com')).toBeTruthy();
    expect(screen.getByText('Not connected')).toBeTruthy(); // microsoft still unlinked
  });
});
