import { z } from "zod";

export const modes = ["last", "gentle", "standard", "strong"] as const;
export const modeLabels = {
  last: "Derniers résultats",
  gentle: "Doux",
  standard: "Standard",
  strong: "Soutenu",
};
export const measures = ["load", "reps", "duration"] as const;
export const conventions = ["bar", "dumbbell", "machine"] as const;
export const conventionLabels = {
  bar: "kg, barre comprise",
  dumbbell: "kg/haltère",
  machine: "kg affichés",
};
const id = z.string().min(1).max(100);
const positive = z.number().finite().positive();
export const exerciseSchema = z
  .object({
    id,
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(2).max(2000),
    measure: z.enum(measures),
    convention: z.enum(conventions).optional(),
    muscle: z.string().max(100).default(""),
    equipment: z.string().max(100).default(""),
    aliases: z.string().max(300).default(""),
    archived: z.boolean().default(false),
    shared: z.boolean().optional(),
  })
  .refine(
    (e) => e.measure !== "load" || !!e.convention,
    "Précisez la convention de charge.",
  );
export type Exercise = z.infer<typeof exerciseSchema>;
export const configSchema = z
  .object({
    id,
    exercise: exerciseSchema,
    sets: z.number().int().min(1).max(30),
    load: z.number().finite().min(0).max(5000),
    min: z.number().int().min(1).max(500),
    max: z.number().int().min(1).max(500),
    increment: positive.max(100),
    rest: z.number().int().min(0).max(3600),
    mode: z.enum(modes).nullable(),
  })
  .refine(
    (c) => c.min <= c.max,
    "La borne basse doit précéder la borne haute.",
  );
export type Config = z.infer<typeof configSchema>;
export const templateSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  mode: z.enum(modes),
  autoRest: z.boolean(),
  exercises: z.array(configSchema).min(1).max(50),
});
export type Template = z.infer<typeof templateSchema>;
const setSchema = z.object({
  id,
  targetLoad: z.number().finite().min(0).max(5000),
  targetReps: positive.max(86400),
  load: z.number().finite().min(0).max(5000),
  reps: positive.max(86400),
  warmup: z.boolean(),
  done: z.boolean(),
});
export type WorkoutSet = z.infer<typeof setSchema>;
const sessionExerciseSchema = z.object({
  config: configSchema,
  mode: z.enum(modes),
  sets: z.array(setSchema).max(60),
});
export type SessionExercise = z.infer<typeof sessionExerciseSchema>;
export const sessionSchema = z.object({
  id,
  templateId: id,
  name: z.string().min(1).max(100),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  autoRest: z.boolean(),
  restEndsAt: z.number().finite().nullable(),
  exercises: z.array(sessionExerciseSchema).max(50),
});
export type Session = z.infer<typeof sessionSchema>;
export const stateSchema = z.object({
  version: z.literal(1),
  exercises: z.array(exerciseSchema).max(10000),
  templates: z.array(templateSchema).max(1000),
  sessions: z.array(sessionSchema).max(10000),
  favorites: z.array(id).max(1000),
});
export type State = z.infer<typeof stateSchema>;
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
export const emptyState = (): State => ({
  version: 1,
  exercises: [],
  templates: [],
  sessions: [],
  favorites: [],
});
export function newId() {
  return `${Date.now().toString(36)}-${Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join("")}`;
}
export function newConfig(exercise: Exercise): Config {
  return {
    id: newId(),
    exercise,
    sets: 4,
    load: 0,
    min: 6,
    max: 10,
    increment: 2.5,
    rest: 90,
    mode: null,
  };
}
export function lastSession(
  state: State,
  templateId: string,
  before = Infinity,
) {
  return state.sessions
    .filter(
      (s) =>
        s.templateId === templateId &&
        s.finishedAt &&
        Date.parse(s.startedAt) < before,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}
export function lastExercise(
  state: State,
  exerciseId: string,
  before = Infinity,
): SessionExercise | undefined {
  return state.sessions
    .filter((s) => s.finishedAt && Date.parse(s.startedAt) < before)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((s) => s.exercises)
    .find((e) => e.config.exercise.id === exerciseId);
}
// Goals belong to this occurrence in the template, not to an unrelated workout.
export function propose(
  config: Config,
  mode: Template["mode"],
  previous?: SessionExercise,
): WorkoutSet[] {
  const initial = Array.from({ length: config.sets }, () => ({
    load: config.load,
    reps: config.min,
  }));
  const work = previous?.sets.filter((s) => !s.warmup);
  let targets = initial;
  if (work && work.length !== config.sets)
    targets = initial.map((fallback, i) => {
      const old = work[i];
      return old
        ? {
            load: mode === "last" ? old.load : old.targetLoad,
            reps: mode === "last" ? old.reps : old.targetReps,
          }
        : fallback;
    });
  if (work?.length === config.sets) {
    const eligible =
      config.exercise.measure === "load" &&
      work.every((s) => s.load === work[0]?.load) &&
      work.every((s) => Number.isInteger(s.reps));
    if (mode === "last" || !eligible)
      targets = work.map((s) => ({ load: s.load, reps: s.reps }));
    else {
      const succeeded = work.every(
        (s) => s.done && s.reps >= s.targetReps && s.load >= s.targetLoad,
      );
      if (!succeeded)
        targets = work.map((s) => ({ load: s.targetLoad, reps: s.targetReps }));
      else if (work.every((s) => s.reps >= config.max))
        targets = work.map((s) => ({
          load: s.load + config.increment,
          reps: config.min,
        }));
      else {
        const selected = new Set(
          work
            .map((s, i) => ({ i, reps: s.reps }))
            .filter((s) => s.reps < config.max)
            .sort((a, b) => a.reps - b.reps || a.i - b.i)
            .slice(
              0,
              mode === "gentle" ? Math.ceil(work.length / 2) : work.length,
            )
            .map((s) => s.i),
        );
        targets = work.map((s, i) => ({
          load: s.load,
          reps: selected.has(i)
            ? Math.min(config.max, s.reps + (mode === "strong" ? 2 : 1))
            : Math.min(config.max, s.reps),
        }));
      }
    }
  }
  return targets.map((t) => ({
    id: newId(),
    targetLoad: t.load,
    targetReps: t.reps,
    load: t.load,
    reps: t.reps,
    warmup: false,
    done: false,
  }));
}
export function startSession(state: State, template: Template): Session {
  const previous = lastSession(state, template.id);
  return {
    id: newId(),
    templateId: template.id,
    name: template.name,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    autoRest: template.autoRest,
    restEndsAt: null,
    exercises: template.exercises.map((config) => {
      const mode = config.mode ?? template.mode;
      return {
        config: clone(config),
        mode,
        sets: propose(
          config,
          mode,
          previous?.exercises.find((e) => e.config.id === config.id),
        ),
      };
    }),
  };
}
export function applySessionToTemplate(
  template: Template,
  session: Session,
): Template {
  return templateSchema.parse({
    ...template,
    autoRest: session.autoRest,
    exercises: session.exercises.map((e) => ({
      ...e.config,
      sets: Math.max(1, e.sets.filter((s) => !s.warmup).length),
      load: e.sets.find((s) => !s.warmup)?.load ?? e.config.load,
    })),
  });
}
export function estimated1RM(load: number, reps: number) {
  return reps === 1
    ? load
    : reps >= 2 && reps <= 10
      ? load * (1 + reps / 30)
      : null;
}
export function series(
  state: State,
  exercise: Exercise,
  reps?: number,
  rm = false,
) {
  return state.sessions
    .filter((s) => s.finishedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((s) => {
      const sets = s.exercises
        .filter(
          (e) =>
            e.config.exercise.id === exercise.id &&
            e.config.exercise.convention === exercise.convention &&
            e.config.exercise.measure === "load",
        )
        .flatMap((e) => e.sets)
        .filter(
          (t) => t.done && !t.warmup && (reps === undefined || t.reps === reps),
        );
      const best = sets
        .map((t) => ({
          value: rm ? estimated1RM(t.load, t.reps) : t.load,
          reps: t.reps,
        }))
        .filter((t): t is { value: number; reps: number } => t.value !== null)
        .sort((a, b) => b.value - a.value)[0];
      return best ? [{ date: s.startedAt, sessionId: s.id, ...best }] : [];
    });
}
export function mergeStates(local: State, remote: State): State {
  // Conflict resolution only adds missing records; overlapping changes require an explicit choice.
  const union = <T extends { id: string }>(a: T[], b: T[]) => [
    ...a,
    ...b.filter((x) => !a.some((y) => x.id === y.id)),
  ];
  return {
    ...local,
    exercises: union(local.exercises, remote.exercises),
    templates: union(local.templates, remote.templates),
    sessions: union(local.sessions, remote.sessions),
    favorites: [...new Set([...local.favorites, ...remote.favorites])],
  };
}
export function csv(state: State) {
  const quote = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: unknown[][] = [
    [
      "seance_id",
      "date",
      "seance",
      "exercice",
      "mesure",
      "convention",
      "serie",
      "echauffement",
      "validee",
      "charge_kg",
      "repetitions_ou_secondes",
    ],
  ];
  for (const s of state.sessions)
    for (const e of s.exercises)
      e.sets.forEach((t, i) =>
        rows.push([
          s.id,
          s.startedAt,
          s.name,
          e.config.exercise.name,
          e.config.exercise.measure,
          e.config.exercise.convention ?? "",
          i + 1,
          t.warmup,
          t.done,
          t.load,
          t.reps,
        ]),
      );
  return rows
    .map((row) =>
      row
        .map((v) =>
          quote(
            typeof v === "string" && /^(?:\s*[=+\-@]|[\t\r\n])/.test(v)
              ? `'${v}`
              : v,
          ),
        )
        .join(","),
    )
    .join("\r\n");
}
