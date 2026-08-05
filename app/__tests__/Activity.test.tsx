import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Activity from '../src/screens/Activity';
import * as client from '../src/api/client';
import { makeTxn, mockClientDefaults, renderWithProviders } from '../src/testUtils';
import { colors } from '../src/theme/tokens';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockNavigate.mockClear();
});

test('renders transactions grouped by day, with categorized and uncategorized rows', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', category: 'Food', subcategory: 'Lunch' }),
      makeTxn({ id: 2, merchant_raw: 'GRAB', category: null }),
    ],
  });

  renderWithProviders(<Activity />);

  expect(await screen.findByText('CHICKEN RICE')).toBeTruthy();
  expect(screen.getByText('Food · Lunch')).toBeTruthy();
  expect(screen.getByText('GRAB')).toBeTruthy();
  expect(screen.getByText('Tap to categorise')).toBeTruthy();
});

test('the All filter shows credit and debit transactions together, credit excluded from the Needs a category count', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', category: 'Food', amount: '10.00' }),
      // A debit with no type field left to exempt it now counts like any other debit -- give it a
      // category so this test stays focused on credit/debit display, not the needs-review queue.
      makeTxn({ id: 2, merchant_raw: 'A/C ending 9249', direction: 'debit', category: 'Other', amount: '5.00' }),
      // Uncategorized, but credit -- must NOT show up in Needs a category regardless.
      makeTxn({ id: 3, merchant_raw: 'LOU SIM TENG', direction: 'credit', category: null, amount: '3.00' }),
    ],
  });

  renderWithProviders(<Activity />);

  expect(await screen.findByText('CHICKEN RICE')).toBeTruthy();
  expect(await screen.findByText('A/C ending 9249')).toBeTruthy();
  expect(await screen.findByText('LOU SIM TENG')).toBeTruthy();
  expect(screen.getByTestId('needs-count-badge')).toHaveTextContent('0');

  // Credit shows with a "+" prefix in green; debit shows plain, like an expense.
  const creditAmount = within(screen.getByTestId('transaction-3')).getByText('+S$3.00');
  expect(creditAmount.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: colors.success })]),
  );
  expect(within(screen.getByTestId('transaction-2')).getByText('S$5.00')).toBeTruthy();
  expect(within(screen.getByTestId('transaction-2')).queryByText('+S$5.00')).toBeNull();

  // Debits add to the day total, credits subtract: 10 (CHICKEN RICE) + 5 (A/C ending 9249) - 3
  // (LOU SIM TENG) = 12.
  expect(screen.getByText('S$12.00')).toBeTruthy();
});

test('the Needs a category filter shows only uncategorized rows and the count badge', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', category: 'Food' }),
      makeTxn({ id: 2, merchant_raw: 'GRAB', category: null }),
    ],
  });

  renderWithProviders(<Activity />);

  await screen.findByText('CHICKEN RICE');
  fireEvent.press(screen.getByTestId('filter-needs'));
  expect(screen.queryByText('CHICKEN RICE')).toBeNull();
  expect(screen.getByText('GRAB')).toBeTruthy();
  expect(screen.getByText('Needs a category')).toBeTruthy();
  expect(screen.getByTestId('needs-count-badge')).toHaveTextContent('1');
});

test('quick sort banner navigates to QuickSort', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, category: null })] });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('filter-needs'));
  fireEvent.press(await screen.findByTestId('quick-sort-banner'));
  expect(mockNavigate).toHaveBeenCalledWith('QuickSort');
});

test('categorizing a transaction as a category with no subcategories closes the sheet after one step', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, merchant_raw: 'SHOPEE', category: null })] });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, merchant_raw: 'SHOPEE', category: 'Shopping' }));

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('cat-chip-Shopping'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Shopping', null, null);
});

test('categorizing a transaction as Food requires a second subcategory step', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, merchant_raw: 'SAIZERIYA', category: null })] });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, merchant_raw: 'SAIZERIYA', category: 'Food', subcategory: 'Dinner' }));

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('cat-chip-Food'));
  expect(await screen.findByText('Which kind of food?')).toBeTruthy();
  fireEvent.press(screen.getByTestId('sub-chip-Dinner'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Food', 'Dinner', null);
});

test('categorizing a transaction as Transport requires a second subcategory step', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, merchant_raw: 'BUS/MRT', category: null })] });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, merchant_raw: 'BUS/MRT', category: 'Transport', subcategory: 'Public' }));

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('cat-chip-Transport'));
  expect(await screen.findByText('Which kind of transport?')).toBeTruthy();
  fireEvent.press(screen.getByTestId('sub-chip-Public'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Transport', 'Public', null);
});

test('categorizing a transaction as Travel shows a country step before saving, pre-filled from the currency', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', currency: 'CHF', category: null })],
  });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', currency: 'CHF', category: 'Travel', subcategory: 'Transport' }));

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('cat-chip-Travel'));
  expect(await screen.findByText('Which kind of travel?')).toBeTruthy();
  fireEvent.press(screen.getByTestId('sub-chip-Transport'));

  // Picking the subcategory must NOT finalize immediately -- a country step appears first,
  // pre-filled from the transaction's currency, and nothing has been saved yet.
  expect(await screen.findByText('Which country?')).toBeTruthy();
  expect(updateSpy).not.toHaveBeenCalled();
  expect(screen.getByTestId('categorize-travel-country').props.value).toBe('Switzerland');

  fireEvent.press(screen.getByTestId('categorize-travel-save'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Travel', 'Transport', 'Switzerland');
});

test('the Travel country step can be edited before saving, and Back returns to subcategory picking without saving', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', currency: 'CHF', category: null })],
  });
  const updateSpy = jest.spyOn(client, 'updateTransactionCategory').mockResolvedValue(
    makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', currency: 'CHF', category: 'Travel', subcategory: 'Transport' }),
  );

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('cat-chip-Travel'));
  fireEvent.press(await screen.findByTestId('sub-chip-Transport'));
  await screen.findByTestId('categorize-travel-country');

  fireEvent.press(screen.getByTestId('categorize-travel-back'));
  expect(await screen.findByText('Which kind of travel?')).toBeTruthy();
  expect(updateSpy).not.toHaveBeenCalled();

  fireEvent.press(screen.getByTestId('sub-chip-Transport'));
  fireEvent.changeText(await screen.findByTestId('categorize-travel-country'), 'Liechtenstein');
  fireEvent.press(screen.getByTestId('categorize-travel-save'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Travel', 'Transport', 'Liechtenstein');
});

test('the detail sheet for a credit transaction shows credit categories, not expense ones', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'LOU SIM TENG', direction: 'credit', category: null })],
  });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));

  expect(await screen.findByTestId('cat-chip-Salary')).toBeTruthy();
  expect(screen.getByTestId('cat-chip-Transfer Received')).toBeTruthy();
  expect(screen.queryByTestId('cat-chip-Food')).toBeNull();
  expect(screen.queryByTestId('cat-chip-Groceries')).toBeNull();
});

test('the detail sheet for a debit transaction still shows the expense categories', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'SHOPEE', direction: 'debit', category: null })],
  });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));

  expect(await screen.findByTestId('cat-chip-Food')).toBeTruthy();
  expect(screen.queryByTestId('cat-chip-Salary')).toBeNull();
});

test('categorizing a credit transaction picks from the credit category list', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'LOU SIM TENG', direction: 'credit', category: null })],
  });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, merchant_raw: 'LOU SIM TENG', direction: 'credit', category: 'Transfer Received' }));

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('cat-chip-Transfer Received'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Transfer Received', null, null);
});

test('the detail sheet shows the transaction time, not just the date', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', txn_at: '2026-07-23T10:30:00Z' })],
  });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));

  expect(await screen.findByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).toBeTruthy();
});

test('deleting a transaction confirms, then removes it from the list', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', category: 'Food', subcategory: 'Lunch' })],
  });
  const deleteSpy = jest.spyOn(client, 'deleteTransaction').mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === 'Delete')?.onPress?.();
  });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('delete-transaction'));

  await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(1));
  await waitFor(() => expect(screen.queryByText('CHICKEN RICE')).toBeNull());
});

test('editing a transaction updates the merchant name and amount', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', category: 'Food', subcategory: 'Lunch' })],
  });
  const editSpy = jest.spyOn(client, 'updateTransactionDetails').mockResolvedValue(
    makeTxn({ id: 1, merchant_raw: 'Corrected Stall', merchant_clean: 'Corrected Stall', amount: '12.50', category: 'Food', subcategory: 'Lunch' }),
  );

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('edit-transaction'));

  fireEvent.changeText(screen.getByTestId('edit-merchant'), 'Corrected Stall');
  fireEvent.changeText(screen.getByTestId('edit-amount'), '12.50');
  fireEvent.press(screen.getByTestId('edit-save'));

  await waitFor(() => expect(editSpy).toHaveBeenCalledWith(1, 'Corrected Stall', '12.50', undefined, undefined));
  expect(await screen.findByText('Corrected Stall')).toBeTruthy();
});

test('editing a Travel transaction shows a pre-filled, editable country field and saves the correction', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', category: 'Travel', subcategory: 'Transport', currency: 'CHF', country: null }),
    ],
  });
  const editSpy = jest.spyOn(client, 'updateTransactionDetails').mockResolvedValue(
    makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', category: 'Travel', currency: 'CHF', country: 'Liechtenstein' }),
  );

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('edit-transaction'));

  // No explicit country was set, so it's pre-filled from the currency-derived guess.
  const countryInput = await screen.findByTestId('edit-country');
  expect(countryInput.props.value).toBe('Switzerland');

  fireEvent.changeText(countryInput, 'Liechtenstein');
  fireEvent.press(screen.getByTestId('edit-save'));

  await waitFor(() =>
    expect(editSpy).toHaveBeenCalledWith(1, 'SBB CFF FFS', '10.00', undefined, 'Liechtenstein'),
  );
});

test('editing a non-Travel transaction has no country field', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', category: 'Food' })],
  });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  fireEvent.press(await screen.findByTestId('edit-transaction'));

  await screen.findByTestId('edit-merchant');
  expect(screen.queryByTestId('edit-country')).toBeNull();
});

test('add transaction sheet requires amount, merchant and category before Save is enabled', async () => {
  mockClientDefaults({ transactions: [] });
  const createSpy = jest.spyOn(client, 'createTransaction').mockResolvedValue(
    makeTxn({ id: 99, merchant_raw: 'Star Western', category: 'Food' }),
  );

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  const saveButton = await screen.findByTestId('save-draft');
  fireEvent.press(saveButton);
  expect(createSpy).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByTestId('draft-amount'), '19.80');
  fireEvent.changeText(screen.getByTestId('draft-merchant'), 'Star Western');
  fireEvent.press(screen.getByTestId('draft-cat-Food'));
  fireEvent.press(saveButton);

  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({ amount: '19.80', merchant_raw: 'Star Western', category: 'Food' }),
  );
});

test('a manually added transaction is inserted in chronological order, not always pinned to the top', async () => {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'TODAY TXN', txn_at: today.toISOString() })],
  });
  // The provider inserts whatever the backend returns (`created`) into state -- its txn_at is
  // what determines sort position, regardless of what was typed into the draft form.
  jest.spyOn(client, 'createTransaction').mockResolvedValue(
    makeTxn({ id: 2, merchant_raw: 'LAST WEEK TXN', txn_at: lastWeek.toISOString() }),
  );

  renderWithProviders(<Activity />);
  await screen.findByTestId('transaction-1');

  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  fireEvent.changeText(screen.getByTestId('draft-amount'), '5.00');
  fireEvent.changeText(screen.getByTestId('draft-merchant'), 'Last Week Txn');
  fireEvent.press(screen.getByTestId('draft-cat-Food'));
  fireEvent.press(screen.getByTestId('save-draft'));

  await screen.findByTestId('transaction-2');
  const rows = screen.getAllByTestId(/^transaction-\d+$/);
  // Newer (today) first, older (last week) second -- a naive prepend would put the just-added
  // row first regardless of its actual date.
  expect(rows.map((r) => r.props.testID)).toEqual(['transaction-1', 'transaction-2']);
});

test('toggling Add Transaction to Income swaps the category list and clears a previous pick', async () => {
  mockClientDefaults({ transactions: [] });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  fireEvent.press(await screen.findByTestId('draft-cat-Food'));
  expect(screen.getByTestId('draft-cat-Food')).toBeTruthy();

  fireEvent.press(screen.getByTestId('draft-type-credit'));

  expect(screen.queryByTestId('draft-cat-Food')).toBeNull();
  expect(await screen.findByTestId('draft-cat-Salary')).toBeTruthy();
  // Save must be disabled again since the picked category didn't carry over.
  expect(screen.getByTestId('save-draft').props.accessibilityState?.disabled).toBeTruthy();
});

test('auto-categorize calls the backfill endpoint and refetches, showing a result toast', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'BUS/MRT', category: null })],
  });
  const categorizeSpy = jest
    .spyOn(client, 'categorizePending')
    .mockResolvedValue({ categorized: 1, remaining: 0 });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('filter-needs'));
  fireEvent.press(await screen.findByTestId('auto-categorize-button'));

  await waitFor(() => expect(categorizeSpy).toHaveBeenCalled());
  expect(await screen.findByText('Categorized 1, 0 left for Quick Sort')).toBeTruthy();
});

test('the auto-categorize action is hidden once nothing needs a category', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, category: 'Food' })] });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('filter-needs'));
  expect(screen.queryByTestId('auto-categorize-button')).toBeNull();
});

test('the country filter row is hidden when every transaction is SGD', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, currency: 'SGD' }), makeTxn({ id: 2, currency: 'SGD' })],
  });

  renderWithProviders(<Activity />);

  await screen.findByTestId('activity-screen');
  expect(screen.queryByTestId('country-filter-row')).toBeNull();
});

test('the country filter row appears once more than one country is present, and filters the list', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'NTUC', currency: 'SGD' }),
      makeTxn({ id: 2, merchant_raw: 'SBB CFF FFS', currency: 'CHF', bank: 'YouTrip' }),
    ],
  });

  renderWithProviders(<Activity />);

  expect(await screen.findByTestId('country-filter-row')).toBeTruthy();
  expect(screen.getByTestId('country-filter-all')).toBeTruthy();
  expect(screen.getByTestId('country-filter-Singapore')).toBeTruthy();
  expect(screen.getByTestId('country-filter-Switzerland')).toBeTruthy();
  expect(screen.getByText('NTUC')).toBeTruthy();
  expect(screen.getByText('SBB CFF FFS')).toBeTruthy();

  fireEvent.press(screen.getByTestId('country-filter-Switzerland'));

  expect(screen.queryByText('NTUC')).toBeNull();
  expect(screen.getByText('SBB CFF FFS')).toBeTruthy();

  fireEvent.press(screen.getByTestId('country-filter-all'));
  expect(screen.getByText('NTUC')).toBeTruthy();
});

test('a non-SGD transaction row shows its own currency instead of S$', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', currency: 'CHF', amount: '358.00' })],
  });

  renderWithProviders(<Activity />);

  await screen.findByText('SBB CFF FFS');
  // The day-group total (an aggregate across possibly-mixed currencies) intentionally stays
  // S$-formatted -- only the individual row shows its own currency.
  expect(within(screen.getByTestId('transaction-1')).getByText('CHF 358.00')).toBeTruthy();
});

test('the detail sheet for a non-SGD transaction shows its own currency', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'SBB CFF FFS', currency: 'CHF', amount: '358.00' })],
  });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('transaction-1'));
  expect(await screen.findAllByText('CHF 358.00')).not.toHaveLength(0);
});

test('the currency selector is collapsed by default and defaults to SGD with no interaction', async () => {
  mockClientDefaults({ transactions: [] });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  await screen.findByTestId('draft-currency-toggle');

  expect(screen.getByText('S$')).toBeTruthy();
  expect(screen.queryByTestId('draft-currency-CHF')).toBeNull();
});

test('picking a non-SGD currency in Add Transaction auto-selects Travel and pre-fills a country, and both can still be overridden', async () => {
  mockClientDefaults({ transactions: [] });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  fireEvent.press(await screen.findByTestId('draft-currency-toggle'));
  fireEvent.press(await screen.findByTestId('draft-currency-CHF'));

  // The chip row collapses again once a currency is picked.
  expect(screen.queryByTestId('draft-currency-CHF')).toBeNull();

  // Travel was auto-selected and the country pre-filled from the currency.
  expect((await screen.findByTestId('draft-country')).props.value).toBe('Switzerland');

  fireEvent.changeText(screen.getByTestId('draft-amount'), '50.00');
  fireEvent.changeText(screen.getByTestId('draft-merchant'), 'Somewhere Abroad');
  const autoCreateSpy = jest.spyOn(client, 'createTransaction').mockResolvedValue(
    makeTxn({ id: 51, merchant_raw: 'Somewhere Abroad', category: 'Travel', currency: 'CHF', country: 'Switzerland' }),
  );
  fireEvent.press(screen.getByTestId('save-draft'));
  expect(autoCreateSpy).toHaveBeenCalledWith(
    expect.objectContaining({ category: 'Travel', currency: 'CHF', country: 'Switzerland' }),
  );
  autoCreateSpy.mockRestore();

  // Still user-overridable -- picking a different category hides the country field, and a
  // manually-edited country sticks instead of the auto-filled guess.
  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  fireEvent.press(await screen.findByTestId('draft-currency-toggle'));
  fireEvent.press(await screen.findByTestId('draft-currency-CHF'));
  fireEvent.changeText(await screen.findByTestId('draft-country'), 'Liechtenstein');
  fireEvent.press(screen.getByTestId('draft-cat-Shopping'));
  expect(screen.queryByTestId('draft-country')).toBeNull();
  fireEvent.changeText(screen.getByTestId('draft-amount'), '50.00');
  fireEvent.changeText(screen.getByTestId('draft-merchant'), 'Duty Free');

  const createSpy = jest.spyOn(client, 'createTransaction').mockResolvedValue(
    makeTxn({ id: 50, merchant_raw: 'Duty Free', category: 'Shopping', currency: 'CHF' }),
  );
  fireEvent.press(screen.getByTestId('save-draft'));

  expect(createSpy).toHaveBeenCalledWith(
    expect.objectContaining({ currency: 'CHF', category: 'Shopping', country: null }),
  );
});
