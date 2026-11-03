import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useStore } from "../src/store";
import { series, conventionLabels } from "../src/domain";
import { Chart } from "../src/chart";
import {
  Button,
  Card,
  Choice,
  Heading,
  NumberField,
  Page,
  Row,
  Title,
  Txt,
  date,
} from "../src/ui";
export default function Dashboard() {
  const { state } = useStore();
  const router = useRouter();
  const [filter, setFilter] = useState<"max" | "reps" | "rm">("max"),
    [reps, setReps] = useState(10),
    [selected, setSelected] = useState<string>();
  const exercises = state.exercises.filter(
    (e) =>
      e.measure === "load" &&
      (state.favorites.includes(e.id) ||
        state.sessions.some((s) =>
          s.exercises.some((x) => x.config.exercise.id === e.id),
        )),
  );
  const exercise = exercises.find((e) => e.id === selected) ?? exercises[0];
  const finished = state.sessions
    .filter((s) => s.finishedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <Page>
      <Title>Votre progression</Title>
      <Txt muted>Des performances concrètes, séance après séance.</Txt>
      <Button
        label={
          state.sessions.some((s) => !s.finishedAt)
            ? "Reprendre une séance"
            : "Démarrer une séance"
        }
        onPress={() =>
          router.push(
            state.sessions.some((s) => !s.finishedAt)
              ? "/workout"
              : "/templates",
          )
        }
      />
      <Card>
        <Heading>
          {finished.length} séance{finished.length > 1 ? "s" : ""} terminée
          {finished.length > 1 ? "s" : ""}
        </Heading>
        <Txt muted>
          {finished.length
            ? `Dernière séance : ${finished[0]!.name} · ${date(finished[0]!.startedAt)}`
            : "Votre première séance donnera vie à ce tableau de bord."}
        </Txt>
      </Card>
      {exercise ? (
        <Card>
          <Heading>Évolution par exercice</Heading>
          <Row>
            {exercises.map((e) => (
              <Button
                key={e.id}
                label={`${state.favorites.includes(e.id) ? "★ " : ""}${e.name}`}
                secondary={e.id !== exercise.id}
                onPress={() => setSelected(e.id)}
              />
            ))}
          </Row>
          <Txt muted>
            {exercise.convention ? conventionLabels[exercise.convention] : ""}
          </Txt>
          <Choice
            label="Indicateur"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "max", label: "Charge maximale réalisée" },
              { value: "reps", label: "Charge à répétitions fixes" },
              { value: "rm", label: "1RM estimé" },
            ]}
          />
          {filter === "reps" && (
            <NumberField
              label="Nombre de répétitions"
              value={reps}
              onChange={setReps}
            />
          )}
          {filter === "rm" && (
            <Txt muted>
              Estimation d’Epley sur 1 à 10 répétitions, hors échauffement. Ce
              chiffre ne pilote pas vos objectifs.
            </Txt>
          )}
          <Chart
            key={`${exercise.id}-${filter}-${reps}`}
            points={series(
              state,
              exercise,
              filter === "reps" ? reps : undefined,
              filter === "rm",
            )}
          />
          <Heading>Historique des séries</Heading>
          {finished
            .filter((s) =>
              s.exercises.some((e) => e.config.exercise.id === exercise.id),
            )
            .map((s) => (
              <React.Fragment key={s.id}>
                <Txt>
                  {date(s.startedAt)} · {s.name}
                </Txt>
                {s.exercises
                  .filter((e) => e.config.exercise.id === exercise.id)
                  .map((e) => (
                    <Txt key={e.config.id} muted>
                      {e.sets
                        .map(
                          (t) =>
                            `${t.warmup ? "Éch. " : ""}${t.done ? "✓" : "—"} ${t.load} kg × ${t.reps}`,
                        )
                        .join(" · ")}
                    </Txt>
                  ))}
              </React.Fragment>
            ))}
        </Card>
      ) : (
        <Card>
          <Heading>Choisissez vos exercices favoris</Heading>
          <Txt>
            Marquez-les d’une étoile dans le catalogue ou terminez votre
            première séance.
          </Txt>
          <Button
            label="Ouvrir les exercices"
            secondary
            onPress={() => router.push("/exercises")}
          />
        </Card>
      )}
      <Heading>Séances réalisées</Heading>
      {finished.map((s) => (
        <Card key={s.id}>
          <Heading>{s.name}</Heading>
          <Txt muted>{date(s.startedAt)}</Txt>
          <Button
            label={`Consulter et corriger ${s.name} du ${date(s.startedAt)}`}
            secondary
            onPress={() =>
              router.push({ pathname: "/workout", params: { id: s.id } })
            }
          />
        </Card>
      ))}
    </Page>
  );
}
