import { fireEvent, screen } from '@testing-library/react-native';

import Summary from '../src/screens/Summary.web';
import { makeTxn, mockClientDefaults, renderWithProviders } from '../src/testUtils';

jest.mock('../src/hooks/useIsMobileWeb', () => ({ useIsMobileWeb: jest.fn(() => false) }));
import { useIsMobileWeb } from '../src/hooks/useIsMobileWeb';

afterEach(() => {
  jest.restoreAllMocks();
});

test('desktop: the chart/trend section lays out in a row', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(false);
  mockClientDefaults();

  renderWithProviders(<Summary />);

  const row = await screen.findByTestId('summary-chart-row');
  expect(row.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: 'row' })]),
  );
});

test('mobile: the chart/trend section stacks into a column', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(true);
  mockClientDefaults();

  renderWithProviders(<Summary />);

  const row = await screen.findByTestId('summary-chart-row');
  expect(row.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]),
  );
});

test('the country filter row is hidden when every transaction is SGD', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, category: 'Food', amount: '10.00' })] });

  renderWithProviders(<Summary />);

  await screen.findByTestId('summary-chart-row');
  expect(screen.queryByTestId('country-filter-row')).toBeNull();
});

test('selecting a country filter recomputes the total instead of using the unfiltered backend summary', async () => {
  mockClientDefaults({
    summary: {
      user_id: 1,
      month: '2026-07',
      categories: [
        { category: 'Food', total: '40.00' },
        { category: 'Travel', total: '358.00' },
      ],
      total: '398.00',
    },
    transactions: [
      makeTxn({ id: 1, category: 'Food', amount: '40.00', currency: 'SGD' }),
      makeTxn({ id: 2, category: 'Travel', subcategory: 'Transport', amount: '358.00', currency: 'CHF' }),
    ],
  });

  renderWithProviders(<Summary />);

  expect(await screen.findByTestId('donut-total')).toHaveTextContent('S$398');
  expect(screen.getByTestId('sum-country-Switzerland')).toBeTruthy();

  fireEvent.press(screen.getByTestId('sum-country-Switzerland'));

  expect(await screen.findByTestId('donut-total')).toHaveTextContent('S$358');
});
