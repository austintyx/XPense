import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ManageCategories from '../src/screens/ManageCategories';
import * as client from '../src/api/client';
import { mockClientDefaults, renderWithProviders } from '../src/testUtils';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockGoBack.mockClear();
});

test('lists built-in categories with no remove affordance', async () => {
  mockClientDefaults();

  renderWithProviders(<ManageCategories />);

  expect(await screen.findByTestId('category-card-Food')).toBeTruthy();
  expect(screen.getByTestId('category-card-Transport')).toBeTruthy();
  expect(screen.queryByTestId('remove-category-Food')).toBeNull();
});

test('built-in Travel shows its default subcategory chips with no remove affordance', async () => {
  mockClientDefaults();

  renderWithProviders(<ManageCategories />);

  await screen.findByTestId('category-card-Travel');
  expect(screen.getByTestId('subcategory-Travel-Accommodations')).toBeTruthy();
  expect(screen.getByTestId('subcategory-Travel-Transport')).toBeTruthy();
  expect(screen.queryByTestId('remove-category-Travel')).toBeNull();
});

test('built-in Food shows its default subcategory chips with no remove affordance', async () => {
  mockClientDefaults();

  renderWithProviders(<ManageCategories />);

  await screen.findByTestId('category-card-Food');
  expect(screen.getByTestId('subcategory-Food-Breakfast')).toBeTruthy();
  expect(screen.getByTestId('subcategory-Food-Beverage')).toBeTruthy();
});

test('adding a category calls the API and renders a new card with a remove affordance', async () => {
  mockClientDefaults();
  const createSpy = jest.spyOn(client, 'createCategory').mockResolvedValue({ id: 55, name: 'Pets' });

  renderWithProviders(<ManageCategories />);

  await screen.findByTestId('category-card-Food');
  fireEvent.changeText(screen.getByTestId('new-category-input'), 'Pets');
  fireEvent.press(screen.getByTestId('add-category-button'));

  expect(createSpy).toHaveBeenCalledWith('Pets');
  expect(await screen.findByTestId('category-card-Pets')).toBeTruthy();
  expect(screen.getByTestId('remove-category-55')).toBeTruthy();
});

test('removing a custom category calls the API and the card disappears', async () => {
  mockClientDefaults({ categories: { categories: [{ id: 9, name: 'Pets' }], subcategories: [] } });
  const deleteSpy = jest.spyOn(client, 'deleteCategory').mockResolvedValue(undefined);

  renderWithProviders(<ManageCategories />);

  fireEvent.press(await screen.findByTestId('remove-category-9'));

  expect(deleteSpy).toHaveBeenCalledWith(9);
  await waitFor(() => expect(screen.queryByTestId('category-card-Pets')).toBeNull());
});

test('centers the content column instead of stretching full width, matching Settings', async () => {
  mockClientDefaults();

  renderWithProviders(<ManageCategories />);

  await screen.findByTestId('category-card-Food');
  const content = screen.getByTestId('manage-categories-screen').props.contentContainerStyle;
  expect(content).toEqual(
    expect.objectContaining({ maxWidth: 640, width: '100%', alignSelf: 'center' }),
  );
});

test('adding a subcategory under Food calls the API and renders a removable chip', async () => {
  mockClientDefaults();
  const createSubSpy = jest
    .spyOn(client, 'createSubcategory')
    .mockResolvedValue({ id: 21, category: 'Food', name: 'Coffee' });

  renderWithProviders(<ManageCategories />);

  await screen.findByTestId('category-card-Food');
  fireEvent.changeText(screen.getByTestId('new-subcategory-input-Food'), 'Coffee');
  fireEvent.press(screen.getByTestId('add-subcategory-button-Food'));

  expect(createSubSpy).toHaveBeenCalledWith('Food', 'Coffee');
  expect(await screen.findByTestId('remove-subcategory-21')).toBeTruthy();
});

test('removing a custom subcategory calls the API and the chip disappears', async () => {
  mockClientDefaults({
    categories: { categories: [], subcategories: [{ id: 21, category: 'Food', name: 'Coffee' }] },
  });
  const deleteSubSpy = jest.spyOn(client, 'deleteSubcategory').mockResolvedValue(undefined);

  renderWithProviders(<ManageCategories />);

  fireEvent.press(await screen.findByTestId('remove-subcategory-21'));

  expect(deleteSubSpy).toHaveBeenCalledWith(21);
  await waitFor(() => expect(screen.queryByTestId('remove-subcategory-21')).toBeNull());
});
