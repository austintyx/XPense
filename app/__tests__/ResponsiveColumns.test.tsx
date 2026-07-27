import { Platform, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { ResponsiveColumns } from '../src/components/ResponsiveColumns';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 375, height: 800 })),
}));

const useWindowDimensions = jest.requireMock('react-native/Libraries/Utilities/useWindowDimensions').default;

afterEach(() => {
  Platform.OS = 'ios';
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 375, height: 800 });
});

test('stacks children on native regardless of window width', () => {
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1400, height: 900 });

  render(
    <ResponsiveColumns testID="cols" left={<Text>Left content</Text>} right={<Text>Right content</Text>} />,
  );

  expect(screen.getByTestId('cols').props.style).toBeUndefined();
  expect(screen.getByText('Left content')).toBeTruthy();
  expect(screen.getByText('Right content')).toBeTruthy();
});

test('stacks children on web when the window is narrower than the threshold', () => {
  Platform.OS = 'web';
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 600, height: 900 });

  render(
    <ResponsiveColumns testID="cols" left={<Text>Left content</Text>} right={<Text>Right content</Text>} />,
  );

  expect(screen.getByTestId('cols').props.style).toBeUndefined();
});

test('renders left/right side by side on a wide web window', () => {
  Platform.OS = 'web';
  (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1400, height: 900 });

  render(
    <ResponsiveColumns testID="cols" left={<Text>Left content</Text>} right={<Text>Right content</Text>} />,
  );

  expect(screen.getByTestId('cols').props.style).toMatchObject({ flexDirection: 'row' });
  expect(screen.getByText('Left content')).toBeTruthy();
  expect(screen.getByText('Right content')).toBeTruthy();
});
