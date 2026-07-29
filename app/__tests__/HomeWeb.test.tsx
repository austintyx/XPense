import { screen } from '@testing-library/react-native';

import Home from '../src/screens/Home.web';
import { mockClientDefaults, renderWithProviders } from '../src/testUtils';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/hooks/useIsMobileWeb', () => ({ useIsMobileWeb: jest.fn(() => false) }));
import { useIsMobileWeb } from '../src/hooks/useIsMobileWeb';

afterEach(() => {
  jest.restoreAllMocks();
  mockNavigate.mockClear();
});

test('desktop: page sections lay out in a row with proportional flex ratios', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(false);
  mockClientDefaults();

  renderWithProviders(<Home />);

  const heroRow = await screen.findByTestId('home-hero-row');
  expect(heroRow.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: 'row' })]),
  );
});

test('mobile: page sections stack into a single column', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(true);
  mockClientDefaults();

  renderWithProviders(<Home />);

  const heroRow = await screen.findByTestId('home-hero-row');
  const secondaryRow = screen.getByTestId('home-secondary-row');
  for (const row of [heroRow, secondaryRow]) {
    expect(row.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]),
    );
  }
});
