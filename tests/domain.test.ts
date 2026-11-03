import { describe, test, expect } from "@jest/globals";
import { catalog } from "../src/catalog";
import {
  State,
  SessionExercise,
  applySessionToTemplate,
  csv,
  emptyState,
  estimated1RM,
  exerciseSchema,
  mergeStates,
  newConfig,
  propose,
  series,
  startSession,
  templateSchema,
} from "../src/domain";
const config = { ...newConfig(catalog[0]!), load: 45 };
function previous(reps: number[], done = true): SessionExercise {
  return {
    config,
    mode: "standard",
    sets: reps.map((n, i) => ({
      id: String(i),
      load: 45,
      reps: n,
      targetLoad: 45,
      targetReps: n,
      done,
      warmup: false,
    })),
  };
}
describe("progression", () => {
  test("première séance au bas de fenêtre", () =>
    expect(propose(config, "standard").map((s) => [s.load, s.reps])).toEqual([
      [45, 6],
      [45, 6],
      [45, 6],
      [45, 6],
    ]));
  test.each([
    ["gentle", [8, 8, 8, 7]],
    ["standard", [9, 9, 8, 7]],
    ["strong", [10, 10, 9, 8]],
  ] as const)("%s", (mode, result) =>
    expect(
      propose(config, mode, previous([8, 8, 7, 6])).map((s) => s.reps),
    ).toEqual(result),
  );
  test("doux arrondi supérieur et égalités selon ordre", () =>
    expect(
      propose({ ...config, sets: 3 }, "gentle", previous([8, 8, 8])).map(
        (s) => s.reps,
      ),
    ).toEqual([9, 9, 8]));
  test("plafonds et séries déjà au maximum", () =>
    expect(
      propose(config, "gentle", previous([10, 10, 9, 8])).map((s) => s.reps),
    ).toEqual([10, 10, 10, 9]));
  test("charge augmente lorsque toutes les séries atteignent le plafond", () =>
    expect(
      propose(config, "standard", previous([10, 10, 10, 10])).map((s) => [
        s.load,
        s.reps,
      ]),
    ).toEqual([
      [47.5, 6],
      [47.5, 6],
      [47.5, 6],
      [47.5, 6],
    ]));
  test("échec reconduit les objectifs", () => {
    const p = previous([9, 9, 8, 7]);
    p.sets[1]!.reps = 8;
    expect(propose(config, "strong", p).map((s) => s.reps)).toEqual([
      9, 9, 8, 7,
    ]);
  });
  test("série sautée empêche une augmentation", () => {
    const p = previous([10, 10, 10, 10]);
    p.sets[3]!.done = false;
    expect(propose(config, "standard", p).map((s) => s.load)).toEqual([
      45, 45, 45, 45,
    ]);
  });
  test("échauffements exclus", () => {
    const p = previous([10, 10, 10, 10]);
    p.sets.unshift({
      ...p.sets[0]!,
      id: "warmup",
      warmup: true,
      load: 20,
      reps: 5,
    });
    expect(propose(config, "standard", p)[0]!.load).toBe(47.5);
  });
  test("charges mixtes et mesures non pondérées sans auto", () => {
    const p = previous([8, 8, 7, 6]);
    p.sets[1]!.load = 40;
    expect(propose(config, "strong", p).map((s) => s.reps)).toEqual([
      8, 8, 7, 6,
    ]);
    expect(
      propose(
        {
          ...config,
          exercise: {
            ...config.exercise,
            measure: "reps",
            convention: undefined,
          },
        },
        "strong",
        previous([8, 8, 7, 6]),
      ).map((s) => s.reps),
    ).toEqual([8, 8, 7, 6]);
  });
  test("derniers résultats conserve même les répétitions manquées", () => {
    const p = previous([8, 8, 7, 6]);
    p.sets[0]!.targetReps = 9;
    expect(propose(config, "last", p)[0]!.reps).toBe(8);
  });
});
describe("historique et mesures", () => {
  const template = templateSchema.parse({
    id: "push",
    name: "Push",
    mode: "standard",
    autoRest: true,
    exercises: [config],
  });
  test("modèle et séance indépendants, objectifs par occurrence", () => {
    const state = { ...emptyState(), templates: [template] };
    const session = startSession(state, template);
    session.exercises[0]!.config.exercise.name = "Autre";
    expect(template.exercises[0]!.exercise.name).toBe(catalog[0]!.name);
    const completed = { ...session, finishedAt: new Date().toISOString() };
    const updated = applySessionToTemplate(template, completed);
    expect(updated.exercises[0]!.exercise.name).toBe("Autre");
    expect(template.exercises[0]!.exercise.name).toBe(catalog[0]!.name);
  });
  test("graphiques excluent brouillons, échauffements, conventions différentes", () => {
    const session = startSession(emptyState(), template);
    session.finishedAt = new Date().toISOString();
    session.exercises[0]!.sets = previous([10, 8, 6, 5]).sets;
    session.exercises[0]!.sets[0]!.warmup = true;
    session.exercises[0]!.sets[0]!.load = 100;
    const state: State = { ...emptyState(), sessions: [session] };
    expect(series(state, catalog[0]!)[0]).toMatchObject({ value: 45, reps: 8 });
    expect(series(state, catalog[0]!, 6)[0]!.value).toBe(45);
    expect(series(state, { ...catalog[0]!, convention: "machine" })).toEqual(
      [],
    );
    session.finishedAt = null;
    expect(series(state, catalog[0]!)).toEqual([]);
  });
  test("Epley séparé, bornes 1 à 10", () => {
    expect(estimated1RM(45, 1)).toBe(45);
    expect(estimated1RM(45, 10)).toBe(60);
    expect(estimated1RM(45, 11)).toBeNull();
  });
  test("validation de charge et fenêtre", () => {
    expect(
      exerciseSchema.safeParse({ ...catalog[0], convention: undefined })
        .success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({
        ...template,
        exercises: [{ ...config, min: 11, max: 10 }],
      }).success,
    ).toBe(false);
  });
  test("conflit préserve les brouillons différents et choisit explicitement les chevauchements", () => {
    const a = startSession(emptyState(), template),
      b = { ...a, id: "second" };
    const local = { ...emptyState(), sessions: [a] },
      remote = { ...emptyState(), sessions: [{ ...a, name: "Serveur" }, b] };
    expect(mergeStates(local, remote).sessions).toEqual([a, b]);
    expect(mergeStates(remote, local).sessions[0]!.name).toBe("Serveur");
  });
  test("CSV échappe guillemets, retours et formules", () => {
    const session = startSession(emptyState(), {
      ...template,
      name: '=SUM(1,2)"\n',
    });
    const output = csv({ ...emptyState(), sessions: [session] });
    expect(output).toContain('"\'=SUM(1,2)""\n"');
  });
});
