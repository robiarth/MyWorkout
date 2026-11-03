import React from "react";
import type { PlotProps } from "./chart-plot";
import { colors } from "./ui";
export function ChartPlot({ points, index, onSelect }: PlotProps) {
  return (
    <svg
      viewBox="0 0 600 180"
      width="100%"
      height={180}
      aria-label="Évolution de la charge en kilogrammes"
    >
      <line x1="30" y1="155" x2="570" y2="155" stroke={colors.border} />
      <polyline
        points={points.map((c) => `${c.x},${c.y}`).join(" ")}
        stroke={colors.accent}
        strokeWidth="3"
        fill="none"
      />
      {points.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={i === index ? 7 : 5}
          fill={colors.accent}
          role="button"
          tabIndex={0}
          aria-label={`Afficher le point ${i + 1} : ${c.label}`}
          onClick={() => onSelect(i)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(i);
            }
          }}
        />
      ))}
    </svg>
  );
}
