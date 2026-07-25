import { fireEvent, render, screen } from '@testing-library/react-native';

import * as client from '../src/api/client';
import Transactions from '../src/screens/Transactions';

const FAKE_TRANSACTIONS: client.Transaction[] = [
  {
    id: 1,
    user_id: 1,
    source_email_id: 'seed:1',
    provider: 'google',
    amount: '6.00',
    currency: 'SGD',
    direction: 'debit',
    type: 'expense',
    merchant_raw: 'CHICKEN RICE',
    merchant_clean: 'CHICKEN RICE',
    category: 'Food',
    txn_at: '2026-07-23T05:42:21.155856Z',
    bank: 'DBS',
    raw_parsed: null,
    created_at: '2026-07-23T05:42:21.152373Z',
  },
  {
    id: 2,
    user_id: 1,
    source_email_id: 'seed:2',
    provider: 'google',
    amount: '87.00',
    currency: 'SGD',
    direction: 'debit',
    type: 'expense',
    merchant_raw: '24HRS CITY FLORIST',
    merchant_clean: null,
    category: null,
    txn_at: '2026-07-23T05:42:21.155856Z',
    bank: 'DBS',
    raw_parsed: null,
    created_at: '2026-07-23T05:42:21.152373Z',
  },
];

describe('Transactions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders the mocked transaction list', async () => {
    jest.spyOn(client, 'getTransactions').mockResolvedValue(FAKE_TRANSACTIONS);

    render(<Transactions />);

    expect(await screen.findByText('CHICKEN RICE')).toBeTruthy();
    expect(screen.getByText('24HRS CITY FLORIST')).toBeTruthy();
    expect(screen.getByText('SGD 6.00')).toBeTruthy();
  });

  test('selecting a category fires the correct POST via updateTransactionCategory', async () => {
    jest.spyOn(client, 'getTransactions').mockResolvedValue(FAKE_TRANSACTIONS);
    const updateTransactionCategory = jest.spyOn(client, 'updateTransactionCategory').mockResolvedValue({
      ...FAKE_TRANSACTIONS[1],
      category: 'Shopping',
    });

    render(<Transactions />);
    // txn 2 (24HRS CITY FLORIST) starts uncategorized
    expect(await screen.findByText(/Uncategorized/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('transaction-2'));
    fireEvent.press(await screen.findByText('Shopping'));

    expect(updateTransactionCategory).toHaveBeenCalledWith(2, 'Shopping');
    // once recategorized, no row should show "Uncategorized" anymore
    expect(await screen.findByText(/Shopping/)).toBeTruthy();
    expect(screen.queryByText(/Uncategorized/)).toBeNull();
  });
});
