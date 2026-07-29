import { isMobileWebWidth } from '../src/hooks/useIsMobileWeb';

test('is true only when the platform is web and the width is below the breakpoint', () => {
  expect(isMobileWebWidth('web', 375)).toBe(true);
  expect(isMobileWebWidth('web', 639)).toBe(true);
});

test('is false at or above the breakpoint on web', () => {
  expect(isMobileWebWidth('web', 640)).toBe(false);
  expect(isMobileWebWidth('web', 1024)).toBe(false);
});

test('is always false on native, regardless of width', () => {
  expect(isMobileWebWidth('ios', 375)).toBe(false);
  expect(isMobileWebWidth('android', 375)).toBe(false);
});

test('accepts a custom breakpoint', () => {
  expect(isMobileWebWidth('web', 700, 768)).toBe(true);
  expect(isMobileWebWidth('web', 800, 768)).toBe(false);
});
