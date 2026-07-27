import Svg, { Circle, Path, Rect } from "react-native-svg";

interface IconProps {
  color: string;
  size?: number;
}

export function HomeIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Rect x={3.2} y={7.6} width={15.6} height={11.2} rx={3} stroke={color} strokeWidth={1.6} />
      <Path d="M2 8.6L11 2.8l9 5.8" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function SummaryIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Circle cx={11} cy={11} r={8.2} stroke={color} strokeWidth={1.6} />
      <Path d="M11 2.8A8.2 8.2 0 0 1 19.2 11H11z" fill={color} />
    </Svg>
  );
}

export function ActivityIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path d="M3.5 6.5h15M3.5 11h15M3.5 15.5h9" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Circle cx={11} cy={11} r={8.2} stroke={color} strokeWidth={1.6} />
      <Circle cx={11} cy={11} r={2.8} fill={color} />
    </Svg>
  );
}

export const ROUTE_ICONS: Record<string, typeof HomeIcon> = {
  Home: HomeIcon,
  Summary: SummaryIcon,
  Activity: ActivityIcon,
  Settings: SettingsIcon,
};
