import { render, screen } from '@testing-library/react-native';
import App from '../App';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders without crashing', async () => {
  render(<App />);
  expect(screen.toJSON()).not.toBeNull();
  // let ConnectEmail's initial data fetch resolve before the test ends
  await screen.findByText('Connect Gmail');
});
