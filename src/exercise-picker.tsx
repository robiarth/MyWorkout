import React, { useState } from "react";
import { useStore } from "./store";
import { Exercise, conventionLabels } from "./domain";
import { Card, Field, Button, Txt } from "./ui";
export function ExercisePicker({
  onSelect,
}: {
  onSelect: (e: Exercise) => void;
}) {
  const { state } = useStore();
  const [search, setSearch] = useState("");
  const matches = state.exercises.filter(
    (e) =>
      !e.archived &&
      `${e.name} ${e.description} ${e.muscle} ${e.equipment} ${e.aliases}`
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  return (
    <Card>
      <Field
        label="Rechercher nom, muscle ou matériel"
        value={search}
        onChange={setSearch}
      />
      {matches.map((e) => (
        <Button
          key={e.id}
          secondary
          label={`${e.name}${e.convention ? ` · ${conventionLabels[e.convention]}` : ""}`}
          onPress={() => onSelect(e)}
        />
      ))}
      {!matches.length && (
        <Txt>Aucun exercice. Créez-en un depuis Exercices.</Txt>
      )}
    </Card>
  );
}
