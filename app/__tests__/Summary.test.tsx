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

test('expanding the Food category row reveals its subcategory breakdown and its transactions', async () => {
  mockClientDefaults({
    summary: { user_id: 1, month: '2026-07', categories: [{ category: 'Food', total: '20.00' }], total: '20.00' },
    transactions: [
      makeTxn({ id: 1, category: 'Food', subcategory: 'Lunch', amount: '12.00', txn_at: '2026-07-15T12:00:00Z', merchant_raw: 'CHICKEN RICE' }),
      makeTxn({ id: 2, category: 'Food', subcategory: 'Dinner', amount: '8.00', txn_at: '2026-07-15T19:00:00Z', merchant_raw: 'SAIZERIYA' }),
    ],
  });

  renderWithProviders(<Summary />);

  const row = await screen.findByTestId('cat-row-Food');
  fireEvent.press(row);
  expect(await screen.findByText('Lunch')).toBeTruthy();
  expect(screen.getByText('Dinner')).toBeTruthy();
  expect(screen.getByText('CHICKEN RICE')).toBeTruthy();
  expect(screen.getByText('SAIZERIYA')).toBeTruthy();
});

test('expanding the Transport category row lists its transactions and its subcategory breakdown', async () => {
  mockClientDefaults({
    summary: { user_id: 1, month: '2026-07', categories: [{ category: 'Transport', total: '18.20' }], total: '18.20' },
    transactions: [
      makeTxn({ id: 1, category: 'Transport', subcategory: 'Private', amount: '11.80', txn_at: '2026-07-15T08:15:00Z', merchant_raw: 'GRAB' }),
      makeTxn({ id: 2, category: 'Transport', subcategory: 'Public', amount: '6.40', txn_at: '2026-07-14T18:00:00Z', merchant_raw: 'BUS/MRT' }),
    ],
  });

  renderWithProviders(<Summary />);

  const row = await screen.findByTestId('cat-row-Transport');
  fireEvent.press(row);

  expect(await screen.findByTestId('cat-tx-list-Transport')).toBeTruthy();
  expect(screen.getByText('GRAB')).toBeTruthy();
  expect(screen.getByText('BUS/MRT')).toBeTruthy();
  expect(screen.getByText('Private')).toBeTruthy();
  expect(screen.getByText('Public')).toBeTruthy();
});

test('paging the month chart view back a month shows that month\'s own total, not the current-month summary total', async () => {
  mockClientDefaults({
    summary: { user_id: 1, month: '2026-07', categories: [{ category: 'Food', total: '40.00' }], total: '40.00' },
    transactions: [
      makeTxn({ id: 1, category: 'Food', amount: '40.00', txn_at: '2026-07-15T10:00:00Z' }),
      makeTxn({ id: 2, category: 'Food', amount: '5.00', txn_at: '2026-06-20T10:00:00Z' }),
    ],
  });

  renderWithProviders(<Summary />);

  expect(await screen.findByText('S$40')).toBeTruthy();
  expect(screen.getByText('July 2026')).toBeTruthy();

  fireEvent.press(screen.getByTestId('chart-prev'));

  expect(await screen.findByText('June 2026')).toBeTruthy();
  expect(await screen.findByText('S$5')).toBeTruthy();
  expect(screen.queryByText('S$40')).toBeNull();
});

test('week view uses the Sunday-Saturday calendar week, not a rolling 7-day window', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, category: 'Food', amount: '9.00', txn_at: '2026-07-11T10:00:00Z', merchant_raw: 'LAST SATURDAY' }),
      makeTxn({ id: 2, category: 'Food', amount: '6.00', txn_at: '2026-07-12T10:00:00Z', merchant_raw: 'THIS SUNDAY' }),
    ],
  });

  renderWithProviders(<Summary />);

  fireEvent.press(await screen.findByTestId('sum-period-week'));

  expect(await screen.findByText('S$6')).toBeTruthy();
  expect(screen.queryByText('S$15')).toBeNull();
});

test('paging the calendar view to a different month resets the selected day and shows that month\'s data', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, category: 'Food', amount: '12.00', txn_at: '2026-06-01T10:00:00Z', merchant_raw: 'JUNE FIRST' }),
    ],
  });

  renderWithProviders(<Summary />);

  fireEvent.press(await screen.findByTestId('toggle-view'));
  fireEvent.press(await screen.findByTestId('cal-prev'));

  expect(await screen.findByText('June 2026')).toBeTruthy();
  expect(await screen.findByText('JUNE FIRST')).toBeTruthy();
  expect(screen.getByTestId('day-total')).toHaveTextContent('S$12.00');
});

test('calendar grid renders every day of the month, including Saturdays, in row-chunked groups of 7', async () => {
  mockClientDefaults({ transactions: [] });

  renderWithProviders(<Summary />);

  fireEvent.press(await screen.findByTestId('toggle-view'));

  // July 2026 has 31 days; Saturdays fall on 4, 11, 18, 25.
  expect(await screen.findByTestId('cal-day-4')).toBeTruthy();
  expect(screen.getByTestId('cal-day-11')).toBeTruthy();
  expect(screen.getByTestId('cal-day-18')).toBeTruthy();
  expect(screen.getByTestId('cal-day-25')).toBeTruthy();
  expect(screen.getByTestId('cal-day-31')).toBeTruthy();
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
