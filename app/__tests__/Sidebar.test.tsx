import { fireEvent, render, screen } from '@testing-library/react-native';

import { Sidebar } from '../src/navigation/Sidebar';

const account = {
  id: 1,
  provider: 'google' as const,
  provider_email: 'weiling@gmail.com',
  last_synced_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  return render(
    <Sidebar
      activeRoute="Home"
      onNavigate={jest.fn()}
      reviewCount={0}
      accounts={[]}
      onAddExpense={jest.fn()}
      {...overrides}
    />,
  );
}

test('renders all five routes', () => {
  renderSidebar();

  expect(screen.getByTestId('sidebar-Home')).toBeTruthy();
  expect(screen.getByTestId('sidebar-Summary')).toBeTruthy();
  expect(screen.getByTestId('sidebar-Activity')).toBeTruthy();
  expect(screen.getByTestId('sidebar-Budgets')).toBeTruthy();
  expect(screen.getByTestId('sidebar-Settings')).toBeTruthy();
});

test('calls onNavigate with the route name when a row is pressed', () => {
  const onNavigate = jest.fn();
  renderSidebar({ onNavigate });

  fireEvent.press(screen.getByTestId('sidebar-Settings'));

  expect(onNavigate).toHaveBeenCalledWith('Settings');
});

test('highlights the active route differently from inactive ones', () => {
  renderSidebar({ activeRoute: 'Activity' });

  const active = screen.getByTestId('sidebar-Activity').props.style;
  const inactive = screen.getByTestId('sidebar-Home').props.style;

  expect(active).not.toEqual(inactive);
});

test('shows a badge on Activity when there are transactions needing review', () => {
  renderSidebar({ reviewCount: 3 });

  expect(screen.getByTestId('sidebar-activity-badge')).toHaveTextContent('3');
});

test('hides the review badge when there is nothing to review', () => {
  renderSidebar({ reviewCount: 0 });

  expect(screen.queryByTestId('sidebar-activity-badge')).toBeNull();
});

test('lists linked accounts in the Feeds card', () => {
  renderSidebar({ accounts: [account] });

  expect(screen.getByText('weiling@gmail.com')).toBeTruthy();
});

test('shows an empty state when no accounts are linked', () => {
  renderSidebar({ accounts: [] });

  expect(screen.getByText('No accounts linked')).toBeTruthy();
});

test('calls onAddExpense when the Add expense button is pressed', () => {
  const onAddExpense = jest.fn();
  renderSidebar({ onAddExpense });

  fireEvent.press(screen.getByTestId('sidebar-add-expense'));

  expect(onAddExpense).toHaveBeenCalled();
});
