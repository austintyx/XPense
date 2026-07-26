import Svg, { Path } from "react-native-svg";

const GAP_RADIANS = 0.035;

export interface DonutSegment {
  id: string;
  value: number;
  color: string;
}

interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const point = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = point(r1, a0);
  const [x1, y1] = point(r1, a1);
  const [x2, y2] = point(r0, a1);
  const [x3, y3] = point(r0, a0);
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

export function Donut({
  segments,
  size = 196,
  innerRadius = 56,
  outerRadius = 88,
  selectedId = null,
  onSelect,
}: DonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const center = size / 2;
  let angle = -Math.PI / 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg) => {
        if (total <= 0 || seg.value <= 0) return null;
        const fraction = seg.value / total;
        const startAngle = angle;
        const endAngle = angle + fraction * Math.PI * 2 - GAP_RADIANS;
        angle += fraction * Math.PI * 2;
        const dimmed = selectedId !== null && selectedId !== seg.id;
        return (
          <Path
            key={seg.id}
            d={arcPath(center, center, innerRadius, outerRadius, startAngle, endAngle)}
            fill={seg.color}
            opacity={dimmed ? 0.28 : 1}
            onPress={onSelect ? () => onSelect(seg.id) : undefined}
          />
        );
      })}
    </Svg>
  );
}
