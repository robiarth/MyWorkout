import React from "react";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { colors } from "./ui";
export type PlotProps = {
  points: { x: number; y: number; label: string }[];
  index: number;
  onSelect: (index: number) => void;
};
export function ChartPlot({ points, index, onSelect }: PlotProps) {
  return (
    <Svg
      viewBox="0 0 600 180"
      width="100%"
      height={180}
      accessibilityLabel="Évolution de la charge en kilogrammes"
    >
      <Line x1="30" y1="155" x2="570" y2="155" stroke={colors.border} />
      <Polyline
        points={points.map((c) => `${c.x},${c.y}`).join(" ")}
        stroke={colors.accent}
        strokeWidth="3"
        fill="none"
      />
      {points.map((c, i) => (
        <Circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={i === index ? 7 : 5}
          fill={colors.accent}
          accessibilityLabel={c.label}
          onPress={() => onSelect(i)}
        />
      ))}
    </Svg>
  );
}
