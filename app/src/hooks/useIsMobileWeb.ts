import { Platform, useWindowDimensions } from "react-native";

export const MOBILE_WEB_BREAKPOINT = 640;

// Exported separately so tests can exercise the breakpoint logic with plain arguments -- no
// Platform/useWindowDimensions mocking needed (jest-expo's haste defaultPlatform is always "ios",
// so Platform.OS can't be meaningfully mocked to "web" in a unit test anyway).
export function isMobileWebWidth(platformOS: string, width: number, breakpoint = MOBILE_WEB_BREAKPOINT): boolean {
  return platformOS === "web" && width < breakpoint;
}

export function useIsMobileWeb(): boolean {
  const { width } = useWindowDimensions();
  return isMobileWebWidth(Platform.OS, width);
}
