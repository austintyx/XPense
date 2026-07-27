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

beforeEach(() => {
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
