import { fireEvent, render, screen } from '@testing-library/react-native';

import { Sidebar } from '../src/navigation/Sidebar';

test('renders all four routes', () => {
  render(<Sidebar activeRoute="Home" onNavigate={jest.fn()} />);

  expect(screen.getByTestId('sidebar-Home')).toBeTruthy();
  expect(screen.getByTestId('sidebar-Summary')).toBeTruthy();
  expect(screen.getByTestId('sidebar-Activity')).toBeTruthy();
  expect(screen.getByTestId('sidebar-Settings')).toBeTruthy();
});

test('calls onNavigate with the route name when a row is pressed', () => {
  const onNavigate = jest.fn();
  render(<Sidebar activeRoute="Home" onNavigate={onNavigate} />);

  fireEvent.press(screen.getByTestId('sidebar-Settings'));

  expect(onNavigate).toHaveBeenCalledWith('Settings');
});

test('highlights the active route differently from inactive ones', () => {
  render(<Sidebar activeRoute="Activity" onNavigate={jest.fn()} />);

  const active = screen.getByTestId('sidebar-Activity').props.style;
  const inactive = screen.getByTestId('sidebar-Home').props.style;

  expect(active).not.toEqual(inactive);
});
