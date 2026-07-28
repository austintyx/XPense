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

test('the All filter shows transfer and income transactions, excluded from the Needs a category count', async () => {
  mockClientDefaults({
    transactions: [makeTxn({ id: 1, merchant_raw: 'CHICKEN RICE', category: 'Food' })],
    transfers: [makeTxn({ id: 2, merchant_raw: 'A/C ending 9249', type: 'transfer', category: null })],
    income: [makeTxn({ id: 3, merchant_raw: 'LOU SIM TENG', type: 'income', category: null })],
  });

  renderWithProviders(<Activity />);

  expect(await screen.findByText('CHICKEN RICE')).toBeTruthy();
  expect(await screen.findByText('A/C ending 9249')).toBeTruthy();
  expect(await screen.findByText('LOU SIM TENG')).toBeTruthy();
  expect(screen.getByTestId('needs-count-badge')).toHaveTextContent('0');

  // Income shows with a "+" prefix in green; transfer shows plain, like an expense.
  const incomeAmount = within(screen.getByTestId('transaction-3')).getByText('+S$10.00');
  expect(incomeAmount.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: colors.success })]),
  );
  expect(within(screen.getByTestId('transaction-2')).getByText('S$10.00')).toBeTruthy();
  expect(within(screen.getByTestId('transaction-2')).queryByText('+S$10.00')).toBeNull();

  // Only income affects the day total (subtracts); transfer is excluded entirely: 10 - 10 = 0.
  expect(screen.getByText('S$0.00')).toBeTruthy();
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
