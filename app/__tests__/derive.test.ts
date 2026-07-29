import {
  allCategories,
  dailyTotalsForRange,
  deriveRecurring,
  expenseTotal,
  initialsOf,
  previousMonthTransactions,
  relativeTime,
} from '../src/utils/derive';
import { CATEGORIES, CREDIT_CATEGORIES } from '../src/theme/tokens';
import { makeTxn } from '../src/testUtils';

describe('allCategories', () => {
  test('defaults to the debit list plus any custom categories', () => {
    const result = allCategories([{ id: 1, name: 'Side Hustle' }]);
    expect(result).toEqual([...CATEGORIES, 'Side Hustle']);
  });

  test('direction "credit" returns the fixed credit list, ignoring custom categories', () => {
    const result = allCategories([{ id: 1, name: 'Side Hustle' }], 'credit');
    expect(result).toEqual(CREDIT_CATEGORIES);
    expect(result).not.toContain('Side Hustle');
  });

  test('direction "debit" is equivalent to the default', () => {
    expect(allCategories([], 'debit')).toEqual(allCategories([]));
  });
});

describe('previousMonthTransactions', () => {
  test('returns only transactions from the calendar month before now', () => {
    const now = new Date(2026, 6, 15); // 15 Jul 2026
    const txns = [
      makeTxn({ id: 1, txn_at: new Date(2026, 5, 20).toISOString() }), // Jun -- included
      makeTxn({ id: 2, txn_at: new Date(2026, 6, 1).toISOString() }), // Jul -- excluded (current month)
      makeTxn({ id: 3, txn_at: new Date(2026, 4, 20).toISOString() }), // May -- excluded (too old)
    ];
    expect(previousMonthTransactions(txns, now).map((t) => t.id)).toEqual([1]);
  });

  test('rolls back across a year boundary', () => {
    const now = new Date(2026, 0, 10); // Jan 2026
    const txns = [makeTxn({ id: 1, txn_at: new Date(2025, 11, 5).toISOString() })]; // Dec 2025
    expect(previousMonthTransactions(txns, now).map((t) => t.id)).toEqual([1]);
  });
});

describe('dailyTotalsForRange', () => {
  test('buckets expenses by day across a range spanning a month boundary', () => {
    const start = new Date(2026, 5, 29); // 29 Jun
    const end = new Date(2026, 6, 2); // 2 Jul -- 4 days total
    const txns = [
      makeTxn({ id: 1, txn_at: new Date(2026, 5, 29, 10).toISOString(), amount: '10.00' }),
      makeTxn({ id: 2, txn_at: new Date(2026, 6, 2, 9).toISOString(), amount: '5.00' }),
      makeTxn({ id: 3, txn_at: new Date(2026, 6, 10).toISOString(), amount: '99.00' }), // outside range
    ];
    expect(dailyTotalsForRange(txns, start, end)).toEqual([10, 0, 0, 5]);
  });

  test('ignores non-expense transactions', () => {
    const start = new Date(2026, 6, 1);
    const end = new Date(2026, 6, 1);
    const txns = [makeTxn({ id: 1, txn_at: start.toISOString(), amount: '10.00', direction: 'credit' })];
    expect(dailyTotalsForRange(txns, start, end)).toEqual([0]);
  });
});

describe('expenseTotal', () => {
  test('sums expenses including uncategorized ones, excluding credits', () => {
    const txns = [
      makeTxn({ id: 1, amount: '10.00', category: 'Food' }),
      makeTxn({ id: 2, amount: '5.00', category: null }), // uncategorized -- still counts
      makeTxn({ id: 3, amount: '3.00', direction: 'credit' }), // credit -- excluded
    ];
    expect(expenseTotal(txns)).toBe(15);
  });

  test('returns 0 for an empty list', () => {
    expect(expenseTotal([])).toBe(0);
  });
});

describe('deriveRecurring', () => {
  test('flags a merchant appearing in 2+ months with consistent amounts', () => {
    const txns = [
      makeTxn({ id: 1, merchant_clean: 'Spotify', amount: '11.98', txn_at: new Date(2026, 4, 25).toISOString() }),
      makeTxn({ id: 2, merchant_clean: 'Spotify', amount: '11.98', txn_at: new Date(2026, 5, 25).toISOString() }),
    ];
    const result = deriveRecurring(txns);
    expect(result).toHaveLength(1);
    expect(result[0]!.merchant).toBe('Spotify');
    expect(result[0]!.amount).toBe(11.98);
  });

  test('does not flag a merchant seen in only one month', () => {
    const txns = [makeTxn({ id: 1, merchant_clean: 'Uniqlo', amount: '79.90' })];
    expect(deriveRecurring(txns)).toEqual([]);
  });

  test('does not flag a merchant whose amounts vary too much month to month', () => {
    const txns = [
      makeTxn({ id: 1, merchant_clean: 'Grab', amount: '10.00', txn_at: new Date(2026, 4, 5).toISOString() }),
      makeTxn({ id: 2, merchant_clean: 'Grab', amount: '40.00', txn_at: new Date(2026, 5, 5).toISOString() }),
    ];
    expect(deriveRecurring(txns)).toEqual([]);
  });
});

describe('relativeTime', () => {
  test('formats minutes, hours, and days ago', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 30_000).toISOString())).toBe('just now');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago');
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago');
  });
});

describe('initialsOf', () => {
  test('takes the first letter of up to two words', () => {
    expect(initialsOf('Wei Ling Tan')).toBe('WL');
    expect(initialsOf('Austin')).toBe('A');
  });

  test('falls back to "?" for no name', () => {
    expect(initialsOf(null)).toBe('?');
  });
});
