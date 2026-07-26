import { fireEvent, screen } from '@testing-library/react-native';

import Summary from '../src/screens/Summary';
import { makeTxn, mockClientDefaults, renderWithProviders } from '../src/testUtils';

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-07-15T12:00:00Z'));
});

afterAll(() => {
  jest.useRealTimers();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('chart view shows the month total from summary and a row per category', async () => {
  mockClientDefaults({
    summary: {
      user_id: 1,
      month: '2026-07',
      categories: [
        { category: 'Food', total: '30.00' },
        { category: 'Transport', total: '10.00' },
      ],
      total: '40.00',
    },
    transactions: [
      makeTxn({ id: 1, category: 'Food', amount: '30.00', txn_at: '2026-07-15T10:00:00Z' }),
      makeTxn({ id: 2, category: 'Transport', amount: '10.00', txn_at: '2026-07-15T10:00:00Z' }),
    ],
  });

  renderWithProviders(<Summary />);

  expect(await screen.findByText('S$40')).toBeTruthy();
  expect(screen.getByTestId('cat-row-Food')).toBeTruthy();
  expect(screen.getByTestId('cat-row-Transport')).toBeTruthy();
});

test('expanding the Food category row reveals its subcategory breakdown', async () => {
  mockClientDefaults({
    summary: { user_id: 1, month: '2026-07', categories: [{ category: 'Food', total: '20.00' }], total: '20.00' },
    transactions: [
      makeTxn({ id: 1, category: 'Food', subcategory: 'Lunch', amount: '12.00', txn_at: '2026-07-15T12:00:00Z' }),
      makeTxn({ id: 2, category: 'Food', subcategory: 'Dinner', amount: '8.00', txn_at: '2026-07-15T19:00:00Z' }),
    ],
  });

  renderWithProviders(<Summary />);

  const row = await screen.findByTestId('cat-row-Food');
  fireEvent.press(row);
  expect(await screen.findByText('Lunch')).toBeTruthy();
  expect(screen.getByText('Dinner')).toBeTruthy();
});

test('calendar view shows 3 leading blank cells for July 2026 (starts on a Wednesday) and selecting a day updates the detail card', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({
        id: 1,
        category: 'Food',
        amount: '15.00',
        txn_at: '2026-07-10T10:00:00Z',
        merchant_raw: 'CHICKEN RICE',
      }),
    ],
  });

  renderWithProviders(<Summary />);

  fireEvent.press(await screen.findByTestId('toggle-view'));
  expect(await screen.findByTestId('cal-day-1')).toBeTruthy();

  fireEvent.press(screen.getByTestId('cal-day-10'));
  expect(await screen.findByText('CHICKEN RICE')).toBeTruthy();
  expect(screen.getByTestId('day-total')).toHaveTextContent('S$15.00');
});
