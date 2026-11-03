import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStore } from "../src/store";
import {
  Session,
  SessionExercise,
  WorkoutSet,
  applySessionToTemplate,
  clone,
  lastExercise,
  lastSession,
  newConfig,
  newId,
  propose,
  sessionSchema,
} from "../src/domain";
import {
  Button,
  Card,
  Heading,
  Page,
  Row,
  Title,
  Toggle,
  Txt,
  colors,
  date,
} from "../src/ui";
import { ExercisePicker } from "../src/exercise-picker";
import { WorkoutExercise } from "../src/workout-exercise";
import { scheduleRest } from "../src/notifications";

function Results({ exercise }: { exercise: SessionExercise | undefined }) {
  return (
    <Txt muted>
      {exercise
        ? exercise.sets
            .filter((s) => !s.warmup)
            .map(
              (s) =>
                `${s.done ? "✓" : "—"} ${exercise.config.exercise.measure === "load" ? `${s.load} kg × ` : ""}${s.reps}${exercise.config.exercise.measure === "duration" ? " s" : ""}`,
            )
            .join(" · ")
        : "Aucun résultat précédent"}
    </Txt>
  );
}
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Workout() {
  const { state, change, setMessage } = useStore(),
    router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [selected, setSelected] = useState<string>(),
    [activeId, setActiveId] = useState<string>();
  const [compare, setCompare] = useState(false),
    [settings, setSettings] = useState(false),
    [picker, setPicker] = useState<string | "add" | null>(null);
  const [undo, setUndo] = useState<Session>(),
    [finished, setFinished] = useState<string>(),
    [abandoning, setAbandoning] = useState(false),
    [now, setNow] = useState(Date.now());
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const drafts = state.sessions.filter((s) => !s.finishedAt);
  const session = state.sessions.find(
    (s) =>
      s.id ===
      (params.id ??
        selected ??
        (drafts.length === 1 ? drafts[0]?.id : undefined)),
  );
  useEffect(() => {
    setActiveId(undefined);
    setUndo(undefined);
    setCompare(false);
    setPicker(null);
    setSettings(false);
    setAbandoning(false);
  }, [session?.id]);
  useEffect(() => {
    if (!activeId && session?.exercises.length) {
      const first =
        session.exercises.find((e) =>
          e.sets.some((t) => !t.done && !t.warmup),
        ) ?? session.exercises.at(-1);
      setActiveId(first?.config.id);
    }
  }, [activeId, session?.id, session?.exercises]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function update(fn: (s: Session) => Session, remember = false) {
    if (!session) return;
    const previous = session;
    await change((s) => ({
      ...s,
      sessions: s.sessions.map((x) =>
        x.id === previous.id ? sessionSchema.parse(fn(x)) : x,
      ),
    }));
    if (remember) setUndo(clone(previous));
  }
  async function setValue(
    exerciseId: string,
    setId: string,
    patch: Partial<WorkoutSet>,
  ) {
    await update((s) => ({
      ...s,
      exercises: s.exercises.map((e) =>
        e.config.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((t) =>
                t.id === setId ? { ...t, ...patch } : t,
              ),
            }
          : e,
      ),
    }));
  }
  async function finish() {
    if (!session) return;
    if (!session.exercises.some((e) => e.sets.some((t) => t.done && !t.warmup)))
      throw new Error("Validez au moins une série de travail.");
    await update((s) => ({
      ...s,
      finishedAt: new Date().toISOString(),
      restEndsAt: null,
    }));
    await scheduleRest(null);
    setFinished(session.id);
  }
  const complete = state.sessions.find((s) => s.id === finished);
  if (complete)
    return (
      <Page>
        <Title>Séance enregistrée</Title>
        <Card>
          <Heading>{complete.name}</Heading>
          <Txt>
            {
              complete.exercises
                .flatMap((e) => e.sets)
                .filter((t) => t.done && !t.warmup).length
            }{" "}
            séries de travail validées
          </Txt>
          <Txt>
            Appliquer l’ordre, les exercices, le nombre de séries, la charge et
            les réglages de repos de cette séance au modèle ?
          </Txt>
          <Row>
            <Button
              label="Appliquer au modèle"
              disabled={
                !state.templates.some((t) => t.id === complete.templateId)
              }
              onPress={async () => {
                await change((s) => ({
                  ...s,
                  templates: s.templates.map((t) =>
                    t.id === complete.templateId
                      ? applySessionToTemplate(t, complete)
                      : t,
                  ),
                }));
                setFinished(undefined);
                router.replace("/");
              }}
            />
            <Button
              label="Garder le modèle actuel"
              secondary
              onPress={() => {
                setFinished(undefined);
                router.replace("/");
              }}
            />
          </Row>
        </Card>
      </Page>
    );
  if (!session)
    return (
      <Page>
        <Title>Ma séance</Title>
        {drafts.length ? (
          <>
            <Txt>
              Plusieurs brouillons ont été conservés. Choisissez celui à
              poursuivre ; les autres restent disponibles.
            </Txt>
            {drafts.map((s) => (
              <Card key={s.id}>
                <Heading>{s.name}</Heading>
                <Txt muted>{date(s.startedAt)}</Txt>
                <Button
                  label={`Reprendre ${s.name}`}
                  onPress={() => setSelected(s.id)}
                />
              </Card>
            ))}
          </>
        ) : (
          <Card>
            <Txt>Aucune séance en cours.</Txt>
            <Button
              label="Choisir un modèle"
              onPress={() => router.push("/templates")}
            />
          </Card>
        )}
      </Page>
    );

  const exercise =
    session.exercises.find((e) => e.config.id === activeId) ??
    session.exercises.find((e) => e.sets.some((t) => !t.done && !t.warmup)) ??
    session.exercises.at(-1);
  const index = session.exercises.findIndex(
    (e) => e.config.id === exercise?.config.id,
  );
  const work = session.exercises
      .flatMap((e) => e.sets)
      .filter((t) => !t.warmup),
    done = work.filter((t) => t.done).length;
  const remaining = session.restEndsAt
    ? Math.max(
        0,
        Math.ceil((session.restEndsAt - Math.max(now, Date.now())) / 1000),
      )
    : 0;
  const elapsed = clock(
    ((session.finishedAt ? Date.parse(session.finishedAt) : now) -
      Date.parse(session.startedAt)) /
      1000,
  );
  const showRest = !session.finishedAt && session.restEndsAt !== null;
  const prior = lastSession(
    state,
    session.templateId,
    Date.parse(session.startedAt),
  );
  const previous =
    prior?.exercises.find((e) => e.config.id === exercise?.config.id) ??
    prior?.exercises.find(
      (e) => e.config.exercise.id === exercise?.config.exercise.id,
    );
  function focus(id: string) {
    setActiveId(id);
    setPicker(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <View style={s.screen}>
      <ScrollView
        ref={scroll}
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.sessionHeader}>
          <View style={s.headerText}>
            <View style={s.liveLabel}>
              <View
                style={[
                  s.liveDot,
                  session.finishedAt && { backgroundColor: colors.muted },
                ]}
              />
              <Text style={s.eyebrow}>
                {session.finishedAt ? "HISTORIQUE" : "EN SÉANCE"}
              </Text>
              <Text style={s.elapsed}>{elapsed}</Text>
            </View>
            <Text accessibilityRole="header" style={s.sessionName}>
              {session.name}
            </Text>
          </View>
          {session.finishedAt ? (
            <Button
              label="Retour à la progression"
              text="Retour"
              secondary
              onPress={() => router.push("/")}
            />
          ) : (
            <Button
              label="Terminer la séance"
              text="Terminer"
              secondary
              style={s.finish}
              onPress={finish}
            />
          )}
        </View>
        <View style={s.overview}>
          <View style={s.progressCaption}>
            <Text style={s.progressText}>
              {done}
              <Text style={s.progressTotal}> / {work.length} séries</Text>
            </Text>
            <Text style={s.progressPercent}>
              {work.length ? Math.round((done / work.length) * 100) : 0}%
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                { width: `${work.length ? (done / work.length) * 100 : 0}%` },
              ]}
            />
          </View>
          <View style={s.steps}>
            {session.exercises.map((e) => (
              <View
                key={e.config.id}
                style={[
                  s.step,
                  e.sets.some((t) => !t.warmup) &&
                    e.sets.filter((t) => !t.warmup).every((t) => t.done) &&
                    s.stepDone,
                  e.config.id === exercise?.config.id && s.stepActive,
                ]}
              />
            ))}
          </View>
        </View>
        {session.finishedAt && (
          <Text style={s.helper}>
            Corrigez les séries sans modifier les autres séances.
          </Text>
        )}
        {exercise ? (
          <WorkoutExercise
            key={exercise.config.id}
            exercise={exercise}
            position={index}
            total={session.exercises.length}
            compare={compare}
            onCompare={() => setCompare(!compare)}
            comparison={
              <>
                <Heading>Dernière séance du même modèle</Heading>
                <Txt muted>
                  {prior
                    ? date(prior.startedAt)
                    : "Aucune séance terminée pour ce modèle"}
                </Txt>
                <Results exercise={previous} />
                <Txt muted>Dernière réalisation, tous modèles :</Txt>
                <Results
                  exercise={lastExercise(
                    state,
                    exercise.config.exercise.id,
                    Date.parse(session.startedAt),
                  )}
                />
              </>
            }
            onChange={(id, patch) => setValue(exercise.config.id, id, patch)}
            onValidate={async (id) => {
              const t = exercise.sets.find((t) => t.id === id);
              if (!t) return;
              // Keep this exercise selected after validation, including its last series.
              setActiveId(exercise.config.id);
              const end =
                !t.done &&
                session.autoRest &&
                !session.finishedAt &&
                exercise.config.rest > 0
                  ? Date.now() + exercise.config.rest * 1000
                  : null;
              await update(
                (x) => ({
                  ...x,
                  restEndsAt: end,
                  exercises: x.exercises.map((e) =>
                    e.config.id === exercise.config.id
                      ? {
                          ...e,
                          sets: e.sets.map((v) =>
                            v.id === id ? { ...v, done: !v.done } : v,
                          ),
                        }
                      : e,
                  ),
                }),
                true,
              );
              if (!session.finishedAt) await scheduleRest(end);
            }}
            onRemoveSet={(id) =>
              update(
                (x) => ({
                  ...x,
                  exercises: x.exercises.map((e) =>
                    e.config.id === exercise.config.id
                      ? { ...e, sets: e.sets.filter((t) => t.id !== id) }
                      : e,
                  ),
                }),
                true,
              )
            }
            onAddSet={() =>
              update(
                (x) => ({
                  ...x,
                  exercises: x.exercises.map((e) =>
                    e.config.id === exercise.config.id
                      ? {
                          ...e,
                          sets: [
                            ...e.sets,
                            {
                              ...(e.sets.at(-1) ?? {
                                load: e.config.load,
                                reps: e.config.min,
                                targetLoad: e.config.load,
                                targetReps: e.config.min,
                              }),
                              id: newId(),
                              warmup: false,
                              done: false,
                            },
                          ],
                        }
                      : e,
                  ),
                }),
                true,
              )
            }
            onReplace={() => setPicker(exercise.config.id)}
            onRemove={async () => {
              const neighbor =
                session.exercises[index + 1] ?? session.exercises[index - 1];
              await update(
                (x) => ({
                  ...x,
                  exercises: x.exercises.filter(
                    (e) => e.config.id !== exercise.config.id,
                  ),
                }),
                true,
              );
              if (neighbor) focus(neighbor.config.id);
            }}
            onMoveUp={() =>
              update((x) => {
                const exercises = [...x.exercises];
                [exercises[index - 1], exercises[index]] = [
                  exercises[index]!,
                  exercises[index - 1]!,
                ];
                return { ...x, exercises };
              }, true)
            }
          />
        ) : (
          <Card>
            <Heading>Ajoutez votre premier exercice</Heading>
            <Txt>
              Vous pourrez ensuite naviguer entre les exercices avec les
              flèches.
            </Txt>
          </Card>
        )}
        {undo && (
          <Button
            label="Annuler la dernière action"
            text="↶ Annuler la dernière action"
            secondary
            style={s.undo}
            onPress={async () => {
              await change((x) => ({
                ...x,
                sessions: x.sessions.map((v) => (v.id === undo.id ? undo : v)),
              }));
              if (!undo.finishedAt) await scheduleRest(undo.restEndsAt);
              setUndo(undefined);
            }}
          />
        )}
        <View style={s.secondaryActions}>
          <Button
            label="Ajouter un exercice à la séance"
            text="＋ Exercice"
            secondary
            style={s.secondaryButton}
            onPress={() => setPicker("add")}
          />
          <Button
            label="Réglages de la séance"
            text="Réglages"
            secondary
            style={s.secondaryButton}
            onPress={() => setSettings(!settings)}
          />
        </View>
        {picker && (
          <>
            <ExercisePicker
              onSelect={async (selectedExercise) => {
                const config = newConfig(selectedExercise);
                const entry: SessionExercise = {
                  config,
                  mode: "last",
                  sets: propose(config, "last"),
                };
                await update(
                  (x) => ({
                    ...x,
                    exercises:
                      picker === "add"
                        ? [...x.exercises, entry]
                        : x.exercises.map((e) =>
                            e.config.id === picker ? entry : e,
                          ),
                  }),
                  true,
                );
                focus(config.id);
              }}
            />
            <Button
              label="Fermer le choix d’exercice"
              secondary
              onPress={() => setPicker(null)}
            />
          </>
        )}
        {settings && (
          <Card>
            <Heading>Réglages de la séance</Heading>
            {!session.finishedAt && (
              <>
                <Toggle
                  label="Repos automatique"
                  value={session.autoRest}
                  onChange={(value) => {
                    void update((x) => ({
                      ...x,
                      autoRest: value,
                      restEndsAt: value ? x.restEndsAt : null,
                    }))
                      .then(() => {
                        if (!value) return scheduleRest(null);
                      })
                      .catch((e) => setMessage(String(e)));
                  }}
                />
                <Button
                  label="Abandonner ce brouillon"
                  secondary
                  danger
                  onPress={() => setAbandoning(true)}
                />
                {abandoning && (
                  <>
                    <Txt>
                      Supprimer ce brouillon et ses séries ? Les séances
                      terminées et le modèle seront conservés.
                    </Txt>
                    <Row>
                      <Button
                        label="Confirmer l’abandon du brouillon"
                        secondary
                        danger
                        onPress={async () => {
                          await change((x) => ({
                            ...x,
                            sessions: x.sessions.filter(
                              (v) => v.id !== session.id,
                            ),
                          }));
                          await scheduleRest(null);
                          setAbandoning(false);
                          setSelected(undefined);
                          router.replace("/");
                        }}
                      />
                      <Button
                        label="Continuer la séance"
                        onPress={() => setAbandoning(false)}
                      />
                    </Row>
                  </>
                )}
              </>
            )}
          </Card>
        )}
      </ScrollView>
      {(exercise || showRest) && (
        <View style={s.dock}>
          <View style={s.dockInner}>
            <Button
              label="Exercice précédent"
              text="‹"
              secondary
              disabled={!exercise || index === 0}
              style={s.arrow}
              textStyle={s.arrowText}
              onPress={() => focus(session.exercises[index - 1]!.config.id)}
            />
            <View style={s.dockCaption}>
              {showRest ? (
                <>
                  <Text style={s.restEyebrow}>
                    {remaining > 0 ? "REPOS" : "C’EST REPARTI"}
                  </Text>
                  <View style={s.restControls}>
                    <Text
                      style={s.restTime}
                      accessibilityLabel={
                        remaining
                          ? `Repos restant ${remaining} secondes`
                          : "Repos terminé"
                      }
                    >
                      {remaining ? clock(remaining) : "✓"}
                    </Text>
                    <Button
                      label="Ajouter 30 secondes"
                      text="+30s"
                      secondary
                      style={s.restButton}
                      textStyle={{ fontSize: 12 }}
                      onPress={async () => {
                        const end =
                          Math.max(Date.now(), session.restEndsAt ?? 0) + 30000;
                        await update((x) => ({ ...x, restEndsAt: end }));
                        await scheduleRest(end);
                      }}
                    />
                    <Button
                      label="Arrêter le repos"
                      text="×"
                      secondary
                      style={s.restStop}
                      textStyle={{ fontSize: 22 }}
                      onPress={async () => {
                        await update((x) => ({ ...x, restEndsAt: null }));
                        await scheduleRest(null);
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.dockTitle}>À votre rythme</Text>
                  <Text style={s.dockHint}>
                    Alternez librement pour vos supersets
                  </Text>
                </>
              )}
            </View>
            <Button
              label="Exercice suivant"
              text="›"
              disabled={!exercise || index === session.exercises.length - 1}
              style={[s.arrow, s.nextArrow]}
              textStyle={s.arrowText}
              onPress={() => focus(session.exercises[index + 1]!.config.id)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 14,
  },
  sessionHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1 },
  liveLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.7,
  },
  elapsed: {
    color: "#7fe2eb",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    marginLeft: 6,
  },
  sessionName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  finish: {
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderColor: "#42566b",
  },
  overview: { gap: 8 },
  progressCaption: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  progressText: {
    fontSize: 19,
    color: colors.text,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  progressTotal: { fontSize: 12, fontWeight: "400", color: colors.muted },
  progressPercent: { fontSize: 12, color: colors.accent, fontWeight: "700" },
  progressTrack: {
    height: 5,
    backgroundColor: "#243444",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: { height: 5, backgroundColor: colors.accent, borderRadius: 4 },
  steps: { flexDirection: "row", gap: 4 },
  step: { height: 3, flex: 1, backgroundColor: "#253447", borderRadius: 2 },
  stepDone: { backgroundColor: "#77a95b" },
  stepActive: { backgroundColor: "#78dbe7" },
  helper: { color: colors.muted, fontSize: 12 },
  restEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#87c9d8",
  },
  restTime: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  restButton: {
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#203f4a",
    borderColor: "#386270",
    borderRadius: 12,
  },
  restStop: {
    minHeight: 44,
    width: 44,
    paddingVertical: 0,
    paddingHorizontal: 0,
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  undo: {
    alignSelf: "flex-start",
    minHeight: 36,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  secondaryActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  secondaryButton: {
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "transparent",
    borderColor: "#2d4052",
  },
  dock: {
    backgroundColor: "#101b29",
    borderTopWidth: 1,
    borderTopColor: "#2b4054",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dockInner: {
    width: "100%",
    maxWidth: 728,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  arrow: {
    width: 54,
    minHeight: 52,
    paddingVertical: 0,
    paddingHorizontal: 0,
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#203245",
    borderColor: "#364e62",
  },
  nextArrow: { backgroundColor: colors.accent },
  arrowText: { fontSize: 34, lineHeight: 38 },
  dockCaption: { flex: 1, alignItems: "center", gap: 4 },
  restControls: { flexDirection: "row", alignItems: "center", gap: 4 },
  dockTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  dockHint: { color: colors.muted, fontSize: 10, textAlign: "center" },
});
