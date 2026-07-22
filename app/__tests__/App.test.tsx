import { render, screen } from '@testing-library/react-native';
import App from '../App';

test('renders without crashing', () => {
  render(<App />);
  expect(screen.toJSON()).not.toBeNull();
});
