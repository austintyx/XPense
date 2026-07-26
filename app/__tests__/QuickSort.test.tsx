import { fireEvent, screen } from '@testing-library/react-native';

import QuickSort from '../src/screens/QuickSort';
import * as client from '../src/api/client';
import { makeTxn, mockClientDefaults, renderWithProviders } from '../src/testUtils';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockGoBack.mockClear();
});

test('shows the first uncategorized transaction and the queue counter', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'GRAB', category: null }),
      makeTxn({ id: 2, merchant_raw: 'SHOPEE', category: null }),
    ],
  });

  renderWithProviders(<QuickSort />);

  expect(await screen.findByText('GRAB')).toBeTruthy();
  expect(screen.getByText('1 of 2')).toBeTruthy();
});

test('picking a category with no subcategories sorts the card and advances the queue', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'SHOPEE', category: null }),
      makeTxn({ id: 2, merchant_raw: 'NETFLIX', category: null }),
    ],
  });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, category: 'Shopping' }));

  renderWithProviders(<QuickSort />);

  await screen.findByText('SHOPEE');
  fireEvent.press(screen.getByTestId('qs-cat-Shopping'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Shopping', null);
  expect(await screen.findByText('NETFLIX')).toBeTruthy();
});

test('picking Food shows a subcategory step before sorting', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, merchant_raw: 'SAIZERIYA', category: null })] });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, category: 'Food', subcategory: 'Dinner' }));

  renderWithProviders(<QuickSort />);

  await screen.findByText('SAIZERIYA');
  fireEvent.press(screen.getByTestId('qs-cat-Food'));
  expect(await screen.findByText('Which kind of food?')).toBeTruthy();
  fireEvent.press(screen.getByTestId('qs-sub-Dinner'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Food', 'Dinner');
});

test('picking Transport shows a subcategory step before sorting', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, merchant_raw: 'GRAB', category: null })] });
  const updateSpy = jest
    .spyOn(client, 'updateTransactionCategory')
    .mockResolvedValue(makeTxn({ id: 1, category: 'Transport', subcategory: 'Private' }));

  renderWithProviders(<QuickSort />);

  await screen.findByText('GRAB');
  fireEvent.press(screen.getByTestId('qs-cat-Transport'));
  expect(await screen.findByText('Which kind of transport?')).toBeTruthy();
  fireEvent.press(screen.getByTestId('qs-sub-Private'));

  expect(updateSpy).toHaveBeenCalledWith(1, 'Transport', 'Private');
});

test('skip removes the card from this session without categorizing it', async () => {
  mockClientDefaults({
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'GRAB', category: null }),
      makeTxn({ id: 2, merchant_raw: 'SHOPEE', category: null }),
    ],
  });
  const updateSpy = jest.spyOn(client, 'updateTransactionCategory');

  renderWithProviders(<QuickSort />);

  await screen.findByText('GRAB');
  fireEvent.press(screen.getByTestId('qs-skip'));

  expect(await screen.findByText('SHOPEE')).toBeTruthy();
  expect(updateSpy).not.toHaveBeenCalled();
});

test('shows the done state once the queue is empty and "Back to spending" closes the flow', async () => {
  mockClientDefaults({ transactions: [makeTxn({ id: 1, merchant_raw: 'SHOPEE', category: null })] });
  jest.spyOn(client, 'updateTransactionCategory').mockResolvedValue(makeTxn({ id: 1, category: 'Shopping' }));

  renderWithProviders(<QuickSort />);

  await screen.findByText('SHOPEE');
  fireEvent.press(screen.getByTestId('qs-cat-Shopping'));

  expect(await screen.findByText('All sorted')).toBeTruthy();
  fireEvent.press(screen.getByTestId('quicksort-back-to-spending'));
  expect(mockGoBack).toHaveBeenCalled();
});
