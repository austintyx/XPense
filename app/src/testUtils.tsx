import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import * as client from './api/client';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './store/AuthProvider';
import { TransactionsProvider } from './store/TransactionsProvider';

export function mockClientDefaults(overrides: {
  transactions?: client.Transaction[];
  summary?: client.Summary;
  budget?: client.Budget;
  goal?: client.SavingsGoal;
  user?: client.AppUser;
  accounts?: client.EmailAccount[];
  categories?: client.CustomCategories;
} = {}) {
  jest.spyOn(client, 'getTransactions').mockImplementation(async (direction) => {
    const all = overrides.transactions ?? [];
    return direction ? all.filter((t) => t.direction === direction) : all;
  });
  jest.spyOn(client, 'getSummary').mockResolvedValue(
    overrides.summary ?? { user_id: 1, month: '2026-07', categories: [], total: '0' },
  );
  jest.spyOn(client, 'getBudget').mockResolvedValue(
    overrides.budget ?? { user_id: 1, monthly_target: '2000.00', weekly_target: '285.71', daily_target: '66.67' },
  );
  jest.spyOn(client, 'getGoal').mockResolvedValue(
    overrides.goal ?? { user_id: 1, name: 'Savings goal', target_amount: '1000.00', saved_amount: '0.00' },
  );
  jest.spyOn(client, 'getUser').mockResolvedValue(
    overrides.user ?? { id: 1, email: 'demo@xpense.dev', name: 'Wei Ling Tan', created_at: '2026-01-01T00:00:00Z' },
  );
  jest.spyOn(client, 'getLinkedAccounts').mockResolvedValue(overrides.accounts ?? []);
  jest.spyOn(client, 'getCategories').mockResolvedValue(overrides.categories ?? { categories: [], subcategories: [] });
  jest.spyOn(client, 'syncTransactions').mockResolvedValue({ user_id: 1, inserted: 0, accounts: [] });
}

export function makeTxn(overrides: Partial<client.Transaction> = {}): client.Transaction {
  return {
    id: 1,
    user_id: 1,
    source_email_id: 'seed:1',
    provider: 'google',
    amount: '10.00',
    currency: 'SGD',
    direction: 'debit',
    merchant_raw: 'TEST MERCHANT',
    merchant_clean: null,
    category: null,
    subcategory: null,
    txn_at: new Date().toISOString(),
    bank: 'DBS',
    raw_parsed: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function renderWithProviders(ui: ReactElement) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <TransactionsProvider>{ui}</TransactionsProvider>
      </AuthProvider>
    </ToastProvider>,
  );
}
