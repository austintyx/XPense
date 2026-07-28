import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Budgets from '../src/screens/Budgets';
import * as client from '../src/api/client';
import { makeSubscription, makeTxn, mockClientDefaults, renderWithProviders } from '../src/testUtils';

beforeEach(() => {
  jest.spyOn(client, 'getCategoryBudgets').mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('shows manually-added subscriptions alongside auto-detected recurring charges', async () => {
  mockClientDefaults({
    subscriptions: [makeSubscription({ id: 1, name: 'Netflix', amount: '14.98', frequency: 'monthly' })],
    transactions: [
      makeTxn({ id: 1, merchant_raw: 'GYM', category: 'Health', amount: '50.00', txn_at: '2026-05-15T10:00:00Z' }),
      makeTxn({ id: 2, merchant_raw: 'GYM', category: 'Health', amount: '50.00', txn_at: '2026-06-15T10:00:00Z' }),
      makeTxn({ id: 3, merchant_raw: 'GYM', category: 'Health', amount: '50.00', txn_at: '2026-07-15T10:00:00Z' }),
    ],
  });

  renderWithProviders(<Budgets />);

  expect(await screen.findByText('Netflix')).toBeTruthy();
  expect(screen.getByText('GYM')).toBeTruthy();
});

test('adding a subscription calls createSubscription and shows it in the list', async () => {
  mockClientDefaults({});
  const createSpy = jest
    .spyOn(client, 'createSubscription')
    .mockResolvedValue(makeSubscription({ id: 2, name: 'Spotify', amount: '9.90', frequency: 'monthly' }));

  renderWithProviders(<Budgets />);

  fireEvent.press(await screen.findByTestId('add-subscription'));
  fireEvent.changeText(screen.getByTestId('sub-name'), 'Spotify');
  fireEvent.changeText(screen.getByTestId('sub-amount'), '9.90');
  fireEvent.press(screen.getByTestId('save-subscription'));

  expect(createSpy).toHaveBeenCalledWith('Spotify', '9.90', 'monthly', expect.any(String));
  expect(await screen.findByText('Spotify')).toBeTruthy();
});

test('deleting a manual subscription calls removeSubscription and removes it from the list', async () => {
  mockClientDefaults({
    subscriptions: [makeSubscription({ id: 3, name: 'Disney+', amount: '11.98', frequency: 'monthly' })],
  });
  const deleteSpy = jest.spyOn(client, 'deleteSubscription').mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === 'Delete')?.onPress?.();
  });

  renderWithProviders(<Budgets />);

  await screen.findByText('Disney+');
  fireEvent.press(screen.getByTestId('delete-sub-3'));

  expect(deleteSpy).toHaveBeenCalledWith(3);
  expect(await screen.findByText('Nothing recurring detected yet.')).toBeTruthy();
});

test('normalizes a yearly manual subscription to its monthly-equivalent share of the total', async () => {
  mockClientDefaults({
    subscriptions: [makeSubscription({ id: 4, name: 'Domain renewal', amount: '120.00', frequency: 'yearly' })],
  });

  renderWithProviders(<Budgets />);

  await screen.findByText('Domain renewal');
  // 120/year -> 10/month, shown as the monthly-equivalent amount for that row.
  expect(screen.getByText('S$10.00')).toBeTruthy();
  expect(screen.getByText('S$10 a month across 1 service')).toBeTruthy();
});

test('editing the monthly budget target saves via the API', async () => {
  mockClientDefaults();
  const updateBudgetSpy = jest.spyOn(client, 'updateBudget').mockResolvedValue({
    user_id: 1,
    monthly_target: '2500.00',
    weekly_target: '357.14',
    daily_target: '83.33',
  });

  renderWithProviders(<Budgets />);

  fireEvent.press(await screen.findByTestId('edit-budget-toggle'));
  fireEvent.changeText(screen.getByTestId('budget-input'), '2500');
  fireEvent.press(screen.getByTestId('save-budget'));

  expect(updateBudgetSpy).toHaveBeenCalledWith('2500');
});

test('editing the savings goal saves via the API', async () => {
  mockClientDefaults();
  const updateGoalSpy = jest.spyOn(client, 'updateGoal').mockResolvedValue({
    user_id: 1,
    name: 'Japan, next April',
    target_amount: '3000.00',
    saved_amount: '1850.00',
  });

  renderWithProviders(<Budgets />);

  fireEvent.press(await screen.findByTestId('edit-goal-toggle'));
  fireEvent.changeText(screen.getByTestId('goal-name-input'), 'Japan, next April');
  fireEvent.changeText(screen.getByTestId('goal-target-input'), '3000');
  fireEvent.changeText(screen.getByTestId('goal-saved-input'), '1850');
  fireEvent.press(screen.getByTestId('save-goal'));

  expect(updateGoalSpy).toHaveBeenCalledWith({ name: 'Japan, next April', target_amount: '3000', saved_amount: '1850' });
});
