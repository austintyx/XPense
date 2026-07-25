import { render, screen } from '@testing-library/react-native';

import App from '../App';
import * as client from '../src/api/client';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'exp://127.0.0.1:8081/--/'),
}));

beforeEach(() => {
  jest.spyOn(client, 'getTransactions').mockResolvedValue([]);
  jest.spyOn(client, 'getSummary').mockResolvedValue({
    user_id: 1,
    month: '2026-07',
    categories: [],
    total: '0',
  });
  jest.spyOn(client, 'getLinkedAccounts').mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders without crashing, defaulting to the Transactions tab', async () => {
  render(<App />);
  expect(screen.toJSON()).not.toBeNull();
  // let the Transactions screen's initial data fetch resolve before the test ends
  await screen.findByText('No expenses yet');
});
