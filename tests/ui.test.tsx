import React from "react";
import { test, expect, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Choice, NumberField } from "../src/ui";
test("saisie française de décimales et sélection accessible", async () => {
  const change = jest.fn(),
    select = jest.fn();
  await render(
    <>
      <NumberField label="Charge" value={45} onChange={change} />
      <Choice
        label="Mode"
        value="last"
        options={[
          { value: "last", label: "Derniers résultats" },
          { value: "gentle", label: "Doux" },
        ]}
        onChange={select}
      />
    </>,
  );
  await fireEvent.changeText(screen.getByLabelText("Charge"), "47,5");
  expect(change).toHaveBeenCalledWith(47.5);
  await fireEvent.press(screen.getByRole("radio", { name: "Doux" }));
  expect(select).toHaveBeenCalledWith("gentle");
});
