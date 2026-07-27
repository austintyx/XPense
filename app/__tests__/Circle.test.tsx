import { fireEvent, screen } from '@testing-library/react-native';

import Circle from '../src/screens/Circle';
import { mockClientDefaults, renderWithProviders } from '../src/testUtils';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockGoBack.mockClear();
});

test('renders the mocked friends with their goals and statuses', async () => {
  mockClientDefaults();

  renderWithProviders(<Circle />);

  expect(await screen.findByText('Marcus Lee')).toBeTruthy();
  expect(screen.getByText('Priya Nair')).toBeTruthy();
  expect(screen.getByText('Jun Hao')).toBeTruthy();
  expect(screen.getByText('Close to limit')).toBeTruthy();
});

test('nudging a friend flips the button to "Sent" (local state only)', async () => {
  mockClientDefaults();

  renderWithProviders(<Circle />);

  const nudgeButton = await screen.findByTestId('nudge-ML');
  expect(nudgeButton.props.children).toBe('Nudge');
  fireEvent.press(nudgeButton);
  await screen.findByText('Sent');
  expect(screen.getByTestId('nudge-ML').props.children).toBe('Sent');
});

test('back link returns to Settings', async () => {
  mockClientDefaults();

  renderWithProviders(<Circle />);

  fireEvent.press(await screen.findByTestId('circle-back'));
  expect(mockGoBack).toHaveBeenCalled();
});
