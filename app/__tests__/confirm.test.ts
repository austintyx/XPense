import { Alert, Platform } from 'react-native';

import { confirmDestructive } from '../src/utils/confirm';

afterEach(() => {
  Platform.OS = 'ios';
  jest.restoreAllMocks();
  delete (global as any).window;
});

test('on native, delegates to Alert.alert with a cancel and a destructive button', () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onConfirm = jest.fn();

  confirmDestructive({ title: 'Delete transaction?', message: "Can't be undone.", confirmLabel: 'Delete', onConfirm });

  expect(alertSpy).toHaveBeenCalledWith(
    'Delete transaction?',
    "Can't be undone.",
    expect.arrayContaining([
      expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
      expect.objectContaining({ text: 'Delete', style: 'destructive' }),
    ]),
  );

  const buttons = alertSpy.mock.calls[0][2];
  buttons?.find((b) => b.text === 'Delete')?.onPress?.();
  expect(onConfirm).toHaveBeenCalled();
});

test('on web, confirming via window.confirm invokes onConfirm', () => {
  Platform.OS = 'web';
  const onConfirm = jest.fn();
  (global as any).window = { confirm: jest.fn(() => true) };

  confirmDestructive({ title: 'Sign out?', message: 'Reconnect later.', confirmLabel: 'Sign out', onConfirm });

  expect(window.confirm).toHaveBeenCalledWith('Sign out?\n\nReconnect later.');
  expect(onConfirm).toHaveBeenCalled();
});

test('on web, cancelling via window.confirm does not invoke onConfirm', () => {
  Platform.OS = 'web';
  const onConfirm = jest.fn();
  (global as any).window = { confirm: jest.fn(() => false) };

  confirmDestructive({ title: 'Sign out?', message: 'Reconnect later.', confirmLabel: 'Sign out', onConfirm });

  expect(onConfirm).not.toHaveBeenCalled();
});
