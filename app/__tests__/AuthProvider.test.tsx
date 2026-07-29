import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import * as client from '../src/api/client';
import { AuthProvider, useAuth } from '../src/store/AuthProvider';

function Probe() {
  const { ready, userId, sessionError, retryAuth } = useAuth();
  return (
    <>
      <Text testID="ready">{String(ready)}</Text>
      <Text testID="userId">{String(userId)}</Text>
      <Text testID="sessionError">{String(sessionError)}</Text>
      <Text testID="retry" onPress={retryAuth}>
        retry
      </Text>
    </>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('a network/timeout error retries with backoff and eventually surfaces sessionError without clearing storage', async () => {
  jest.useFakeTimers();
  await AsyncStorage.setItem('xpense.userId', '42');
  const getUserSpy = jest.spyOn(client, 'getUser').mockRejectedValue(new TypeError('Network request failed'));

  renderProbe();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(15000);
  });

  expect(getUserSpy).toHaveBeenCalledTimes(3);
  expect(screen.getByTestId('sessionError').props.children).toBe('true');
  expect(screen.getByTestId('userId').props.children).toBe('null');
  expect(await AsyncStorage.getItem('xpense.userId')).toBe('42');
  jest.useRealTimers();
});

test('a confirmed 404 clears the stored session immediately, without retrying', async () => {
  await AsyncStorage.setItem('xpense.userId', '999');
  const getUserSpy = jest.spyOn(client, 'getUser').mockRejectedValue(new client.ApiError('User not found', 404));

  renderProbe();

  await screen.findByText('null'); // userId resolves to null once the check completes
  expect(getUserSpy).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('sessionError').props.children).toBe('false');
  expect(await AsyncStorage.getItem('xpense.userId')).toBeNull();
});

test('retryAuth() re-runs the check and can succeed after a transient failure clears up', async () => {
  jest.useFakeTimers();
  await AsyncStorage.setItem('xpense.userId', '5');
  const getUserSpy = jest
    .spyOn(client, 'getUser')
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockResolvedValueOnce({ id: 5, email: 'test@example.com', name: null, created_at: '2026-01-01T00:00:00Z' });

  renderProbe();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(15000);
  });
  expect(screen.getByTestId('sessionError').props.children).toBe('true');

  fireEvent.press(screen.getByTestId('retry'));
  await act(async () => {
    await jest.advanceTimersByTimeAsync(15000);
  });

  expect(screen.getByTestId('userId').props.children).toBe('5');
  expect(screen.getByTestId('sessionError').props.children).toBe('false');
  expect(getUserSpy).toHaveBeenCalledTimes(4);
  jest.useRealTimers();
});
