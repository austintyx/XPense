import { fromDateString, toDateString } from '../src/utils/dateSerialization';

test('toDateString serializes local calendar fields, not UTC', () => {
  // 11pm local time on Jan 1 -- toISOString() would roll this to "2026-01-02" in a timezone
  // ahead of UTC, or keep "2026-01-01" behind UTC; toDateString must always reflect the local
  // calendar date regardless of the machine's timezone.
  const date = new Date(2026, 0, 1, 23, 0, 0);
  expect(toDateString(date)).toBe('2026-01-01');
});

test('toDateString pads single-digit month and day', () => {
  const date = new Date(2026, 2, 5);
  expect(toDateString(date)).toBe('2026-03-05');
});

test('fromDateString parses as local midnight, not UTC midnight', () => {
  const date = fromDateString('2026-07-04');
  expect(date.getFullYear()).toBe(2026);
  expect(date.getMonth()).toBe(6);
  expect(date.getDate()).toBe(4);
  expect(date.getHours()).toBe(0);
});

test('toDateString and fromDateString round-trip', () => {
  const original = new Date(2025, 11, 31);
  expect(toDateString(fromDateString(toDateString(original)))).toBe(toDateString(original));
});
