import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useStore } from "../src/store";
import {
  Config,
  Template,
  clone,
  modeLabels,
  modes,
  newConfig,
  newId,
  startSession,
  templateSchema,
  conventionLabels,
} from "../src/domain";
import {
  Button,
  Card,
  Choice,
  Field,
  Heading,
  NumberField,
  Page,
  Row,
  Title,
  Toggle,
  Txt,
} from "../src/ui";
import { ExercisePicker } from "../src/exercise-picker";
export function ConfigFields({
  config,
  onChange,
  inherit = true,
}: {
  config: Config;
  onChange: (c: Config) => void;
  inherit?: boolean;
}) {
  return (
    <>
      <Heading>{config.exercise.name}</Heading>
      <Txt muted>
        {config.exercise.convention
          ? conventionLabels[config.exercise.convention]
          : config.exercise.measure === "duration"
            ? "Secondes"
            : "Répétitions seules"}
      </Txt>
      <Row>
        <NumberField
          label="Séries de travail"
          value={config.sets}
          onChange={(sets) => onChange({ ...config, sets })}
        />
        {config.exercise.measure === "load" && (
          <NumberField
            label="Charge initiale (kg)"
            value={config.load}
            onChange={(load) => onChange({ ...config, load })}
          />
        )}
        <NumberField
          label={
            config.exercise.measure === "duration"
              ? "Durée initiale (s)"
              : "Répétitions min"
          }
          value={config.min}
          onChange={(min) => onChange({ ...config, min })}
        />
        <NumberField
          label={
            config.exercise.measure === "duration"
              ? "Durée max (s)"
              : "Répétitions max"
          }
          value={config.max}
          onChange={(max) => onChange({ ...config, max })}
        />
        {config.exercise.measure === "load" && (
          <NumberField
            label="Incrément (kg)"
            value={config.increment}
            onChange={(increment) => onChange({ ...config, increment })}
          />
        )}
        <NumberField
          label="Repos (secondes)"
          value={config.rest}
          onChange={(rest) => onChange({ ...config, rest })}
        />
      </Row>
      {config.exercise.measure === "load" && (
        <Choice
          label="Progression de cet exercice"
          value={config.mode ?? "inherit"}
          options={[
            ...(inherit
              ? [{ value: "inherit" as const, label: "Hériter du modèle" }]
              : []),
            ...modes.map((value) => ({ value, label: modeLabels[value] })),
          ]}
          onChange={(mode) =>
            onChange({ ...config, mode: mode === "inherit" ? null : mode })
          }
        />
      )}
    </>
  );
}
export default function Templates() {
  const { state, change } = useStore();
  const router = useRouter();
  const [editing, setEditing] = useState<Template | null>(null),
    [picker, setPicker] = useState(false),
    [deleting, setDeleting] = useState<string>();
  if (editing)
    return (
      <Page>
        <Title>Modèle de séance</Title>
        <Card>
          <Field
            label="Nom de la séance"
            value={editing.name}
            onChange={(name) => setEditing({ ...editing, name })}
          />
          <Choice
            label="Progression par défaut"
            options={modes.map((value) => ({
              value,
              label: modeLabels[value],
            }))}
            value={editing.mode}
            onChange={(mode) => setEditing({ ...editing, mode })}
          />
          <Toggle
            label="Repos automatique"
            value={editing.autoRest}
            onChange={(autoRest) => setEditing({ ...editing, autoRest })}
          />
        </Card>
        {editing.exercises.map((c, i) => (
          <Card key={c.id}>
            <ConfigFields
              config={c}
              onChange={(config) =>
                setEditing({
                  ...editing,
                  exercises: editing.exercises.map((x) =>
                    x.id === c.id ? config : x,
                  ),
                })
              }
            />
            <Row>
              <Button
                label={`Retirer ${c.exercise.name}`}
                secondary
                onPress={() =>
                  setEditing({
                    ...editing,
                    exercises: editing.exercises.filter((x) => x.id !== c.id),
                  })
                }
              />
              {i > 0 && (
                <Button
                  label="Monter cet exercice"
                  secondary
                  onPress={() => {
                    const exercises = [...editing.exercises];
                    [exercises[i - 1], exercises[i]] = [
                      exercises[i]!,
                      exercises[i - 1]!,
                    ];
                    setEditing({ ...editing, exercises });
                  }}
                />
              )}
            </Row>
          </Card>
        ))}
        <Button
          label="Ajouter un exercice"
          secondary
          onPress={() => setPicker(!picker)}
        />
        {picker && (
          <ExercisePicker
            onSelect={(e) => {
              setEditing({
                ...editing,
                exercises: [...editing.exercises, newConfig(e)],
              });
              setPicker(false);
            }}
          />
        )}
        <Row>
          <Button
            label="Enregistrer le modèle"
            onPress={async () => {
              const parsed = templateSchema.safeParse(editing);
              if (!parsed.success)
                throw new Error(
                  parsed.error.issues.map((e) => e.message).join(" · "),
                );
              await change((s) => ({
                ...s,
                templates: [
                  ...s.templates.filter((t) => t.id !== editing.id),
                  parsed.data,
                ],
              }));
              setEditing(null);
            }}
          />
          <Button
            label="Annuler les modifications"
            secondary
            onPress={() => setEditing(null)}
          />
        </Row>
      </Page>
    );
  return (
    <Page>
      <Title>Mes modèles</Title>
      <Txt muted>
        Choisissez librement votre séance, sans calendrier imposé.
      </Txt>
      <Button
        label="Créer un modèle"
        onPress={() =>
          setEditing({
            id: newId(),
            name: "",
            mode: "last",
            autoRest: true,
            exercises: [],
          })
        }
      />
      {!state.templates.length && (
        <Card>
          <Heading>Votre première séance</Heading>
          <Txt>
            Ajoutez vos exercices et leurs objectifs. Vous pourrez les ajuster
            pendant l’entraînement.
          </Txt>
        </Card>
      )}
      {state.templates.map((t) => (
        <Card key={t.id}>
          <Heading>{t.name}</Heading>
          <Txt muted>
            {t.exercises.length} exercices · {modeLabels[t.mode]}
          </Txt>
          <Row>
            <Button
              label={`Démarrer ${t.name}`}
              onPress={async () => {
                if (state.sessions.some((s) => !s.finishedAt)) {
                  router.push("/workout");
                  return;
                }
                await change((s) => ({
                  ...s,
                  sessions: [...s.sessions, startSession(s, t)],
                }));
                router.push("/workout");
              }}
            />
            <Button
              label={`Modifier ${t.name}`}
              secondary
              onPress={() => setEditing(clone(t))}
            />
            <Button
              label={`Supprimer ${t.name}`}
              secondary
              danger
              onPress={() => setDeleting(t.id)}
            />
          </Row>
          {deleting === t.id && (
            <>
              <Txt>
                Supprimer ce modèle ? Les séances passées seront conservées.
              </Txt>
              <Row>
                <Button
                  label="Confirmer la suppression du modèle"
                  danger
                  onPress={async () => {
                    await change((s) => ({
                      ...s,
                      templates: s.templates.filter((x) => x.id !== t.id),
                    }));
                    setDeleting(undefined);
                  }}
                />
                <Button
                  label="Garder le modèle"
                  secondary
                  onPress={() => setDeleting(undefined)}
                />
              </Row>
            </>
          )}
        </Card>
      ))}
    </Page>
  );
}
