import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useStore } from "../src/store";
import {
  Exercise,
  conventions,
  conventionLabels,
  exerciseSchema,
  newId,
} from "../src/domain";
import {
  Button,
  Card,
  Choice,
  Field,
  Heading,
  Page,
  Row,
  Title,
  Toggle,
  Txt,
} from "../src/ui";
export default function Exercises() {
  const { state, change } = useStore();
  const router = useRouter();
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<Exercise | null>(null);
  const existing = state.exercises.find((e) => e.id === editing?.id);
  if (editing)
    return (
      <Page>
        <Title>Exercice personnel</Title>
        <Card>
          <Field
            label="Nom de l’exercice"
            value={editing.name}
            onChange={(name) => setEditing({ ...editing, name })}
          />
          <Field
            label="Description"
            value={editing.description}
            multiline
            onChange={(description) => setEditing({ ...editing, description })}
          />
          {!existing && (
            <Choice
              label="Mode de mesure"
              value={editing.measure}
              options={[
                { value: "load", label: "Charge + répétitions" },
                { value: "reps", label: "Répétitions seules" },
                { value: "duration", label: "Durée" },
              ]}
              onChange={(measure) =>
                setEditing({
                  ...editing,
                  measure,
                  convention: measure === "load" ? "bar" : undefined,
                })
              }
            />
          )}
          {existing && (
            <Txt muted>
              Mesure conservée. Créez une variante pour changer de convention.
            </Txt>
          )}
          {!existing && editing.measure === "load" && (
            <Choice
              label="Convention de charge"
              value={editing.convention ?? "bar"}
              options={conventions.map((value) => ({
                value,
                label: conventionLabels[value],
              }))}
              onChange={(convention) => setEditing({ ...editing, convention })}
            />
          )}
          <Field
            label="Muscle (facultatif)"
            value={editing.muscle}
            onChange={(muscle) => setEditing({ ...editing, muscle })}
          />
          <Field
            label="Matériel (facultatif)"
            value={editing.equipment}
            onChange={(equipment) => setEditing({ ...editing, equipment })}
          />
          <Field
            label="Noms alternatifs (facultatif)"
            value={editing.aliases}
            onChange={(aliases) => setEditing({ ...editing, aliases })}
          />
          <Txt muted>
            Privé par défaut. Le partage est une action distincte dans la
            communauté. Pour changer le mode de mesure d’un exercice existant,
            créez une variante.
          </Txt>
          <Row>
            <Button
              label={
                existing
                  ? "Enregistrer cet exercice privé"
                  : "Créer cet exercice privé"
              }
              onPress={async () => {
                const parsed = exerciseSchema.safeParse(editing);
                if (!parsed.success)
                  throw new Error(
                    parsed.error.issues.map((e) => e.message).join(" · "),
                  );
                await change((s) => ({
                  ...s,
                  exercises: [
                    ...s.exercises.filter((e) => e.id !== parsed.data.id),
                    parsed.data,
                  ],
                  templates: s.templates.map((t) => ({
                    ...t,
                    exercises: t.exercises.map((c) =>
                      c.exercise.id === parsed.data.id
                        ? { ...c, exercise: parsed.data }
                        : c,
                    ),
                  })),
                }));
                setEditing(null);
              }}
            />
            <Button
              label="Annuler la création"
              secondary
              onPress={() => setEditing(null)}
            />
          </Row>
        </Card>
      </Page>
    );
  return (
    <Page>
      <Title>Catalogue d’exercices</Title>
      <Row>
        <Button
          label="Créer un exercice"
          onPress={() =>
            setEditing({
              id: newId(),
              name: "",
              description: "",
              measure: "load",
              convention: "bar",
              muscle: "",
              equipment: "",
              aliases: "",
              archived: false,
            })
          }
        />
        <Button
          label="Votes communautaires"
          secondary
          onPress={() => router.push("/community")}
        />
      </Row>
      <Field
        label="Rechercher nom, muscle ou matériel"
        value={search}
        onChange={setSearch}
      />
      {state.exercises
        .filter(
          (e) =>
            !e.archived &&
            `${e.name} ${e.description} ${e.muscle} ${e.equipment} ${e.aliases}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .map((e) => (
          <Card key={e.id}>
            <Heading>{e.name}</Heading>
            <Txt>{e.description}</Txt>
            <Txt muted>
              {[
                e.muscle,
                e.equipment,
                e.convention
                  ? conventionLabels[e.convention]
                  : e.measure === "duration"
                    ? "Secondes"
                    : "Répétitions seules",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Txt>
            <Row>
              {!e.shared && (
                <Button
                  label={`Modifier ${e.name}`}
                  secondary
                  onPress={() => setEditing({ ...e })}
                />
              )}
              <Toggle
                label={`Favori ${e.name}`}
                value={state.favorites.includes(e.id)}
                onChange={(v) =>
                  void change((s) => ({
                    ...s,
                    favorites: v
                      ? [...s.favorites, e.id]
                      : s.favorites.filter((x) => x !== e.id),
                  })).catch(() => {})
                }
              />
              <Button
                label={`Archiver ${e.name}`}
                secondary
                onPress={() =>
                  change((s) => ({
                    ...s,
                    exercises: s.exercises.map((x) =>
                      x.id === e.id ? { ...x, archived: true } : x,
                    ),
                  }))
                }
              />
            </Row>
          </Card>
        ))}
      {state.exercises.some((e) => e.archived) && (
        <Card>
          <Heading>Archivés sur cet appareil</Heading>
          {state.exercises
            .filter((e) => e.archived)
            .map((e) => (
              <Button
                key={e.id}
                secondary
                label={`Restaurer ${e.name}`}
                onPress={() =>
                  change((s) => ({
                    ...s,
                    exercises: s.exercises.map((x) =>
                      x.id === e.id ? { ...x, archived: false } : x,
                    ),
                  }))
                }
              />
            ))}
        </Card>
      )}
    </Page>
  );
}
