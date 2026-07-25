import { render, screen } from '@testing-library/react-native';

import * as client from '../src/api/client';
import Summary from '../src/screens/Summary';

describe('Summary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders category totals from the API', async () => {
    jest.spyOn(client, 'getSummary').mockResolvedValue({
      user_id: 1,
      month: '2026-07',
      categories: [
        { category: 'Food', total: '15.00' },
        { category: 'Transport', total: '2.00' },
      ],
      total: '17.00',
    });

    render(<Summary />);

    expect(await screen.findByText('2026-07')).toBeTruthy();
    expect(screen.getByText('Total: 17.00')).toBeTruthy();
    expect(screen.getByText('Food')).toBeTruthy();
    expect(screen.getByText('15.00')).toBeTruthy();
    expect(screen.getByText('Transport')).toBeTruthy();
    expect(screen.getByText('2.00')).toBeTruthy();
  });

  test('shows an empty state when there are no categories', async () => {
    jest.spyOn(client, 'getSummary').mockResolvedValue({
      user_id: 1,
      month: '2026-07',
      categories: [],
      total: '0',
    });

    render(<Summary />);

    expect(await screen.findByText('No expenses this month')).toBeTruthy();
  });
});
