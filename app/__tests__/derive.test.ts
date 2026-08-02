import {
  allCategories,
  categoryTotals,
  countriesInTransactions,
  countryForCurrency,
  dailyTotalsForRange,
  deriveRecurring,
  effectiveCountry,
  expenseTotal,
  formatMoney,
  initialsOf,
  previousMonthTransactions,
  relativeTime,
  spendAmount,
} from '../src/utils/derive';
import { CATEGORIES, CREDIT_CATEGORIES } from '../src/theme/tokens';
import { makeTxn } from '../src/testUtils';

describe('allCategories', () => {
  test('defaults to the debit list plus any custom categories, and includes Travel', () => {
    const result = allCategories([{ id: 1, name: 'Side Hustle' }]);
    expect(result).toEqual([...CATEGORIES, 'Side Hustle']);
    expect(result).toContain('Travel');
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

describe('countryForCurrency', () => {
  test('maps common currency codes to their country/region name', () => {
    expect(countryForCurrency('SGD')).toBe('Singapore');
    expect(countryForCurrency('CHF')).toBe('Switzerland');
    expect(countryForCurrency('JPY')).toBe('Japan');
  });

  test('falls back to the raw currency code for anything unmapped', () => {
    expect(countryForCurrency('ZZZ')).toBe('ZZZ');
  });
});

describe('effectiveCountry', () => {
  test('falls back to the currency-derived guess when no country is set', () => {
    expect(effectiveCountry({ country: null, currency: 'CHF' })).toBe('Switzerland');
  });

  test('a human-entered country wins over the currency-derived guess', () => {
    expect(effectiveCountry({ country: 'Liechtenstein', currency: 'CHF' })).toBe('Liechtenstein');
  });

  test('an empty/whitespace-only country is treated as unset', () => {
    expect(effectiveCountry({ country: '   ', currency: 'CHF' })).toBe('Switzerland');
  });
});

describe('countriesInTransactions', () => {
  test('returns the unique set of countries present, derived from currency', () => {
    const txns = [
      makeTxn({ id: 1, currency: 'SGD' }),
      makeTxn({ id: 2, currency: 'CHF' }),
      makeTxn({ id: 3, currency: 'CHF' }),
    ];
    expect(countriesInTransactions(txns)).toEqual(['Singapore', 'Switzerland']);
  });

  test('a human-entered country overrides the currency-derived one', () => {
    const txns = [makeTxn({ id: 1, currency: 'CHF', country: 'Liechtenstein' })];
    expect(countriesInTransactions(txns)).toEqual(['Liechtenstein']);
  });

  test('returns an empty array for no transactions', () => {
    expect(countriesInTransactions([])).toEqual([]);
  });
});

describe('formatMoney', () => {
  test('defaults to S$ when no currency is given, unchanged from before', () => {
    expect(formatMoney(10)).toBe('S$10.00');
  });

  test('formats SGD the same as no currency', () => {
    expect(formatMoney(10, true, 'SGD')).toBe('S$10.00');
  });

  test('shows a non-SGD currency code instead of converting it', () => {
    expect(formatMoney(358, true, 'CHF')).toBe('CHF 358.00');
  });

  test('keeps the sign before the currency prefix for a negative amount', () => {
    expect(formatMoney(-5, true, 'CHF')).toBe('-CHF 5.00');
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

  test('sums the SGD-converted amount_sgd for a foreign-currency transaction, not the raw amount', () => {
    // A CHF 100 transaction with amount_sgd already computed server-side must contribute 158, not
    // 100, to any total -- this is the bug behind the Summary screen's totals not tallying.
    const txns = [
      makeTxn({ id: 1, amount: '10.00', currency: 'SGD', amount_sgd: '10.00' }),
      makeTxn({ id: 2, amount: '100.00', currency: 'CHF', amount_sgd: '158.00' }),
    ];
    expect(expenseTotal(txns)).toBe(168);
  });

  test('falls back to the raw amount when amount_sgd is null (conversion never happened)', () => {
    const txns = [makeTxn({ id: 1, amount: '20.00', currency: 'USD', amount_sgd: null })];
    expect(expenseTotal(txns)).toBe(20);
  });
});

describe('spendAmount', () => {
  test('prefers amount_sgd over amount when present', () => {
    expect(spendAmount({ amount: '100.00', amount_sgd: '158.00' })).toBe(158);
  });

  test('falls back to amount when amount_sgd is null', () => {
    expect(spendAmount({ amount: '20.00', amount_sgd: null })).toBe(20);
  });
});

describe('categoryTotals', () => {
  test('sums amount_sgd per category so mixed-currency months total correctly', () => {
    const txns = [
      makeTxn({ id: 1, amount: '10.00', currency: 'SGD', amount_sgd: '10.00', category: 'Food' }),
      makeTxn({ id: 2, amount: '100.00', currency: 'CHF', amount_sgd: '158.00', category: 'Travel' }),
    ];
    expect(categoryTotals(txns)).toEqual({ Food: 10, Travel: 158 });
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
