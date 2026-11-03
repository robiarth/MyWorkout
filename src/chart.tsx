import React, { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { series } from "./domain";
import { Button, Row, Txt, colors, date } from "./ui";
export function Chart({ points }: { points: ReturnType<typeof series> }) {
  const [index, setIndex] = useState<number>();
  const selected = points[index ?? points.length - 1];
  if (!points.length)
    return <Txt muted>Aucune série de travail validée pour ce filtre.</Txt>;
  const min = Math.min(...points.map((p) => p.value)),
    max = Math.max(...points.map((p) => p.value));
  const coords = points.map((p, i) => ({
    x: 30 + (points.length === 1 ? 0 : (i / (points.length - 1)) * 540),
    y: 150 - ((p.value - min) / Math.max(1, max - min)) * 120,
  }));
  return (
    <View style={{ gap: 8 }}>
      <Svg
        viewBox="0 0 600 180"
        width="100%"
        height={180}
        accessibilityLabel="Évolution de la charge en kilogrammes"
      >
        <Line x1="30" y1="155" x2="570" y2="155" stroke={colors.border} />
        <Polyline
          points={coords.map((c) => `${c.x},${c.y}`).join(" ")}
          stroke={colors.accent}
          strokeWidth="3"
          fill="none"
        />
        {coords.map((c, i) => (
          <Circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={i === (index ?? points.length - 1) ? 7 : 5}
            fill={colors.accent}
            onPress={() => setIndex(i)}
          />
        ))}
      </Svg>
      <Txt>
        {selected
          ? `${date(selected.date)} · ${selected.value.toFixed(1)} kg · ${selected.reps} répétition(s)`
          : ""}
      </Txt>
      <Row>
        <Button
          label="Point précédent"
          secondary
          disabled={(index ?? points.length - 1) <= 0}
          onPress={() =>
            setIndex(Math.max(0, (index ?? points.length - 1) - 1))
          }
        />
        <Button
          label="Point suivant"
          secondary
          disabled={(index ?? points.length - 1) >= points.length - 1}
          onPress={() =>
            setIndex(
              Math.min(points.length - 1, (index ?? points.length - 1) + 1),
            )
          }
        />
      </Row>
      <Txt muted>
        Du {date(points[0]!.date)} au {date(points.at(-1)!.date)} ·{" "}
        {min.toFixed(1)}–{max.toFixed(1)} kg
      </Txt>
    </View>
  );
}
