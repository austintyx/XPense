import { NavigationContainer } from '@react-navigation/native';
import { screen } from '@testing-library/react-native';

import { MainTabs } from '../src/navigation/MainTabs.web';
import { mockClientDefaults, renderWithProviders } from '../src/testUtils';

jest.mock('../src/hooks/useIsMobileWeb', () => ({ useIsMobileWeb: jest.fn(() => false) }));
import { useIsMobileWeb } from '../src/hooks/useIsMobileWeb';

afterEach(() => {
  jest.restoreAllMocks();
});

test('desktop: shows the sidebar and hides the bottom tab bar', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(false);
  mockClientDefaults();

  renderWithProviders(
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>,
  );

  expect(await screen.findByTestId('web-sidebar')).toBeTruthy();
  expect(screen.queryByTestId('tab-Home')).toBeNull();
});

test('mobile: hides the sidebar and shows all 5 tabs including Budgets', async () => {
  (useIsMobileWeb as jest.Mock).mockReturnValue(true);
  mockClientDefaults();

  renderWithProviders(
    <NavigationContainer>
      <MainTabs />
    </NavigationContainer>,
  );

  expect(await screen.findByTestId('tab-Home')).toBeTruthy();
  expect(screen.getByTestId('tab-Summary')).toBeTruthy();
  expect(screen.getByTestId('tab-Activity')).toBeTruthy();
  expect(screen.getByTestId('tab-Budgets')).toBeTruthy();
  expect(screen.getByTestId('tab-Settings')).toBeTruthy();
  expect(screen.queryByTestId('web-sidebar')).toBeNull();
});
