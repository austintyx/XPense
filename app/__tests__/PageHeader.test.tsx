import { screen } from '@testing-library/react-native';

import { PageHeader } from '../src/navigation/PageHeader';
import { mockClientDefaults, renderWithProviders } from '../src/testUtils';

jest.mock('../src/hooks/useIsMobileWeb', () => ({ useIsMobileWeb: jest.fn(() => false) }));
import { useIsMobileWeb } from '../src/hooks/useIsMobileWeb';

afterEach(() => {
  jest.restoreAllMocks();
});

test('desktop: renders the search box inline in a row layout', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(false);
  mockClientDefaults();

  renderWithProviders(<PageHeader activeRoute="Activity" />);

  expect(await screen.findByTestId('header-search')).toBeTruthy();
  const container = screen.getByTestId('page-header').props.style;
  expect(container).toEqual(expect.objectContaining({ flexDirection: 'row' }));
});

test('mobile: still renders the search box, but the header stacks into a column', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(true);
  mockClientDefaults();

  renderWithProviders(<PageHeader activeRoute="Activity" />);

  expect(await screen.findByTestId('header-search')).toBeTruthy();
  const container = screen.getByTestId('page-header').props.style;
  expect(container).toEqual(
    expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]),
  );
});

test('the search box only shows on the Activity route', async () => {
  mockClientDefaults();

  renderWithProviders(<PageHeader activeRoute="Home" />);

  await screen.findByTestId('page-header');
  expect(screen.queryByTestId('header-search')).toBeNull();
});
