import React, { useState } from "react";
import { View } from "react-native";
import { ChartPlot } from "./chart-plot";
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
    label: `${date(p.date)} · ${p.value.toFixed(1)} kg · ${p.reps} répétitions`,
  }));
  return (
    <View style={{ gap: 8 }}>
      <ChartPlot
        points={coords}
        index={index ?? points.length - 1}
        onSelect={setIndex}
      />
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
