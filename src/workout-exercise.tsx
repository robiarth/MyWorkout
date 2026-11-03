import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SessionExercise, WorkoutSet, conventionLabels } from "./domain";
import { Button, NumberField, Row, Toggle, colors } from "./ui";

type Props = {
  exercise: SessionExercise;
  position: number;
  total: number;
  comparison: React.ReactNode;
  compare: boolean;
  onCompare: () => void;
  onChange: (id: string, patch: Partial<WorkoutSet>) => Promise<void>;
  onValidate: (id: string) => Promise<void>;
  onRemoveSet: (id: string) => Promise<void>;
  onAddSet: () => Promise<void>;
  onReplace: () => void;
  onRemove: () => Promise<void>;
  onMoveUp: () => Promise<void>;
};

export function WorkoutExercise({
  exercise: e,
  position,
  total,
  comparison,
  compare,
  onCompare,
  onChange,
  onValidate,
  onRemoveSet,
  onAddSet,
  onReplace,
  onRemove,
  onMoveUp,
}: Props) {
  const [options, setOptions] = useState(false),
    [setOptionsId, setSetOptionsId] = useState<string>();
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!alive) return;
        if (reduce) {
          entrance.setValue(1);
          return;
        }
        Animated.timing(entrance, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      })
      .catch(() => {
        if (alive) entrance.setValue(1);
      });
    return () => {
      alive = false;
      entrance.stopAnimation();
    };
  }, [entrance]);
  const work = e.sets.filter((t) => !t.warmup),
    completed = work.filter((t) => t.done).length;
  const unit = e.config.exercise.convention
    ? conventionLabels[e.config.exercise.convention]
    : e.config.exercise.measure === "duration"
      ? "Durée en secondes"
      : "Répétitions seules";
  return (
    <Animated.View
      style={[
        s.panel,
        {
          opacity: entrance.interpolate({
            inputRange: [0, 1],
            outputRange: [0.65, 1],
          }),
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={s.topline}>
        <View style={s.tag}>
          <Text style={s.tagText}>
            {String(position + 1).padStart(2, "0")} /{" "}
            {String(total).padStart(2, "0")}
          </Text>
        </View>
        <Text
          style={s.counter}
          accessibilityLabel={`Exercice ${position + 1} sur ${total}, ${completed} séries sur ${work.length} validées`}
          accessibilityLiveRegion="polite"
        >
          {completed === work.length && work.length > 0
            ? "✓ Terminé"
            : `${completed}/${work.length} séries`}
        </Text>
        <Button
          label={
            compare
              ? "Masquer la comparaison"
              : "Comparer à la séance précédente"
          }
          text={compare ? "Fermer ↗" : "Comparer ↗"}
          secondary
          style={s.compare}
          textStyle={s.compareText}
          onPress={onCompare}
        />
        <Button
          label="Gérer l’exercice courant"
          text="•••"
          secondary
          style={s.more}
          onPress={() => setOptions(!options)}
        />
      </View>
      <Text accessibilityRole="header" style={s.name}>
        {e.config.exercise.name}
      </Text>
      <View style={s.metadata}>
        <Text style={s.meta}>{e.config.exercise.muscle || "Musculation"}</Text>
        <Text style={s.metaDot}>·</Text>
        <Text style={s.meta}>
          {e.config.min}–{e.config.max}{" "}
          {e.config.exercise.measure === "duration" ? "s" : "répétitions"}
        </Text>
        <Text style={s.metaDot}>·</Text>
        <Text style={s.meta}>{e.config.rest}s de repos</Text>
      </View>
      {compare && <View style={s.comparison}>{comparison}</View>}
      <View style={s.table}>
        <View style={s.tableHead}>
          <Text style={[s.columnLabel, s.number]}>SÉRIE</Text>
          {e.config.exercise.measure === "load" && (
            <Text style={[s.columnLabel, s.valueColumn]}>KG</Text>
          )}
          <Text style={[s.columnLabel, s.valueColumn]}>
            {e.config.exercise.measure === "duration" ? "SECONDES" : "REPS"}
          </Text>
          <Text style={[s.columnLabel, s.validation]}>OK</Text>
          <View style={s.menuColumn} />
        </View>
        {e.sets.map((t, i) => (
          <View key={t.id}>
            <View style={[s.setRow, t.done && s.setDone]}>
              <View style={s.number}>
                <View
                  style={[
                    s.numberPill,
                    t.done && s.numberDone,
                    t.warmup && s.warmupPill,
                  ]}
                >
                  <Text
                    style={[s.numberText, t.done && { color: colors.accent }]}
                  >
                    {t.warmup ? "É" : i + 1}
                  </Text>
                </View>
              </View>
              {e.config.exercise.measure === "load" && (
                <View style={s.valueColumn}>
                  <NumberField
                    hideLabel
                    inputStyle={[s.input, t.done && s.inputDone]}
                    label={`Charge série ${i + 1} ${e.config.exercise.name}`}
                    value={t.load}
                    onChange={(load) =>
                      void onChange(t.id, { load }).catch(() => {})
                    }
                  />
                </View>
              )}
              <View style={s.valueColumn}>
                <NumberField
                  hideLabel
                  inputStyle={[s.input, t.done && s.inputDone]}
                  label={`${e.config.exercise.measure === "duration" ? "Secondes" : "Répétitions"} série ${i + 1} ${e.config.exercise.name}`}
                  value={t.reps}
                  onChange={(reps) => {
                    if (reps > 0) void onChange(t.id, { reps }).catch(() => {});
                  }}
                />
              </View>
              <Button
                label={`${t.done ? "Annuler" : "Valider"} série ${i + 1} ${e.config.exercise.name}`}
                text={t.done ? "✓" : "○"}
                secondary={!t.done}
                style={[s.validate, t.done && s.validated]}
                textStyle={[s.checkText, !t.done && { color: colors.muted }]}
                onPress={() => onValidate(t.id)}
              />
              <Button
                label={`Options série ${i + 1} ${e.config.exercise.name}`}
                text="⋮"
                secondary
                style={s.setMenu}
                textStyle={s.menuText}
                onPress={() =>
                  setSetOptionsId(setOptionsId === t.id ? undefined : t.id)
                }
              />
            </View>
            {setOptionsId === t.id && (
              <View style={s.setOptions}>
                <Text style={s.hint}>
                  Objectif :{" "}
                  {e.config.exercise.measure === "load"
                    ? `${t.targetLoad} kg × `
                    : ""}
                  {t.targetReps}
                  {e.config.exercise.measure === "duration" ? " s" : " reps"}
                </Text>
                <Toggle
                  label={`Échauffement série ${i + 1} ${e.config.exercise.name}`}
                  value={t.warmup}
                  onChange={(warmup) =>
                    void onChange(t.id, { warmup }).catch(() => {})
                  }
                />
                <Button
                  label={`Retirer série ${i + 1} ${e.config.exercise.name}`}
                  text="Retirer cette série"
                  secondary
                  danger
                  onPress={() => onRemoveSet(t.id)}
                />
              </View>
            )}
          </View>
        ))}
      </View>
      <Text style={s.unit}>
        {unit} · {e.sets.some((t) => t.warmup) ? "É = échauffement · " : ""}
        Touchez ○ pour valider
      </Text>
      <Button
        label={`Ajouter une série ${e.config.exercise.name}`}
        text="＋ Ajouter une série"
        secondary
        style={s.add}
        textStyle={s.addText}
        onPress={onAddSet}
      />
      {options && (
        <View style={s.exerciseOptions}>
          <Text style={s.optionsTitle}>Ajuster cet exercice</Text>
          <Row>
            {position > 0 && (
              <Button
                label={`Monter ${e.config.exercise.name}`}
                text="↑ Monter"
                secondary
                onPress={onMoveUp}
              />
            )}
            <Button
              label={`Remplacer ${e.config.exercise.name}`}
              text="Remplacer"
              secondary
              onPress={onReplace}
            />
            <Button
              label={`Retirer ${e.config.exercise.name}`}
              text="Retirer l’exercice"
              secondary
              danger
              onPress={onRemove}
            />
          </Row>
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: "#142131",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2b4054",
    padding: 14,
    gap: 8,
    overflow: "hidden",
  },
  topline: { flexDirection: "row", alignItems: "center", gap: 6 },
  tag: {
    backgroundColor: "#233d3a",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  tagText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  counter: { color: colors.muted, fontSize: 12, flex: 1 },
  more: {
    minHeight: 44,
    width: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 29,
    letterSpacing: -0.7,
  },
  metadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  meta: { color: colors.muted, fontSize: 12 },
  metaDot: { color: "#5d8092" },
  compare: {
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  compareText: { fontSize: 12, color: "#7fe2eb" },
  comparison: {
    gap: 8,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#0d1926",
    borderWidth: 1,
    borderColor: "#2b4054",
  },
  table: { gap: 4 },
  tableHead: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingBottom: 4,
  },
  columnLabel: {
    color: "#8da6b9",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
  number: { width: 38, alignItems: "center", justifyContent: "center" },
  valueColumn: { flex: 1, minWidth: 0 },
  validation: { width: 48 },
  menuColumn: { width: 28 },
  setRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderRadius: 13,
    paddingVertical: 2,
  },
  setDone: { backgroundColor: "#1b332d" },
  numberPill: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#223346",
    alignItems: "center",
    justifyContent: "center",
  },
  numberDone: { backgroundColor: "#284938" },
  warmupPill: { borderWidth: 1, borderColor: "#c8ad6d" },
  numberText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  input: {
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 48,
    borderColor: "#31465b",
    backgroundColor: "#0d1826",
    borderRadius: 11,
  },
  inputDone: { borderColor: "#35533e", color: colors.accent },
  validate: {
    width: 48,
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: "center",
    borderRadius: 13,
  },
  validated: { backgroundColor: colors.accent },
  checkText: { fontSize: 23 },
  setMenu: {
    width: 28,
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  menuText: { fontSize: 23, color: colors.muted },
  setOptions: {
    padding: 12,
    gap: 9,
    backgroundColor: "#0d1926",
    borderRadius: 12,
    marginBottom: 8,
  },
  hint: { color: colors.muted, fontSize: 12 },
  unit: { color: "#91a9bc", fontSize: 11, lineHeight: 16 },
  add: {
    minHeight: 44,
    borderStyle: "dashed",
    borderColor: "#3b5361",
    backgroundColor: "transparent",
    alignItems: "center",
  },
  addText: { color: "#9bb7c9", fontSize: 13 },
  exerciseOptions: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#2b4054",
    paddingTop: 16,
  },
  optionsTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
});
