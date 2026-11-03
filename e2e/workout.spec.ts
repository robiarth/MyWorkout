import { test, expect } from "@playwright/test";
test("modèle → séance → reprise IndexedDB → historique → progression", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Démarrer une séance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Créer un modèle", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Nom de la séance", exact: true })
    .fill("Push");
  await page.getByRole("radio", { name: "Standard", exact: true }).click();
  await page
    .getByRole("button", { name: "Ajouter un exercice", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Développé couché barre · kg, barre comprise",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Charge initiale (kg)", exact: true })
    .fill("45");
  await page
    .getByRole("button", { name: "Enregistrer le modèle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Démarrer Push", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Valider série 1 Développé couché barre",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Annuler série 1 Développé couché barre",
      exact: true,
    }),
  ).toBeVisible();
  await context.setOffline(true);
  for (let i = 2; i <= 4; i++)
    await page
      .getByRole("button", {
        name: `Valider série ${i} Développé couché barre`,
        exact: true,
      })
      .click();
  await page
    .getByRole("button", { name: "Terminer la séance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Garder le modèle actuel", exact: true })
    .click();
  await expect(
    page.getByText("1 séance terminée", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Démarrer une séance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Démarrer Push", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Répétitions série 1 Développé couché barre",
      exact: true,
    }),
  ).toHaveValue("7");
  await page
    .getByRole("button", {
      name: "Comparer à la séance précédente",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Dernière séance du même modèle", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("workout.png"),
    fullPage: true,
  });
});
