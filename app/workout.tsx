import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStore } from "../src/store";
import {
  Session,
  SessionExercise,
  WorkoutSet,
  applySessionToTemplate,
  clone,
  conventionLabels,
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
  NumberField,
  Page,
  Row,
  Title,
  Toggle,
  Txt,
  date,
} from "../src/ui";
import { ExercisePicker } from "../src/exercise-picker";
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
export default function Workout() {
  const { state, change, setMessage } = useStore(),
    router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [selected, setSelected] = useState<string>(),
    [compare, setCompare] = useState(false),
    [picker, setPicker] = useState<string | "add" | null>(null),
    [undo, setUndo] = useState<Session>(),
    [finished, setFinished] = useState<string>(),
    [abandoning, setAbandoning] = useState(false),
    [now, setNow] = useState(Date.now());
  const drafts = state.sessions.filter((s) => !s.finishedAt);
  const session = state.sessions.find(
    (s) =>
      s.id ===
      (params.id ??
        selected ??
        (drafts.length === 1 ? drafts[0]?.id : undefined)),
  );
  useEffect(() => {
    setUndo(undefined);
    setCompare(false);
    setPicker(null);
  }, [session?.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = session?.restEndsAt
    ? Math.max(0, Math.ceil((session.restEndsAt - now) / 1000))
    : 0;
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
        e.config.id !== exerciseId
          ? e
          : {
              ...e,
              sets: e.sets.map((t) =>
                t.id !== setId ? t : { ...t, ...patch },
              ),
            },
      ),
    }));
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
  const prior = lastSession(
    state,
    session.templateId,
    Date.parse(session.startedAt),
  );
  return (
    <Page>
      <Title>{session.name}</Title>
      <Txt muted>
        {session.finishedAt
          ? "Correction de l’historique — chaque modification est sauvegardée"
          : `En cours depuis ${date(session.startedAt)}`}
      </Txt>
      <Row>
        <Button
          label={
            compare
              ? "Masquer la comparaison"
              : "Comparer à la séance précédente"
          }
          secondary
          onPress={() => setCompare(!compare)}
        />
        {session.finishedAt && (
          <Button
            label="Retour à la progression"
            secondary
            onPress={() => router.push("/")}
          />
        )}
      </Row>
      {compare && (
        <Card>
          <Heading>Dernière séance du même modèle</Heading>
          <Txt muted>
            {prior
              ? date(prior.startedAt)
              : "Aucune séance terminée pour ce modèle"}
          </Txt>
          {prior?.exercises.map((e) => (
            <React.Fragment key={e.config.id}>
              <Txt>{e.config.exercise.name}</Txt>
              <Results exercise={e} />
            </React.Fragment>
          ))}
        </Card>
      )}
      {!session.finishedAt && (
        <Card>
          <Toggle
            label="Repos automatique"
            value={session.autoRest}
            onChange={(value) => {
              void update((s) => ({
                ...s,
                autoRest: value,
                restEndsAt: value ? s.restEndsAt : null,
              }))
                .then(() => {
                  if (!value) return scheduleRest(null);
                })
                .catch((e) => setMessage(String(e)));
            }}
          />
          {session.restEndsAt !== null && (
            <>
              <Heading>
                {remaining > 0
                  ? `Repos · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                  : "Repos terminé"}
              </Heading>
              <Row>
                <Button
                  label="Ajouter 30 secondes"
                  secondary
                  onPress={async () => {
                    const end =
                      Math.max(Date.now(), session.restEndsAt ?? 0) + 30000;
                    await update((s) => ({ ...s, restEndsAt: end }));
                    if (!session.finishedAt) await scheduleRest(end);
                  }}
                />
                <Button
                  label="Arrêter le repos"
                  secondary
                  onPress={async () => {
                    await update((s) => ({ ...s, restEndsAt: null }));
                    await scheduleRest(null);
                  }}
                />
              </Row>
            </>
          )}
        </Card>
      )}
      {undo && (
        <Button
          label="Annuler la dernière action"
          secondary
          onPress={async () => {
            await change((s) => ({
              ...s,
              sessions: s.sessions.map((x) => (x.id === undo.id ? undo : x)),
            }));
            if (!undo.finishedAt) await scheduleRest(undo.restEndsAt);
            setUndo(undefined);
          }}
        />
      )}
      {session.exercises.map((e, exerciseIndex) => (
        <Card key={e.config.id}>
          <Heading>{e.config.exercise.name}</Heading>
          {exerciseIndex > 0 && (
            <Button
              label={`Monter ${e.config.exercise.name}`}
              secondary
              onPress={() =>
                update((s) => {
                  const exercises = [...s.exercises];
                  [exercises[exerciseIndex - 1], exercises[exerciseIndex]] = [
                    exercises[exerciseIndex]!,
                    exercises[exerciseIndex - 1]!,
                  ];
                  return { ...s, exercises };
                }, true)
              }
            />
          )}
          <Txt muted>
            {e.config.exercise.convention
              ? conventionLabels[e.config.exercise.convention]
              : e.config.exercise.measure === "duration"
                ? "Secondes"
                : "Répétitions seules"}{" "}
            · objectif {e.config.min}–{e.config.max}
          </Txt>
          {compare && (
            <>
              <Txt muted>Dernière réalisation, tous modèles :</Txt>
              <Results
                exercise={lastExercise(
                  state,
                  e.config.exercise.id,
                  Date.parse(session.startedAt),
                )}
              />
            </>
          )}
          {e.sets.map((t, i) => (
            <Card key={t.id}>
              <Row>
                <Txt>
                  {t.warmup ? "Échauffement" : `Série ${i + 1}`}{" "}
                  {t.done ? "✓" : ""}
                </Txt>
                <Txt muted>
                  Prévu :{" "}
                  {e.config.exercise.measure === "load"
                    ? `${t.targetLoad} kg × `
                    : ""}
                  {t.targetReps}
                  {e.config.exercise.measure === "duration" ? " s" : ""}
                </Txt>
              </Row>
              <Row>
                {e.config.exercise.measure === "load" && (
                  <NumberField
                    label={`Charge série ${i + 1} ${e.config.exercise.name}`}
                    value={t.load}
                    onChange={(load) =>
                      void setValue(e.config.id, t.id, { load }).catch(() => {})
                    }
                  />
                )}
                <NumberField
                  label={`${e.config.exercise.measure === "duration" ? "Secondes" : "Répétitions"} série ${i + 1} ${e.config.exercise.name}`}
                  value={t.reps}
                  onChange={(reps) => {
                    if (reps > 0)
                      void setValue(e.config.id, t.id, { reps }).catch(
                        () => {},
                      );
                  }}
                />
                <Button
                  secondary={t.done}
                  label={`${t.done ? "Annuler" : "Valider"} série ${i + 1} ${e.config.exercise.name}`}
                  onPress={async () => {
                    const end =
                      !t.done &&
                      session.autoRest &&
                      !session.finishedAt &&
                      e.config.rest > 0
                        ? Date.now() + e.config.rest * 1000
                        : null;
                    await update(
                      (s) => ({
                        ...s,
                        restEndsAt: end,
                        exercises: s.exercises.map((x) =>
                          x.config.id === e.config.id
                            ? {
                                ...x,
                                sets: x.sets.map((v) =>
                                  v.id === t.id ? { ...v, done: !v.done } : v,
                                ),
                              }
                            : x,
                        ),
                      }),
                      true,
                    );
                    if (!session.finishedAt) await scheduleRest(end);
                  }}
                />
              </Row>
              <Row>
                <Toggle
                  label={`Échauffement série ${i + 1} ${e.config.exercise.name}`}
                  value={t.warmup}
                  onChange={(warmup) =>
                    void setValue(e.config.id, t.id, { warmup }).catch(() => {})
                  }
                />
                <Button
                  label={`Retirer série ${i + 1} ${e.config.exercise.name}`}
                  secondary
                  onPress={() =>
                    update(
                      (s) => ({
                        ...s,
                        exercises: s.exercises.map((x) =>
                          x.config.id === e.config.id
                            ? {
                                ...x,
                                sets: x.sets.filter((v) => v.id !== t.id),
                              }
                            : x,
                        ),
                      }),
                      true,
                    )
                  }
                />
              </Row>
            </Card>
          ))}
          <Row>
            <Button
              label={`Ajouter une série ${e.config.exercise.name}`}
              secondary
              onPress={() =>
                update(
                  (s) => ({
                    ...s,
                    exercises: s.exercises.map((x) =>
                      x.config.id === e.config.id
                        ? {
                            ...x,
                            sets: [
                              ...x.sets,
                              {
                                ...(x.sets.at(-1) ?? {
                                  load: x.config.load,
                                  reps: x.config.min,
                                  targetLoad: x.config.load,
                                  targetReps: x.config.min,
                                }),
                                id: newId(),
                                warmup: false,
                                done: false,
                              },
                            ],
                          }
                        : x,
                    ),
                  }),
                  true,
                )
              }
            />
            <Button
              label={`Remplacer ${e.config.exercise.name}`}
              secondary
              onPress={() => setPicker(e.config.id)}
            />
            <Button
              label={`Retirer ${e.config.exercise.name}`}
              secondary
              onPress={() =>
                update(
                  (s) => ({
                    ...s,
                    exercises: s.exercises.filter(
                      (x) => x.config.id !== e.config.id,
                    ),
                  }),
                  true,
                )
              }
            />
          </Row>
        </Card>
      ))}
      <Button
        label="Ajouter un exercice à la séance"
        secondary
        onPress={() => setPicker("add")}
      />
      {picker && (
        <>
          <ExercisePicker
            onSelect={async (exercise) => {
              const config = newConfig(exercise);
              const entry: SessionExercise = {
                config,
                mode: "last",
                sets: propose(config, "last"),
              };
              await update(
                (s) => ({
                  ...s,
                  exercises:
                    picker === "add"
                      ? [...s.exercises, entry]
                      : s.exercises.map((e) =>
                          e.config.id === picker ? entry : e,
                        ),
                }),
                true,
              );
              setPicker(null);
            }}
          />
          <Button
            label="Fermer le choix d’exercice"
            secondary
            onPress={() => setPicker(null)}
          />
        </>
      )}
      {!session.finishedAt && (
        <Button
          label="Terminer la séance"
          onPress={async () => {
            if (
              !session.exercises.some((e) =>
                e.sets.some((t) => t.done && !t.warmup),
              )
            )
              throw new Error("Validez au moins une série de travail.");
            await update((s) => ({
              ...s,
              finishedAt: new Date().toISOString(),
              restEndsAt: null,
            }));
            await scheduleRest(null);
            setFinished(session.id);
          }}
        />
      )}
      {!session.finishedAt && (
        <Card>
          <Button
            label="Abandonner ce brouillon"
            secondary
            danger
            onPress={() => setAbandoning(true)}
          />
          {abandoning && (
            <>
              <Txt>
                Supprimer ce brouillon et ses séries ? Les séances terminées et
                le modèle seront conservés.
              </Txt>
              <Row>
                <Button
                  label="Confirmer l’abandon du brouillon"
                  secondary
                  danger
                  onPress={async () => {
                    await change((s) => ({
                      ...s,
                      sessions: s.sessions.filter((x) => x.id !== session.id),
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
        </Card>
      )}
    </Page>
  );
}
