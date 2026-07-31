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

  expect(updateSpy).toHaveBeenCalledWith(1, 'Shopping', null);
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

  expect(updateSpy).toHaveBeenCalledWith(1, 'Food', 'Dinner');
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

  expect(updateSpy).toHaveBeenCalledWith(1, 'Transport', 'Public');
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

  expect(updateSpy).toHaveBeenCalledWith(1, 'Transfer Received', null);
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

  await waitFor(() => expect(editSpy).toHaveBeenCalledWith(1, 'Corrected Stall', '12.50'));
  expect(await screen.findByText('Corrected Stall')).toBeTruthy();
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

test('picking a non-SGD currency in Add Transaction auto-selects Travel, and it can still be overridden', async () => {
  mockClientDefaults({ transactions: [] });

  renderWithProviders(<Activity />);

  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  fireEvent.press(await screen.findByTestId('draft-currency-CHF'));

  // Travel was auto-selected -- confirmed via save below, which would fail validation
  // (canSave requires a category) if nothing had been picked.
  fireEvent.changeText(screen.getByTestId('draft-amount'), '50.00');
  fireEvent.changeText(screen.getByTestId('draft-merchant'), 'Somewhere Abroad');
  const autoCreateSpy = jest.spyOn(client, 'createTransaction').mockResolvedValue(
    makeTxn({ id: 51, merchant_raw: 'Somewhere Abroad', category: 'Travel', currency: 'CHF' }),
  );
  fireEvent.press(screen.getByTestId('save-draft'));
  expect(autoCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ category: 'Travel', currency: 'CHF' }));
  autoCreateSpy.mockRestore();

  // Still user-overridable -- picking a different category must stick.
  fireEvent.press(await screen.findByTestId('add-transaction-button'));
  fireEvent.press(await screen.findByTestId('draft-currency-CHF'));
  fireEvent.press(screen.getByTestId('draft-cat-Shopping'));
  fireEvent.changeText(screen.getByTestId('draft-amount'), '50.00');
  fireEvent.changeText(screen.getByTestId('draft-merchant'), 'Duty Free');

  const createSpy = jest.spyOn(client, 'createTransaction').mockResolvedValue(
    makeTxn({ id: 50, merchant_raw: 'Duty Free', category: 'Shopping', currency: 'CHF' }),
  );
  fireEvent.press(screen.getByTestId('save-draft'));

  expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ currency: 'CHF', category: 'Shopping' }));
});
