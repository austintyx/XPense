import { fireEvent, screen } from '@testing-library/react-native';

import Home from '../src/screens/Home';
import { makeTxn, mockClientDefaults, renderWithProviders } from '../src/testUtils';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockNavigate.mockClear();
});

test('shows the greeting with the user first name and the month spend from summary', async () => {
  mockClientDefaults({
    summary: { user_id: 1, month: '2026-07', categories: [{ category: 'Food', total: '42.80' }], total: '42.80' },
  });

  renderWithProviders(<Home />);

  expect(await screen.findByText(/Wei Ling/)).toBeTruthy();
  expect(screen.getByText('S$42.80')).toBeTruthy();
});

test('shows the needs-a-category card when there are uncategorized transactions, and tapping it opens Quick Sort', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, category: null }), makeTxn({ id: 2, category: 'Food' })],
  });

  renderWithProviders(<Home />);

  const card = await screen.findByTestId('needs-category-card');
  expect(screen.getByText('1')).toBeTruthy();
  fireEvent.press(card);
  expect(mockNavigate).toHaveBeenCalledWith('QuickSort');
});

test('hides the needs-a-category card when nothing is uncategorized', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, category: 'Food' })] });

  renderWithProviders(<Home />);

  await screen.findByTestId('home-screen');
  expect(screen.queryByTestId('needs-category-card')).toBeNull();
});

test('switching to the Today segment shows today-scoped spend', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, amount: '8.40', category: 'Food' })] });

  renderWithProviders(<Home />);

  await screen.findByTestId('home-screen');
  fireEvent.press(screen.getByTestId('period-today'));
  expect(await screen.findByTestId('period-amount')).toHaveTextContent('S$8.40');
});
