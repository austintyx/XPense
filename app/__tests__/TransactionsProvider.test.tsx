import { screen } from '@testing-library/react-native';

import Home from '../src/screens/Home';
import * as client from '../src/api/client';
import { makeTxn, mockClientDefaults, renderWithProviders } from '../src/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

test('triggers a catch-up sync for the current user before loading data', async () => {
  mockClientDefaults();
  const syncSpy = jest.spyOn(client, 'syncTransactions');

  renderWithProviders(<Home />);

  await screen.findByTestId('home-screen');
  expect(syncSpy).toHaveBeenCalledWith(1);
});

test('a failed catch-up sync does not block the app from loading already-stored data', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, category: 'Food' })] });
  jest.spyOn(client, 'syncTransactions').mockRejectedValue(new Error('cold start timed out'));

  renderWithProviders(<Home />);

  expect(await screen.findByTestId('period-amount')).toBeTruthy();
});
