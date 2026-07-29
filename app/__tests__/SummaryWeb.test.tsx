import { screen } from '@testing-library/react-native';

import Summary from '../src/screens/Summary.web';
import { mockClientDefaults, renderWithProviders } from '../src/testUtils';

jest.mock('../src/hooks/useIsMobileWeb', () => ({ useIsMobileWeb: jest.fn(() => false) }));
import { useIsMobileWeb } from '../src/hooks/useIsMobileWeb';

afterEach(() => {
  jest.restoreAllMocks();
});

test('desktop: the chart/trend section lays out in a row', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(false);
  mockClientDefaults();

  renderWithProviders(<Summary />);

  const row = await screen.findByTestId('summary-chart-row');
  expect(row.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: 'row' })]),
  );
});

test('mobile: the chart/trend section stacks into a column', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(true);
  mockClientDefaults();

  renderWithProviders(<Summary />);

  const row = await screen.findByTestId('summary-chart-row');
  expect(row.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]),
  );
});
