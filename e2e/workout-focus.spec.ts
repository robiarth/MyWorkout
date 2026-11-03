import { test, expect } from "@playwright/test";
import { catalog } from "../src/catalog";
import {
  emptyState,
  newConfig,
  startSession,
  Template,
  Exercise,
} from "../src/domain";

test("un seul exercice, navigation superset, valeurs et repos conservés", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Démarrer une séance", exact: true }),
  ).toBeVisible();
  const timed: Exercise = {
    id: "time",
    name: "Gainage",
    description: "Maintenir la position.",
    measure: "duration",
    muscle: "Abdominaux",
    equipment: "",
    aliases: "",
    archived: false,
  };
  const template: Template = {
    id: "superset",
    name: "Push · Focus",
    mode: "last",
    autoRest: true,
    exercises: [
      { ...newConfig(catalog[0]!), load: 45 },
      { ...newConfig(catalog[1]!), load: 15, sets: 3 },
      { ...newConfig(timed), sets: 2, min: 30, max: 60 },
    ],
  };
  const data = {
    ...emptyState(),
    exercises: [...catalog, timed],
    templates: [template],
  };
  data.sessions = [startSession(data, template)];
  await page.evaluate(async (state) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("myworkout", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("documents", "readwrite");
      tx.objectStore("documents").put(
        JSON.stringify({
          data: state,
          revision: 0,
          dirty: true,
          mutation: "focus-test",
        }),
        "state:development",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.goto("/workout");
  const previous = page.getByRole("button", {
      name: "Exercice précédent",
      exact: true,
    }),
    next = page.getByRole("button", { name: "Exercice suivant", exact: true });
  await expect(
    page.getByRole("heading", { name: "Développé couché barre", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Extension triceps poulie",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(previous).toBeDisabled();
  await page
    .getByRole("textbox", {
      name: "Charge série 1 Développé couché barre",
      exact: true,
    })
    .fill("47.5");
  await page
    .getByRole("textbox", {
      name: "Répétitions série 1 Développé couché barre",
      exact: true,
    })
    .fill("9");
  await page
    .getByRole("button", {
      name: "Valider série 1 Développé couché barre",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Annuler série 1 Développé couché barre",
      exact: true,
    }),
  ).toBeVisible();
  const readRest = () =>
    page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("myworkout", 1);
        r.onsuccess = () => resolve(r.result);
      });
      const raw = await new Promise<string>((resolve) => {
        const r = db
          .transaction("documents")
          .objectStore("documents")
          .get("state:development");
        r.onsuccess = () => resolve(r.result);
      });
      db.close();
      return JSON.parse(raw).data.sessions[0].restEndsAt;
    });
  const rest = await readRest();
  expect(rest).toBeGreaterThan(Date.now());
  await next.click();
  await expect(
    page.getByRole("heading", {
      name: "Extension triceps poulie",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "Charge série 1 Développé couché barre",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(await readRest()).toBe(rest);
  await page
    .getByRole("textbox", {
      name: "Charge série 1 Extension triceps poulie",
      exact: true,
    })
    .fill("17.5");
  await page
    .getByRole("textbox", {
      name: "Répétitions série 1 Extension triceps poulie",
      exact: true,
    })
    .fill("8");
  await previous.click();
  await expect(
    page.getByRole("textbox", {
      name: "Charge série 1 Développé couché barre",
      exact: true,
    }),
  ).toHaveValue("47.5");
  await expect(
    page.getByRole("textbox", {
      name: "Répétitions série 1 Développé couché barre",
      exact: true,
    }),
  ).toHaveValue("9");
  await expect(
    page.getByRole("button", {
      name: "Annuler série 1 Développé couché barre",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "Développé couché barre", exact: true })
      .locator(".."),
  ).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: testInfo.outputPath("workout-focus.png"),
    fullPage: true,
  });
  await next.click();
  await expect(
    page.getByRole("textbox", {
      name: "Charge série 1 Extension triceps poulie",
      exact: true,
    }),
  ).toHaveValue("17.5");
  await expect(
    page.getByRole("textbox", {
      name: "Répétitions série 1 Extension triceps poulie",
      exact: true,
    }),
  ).toHaveValue("8");
  await next.click();
  await expect(
    page.getByRole("heading", { name: "Gainage", exact: true }),
  ).toBeVisible();
  await expect(next).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Secondes série 1 Gainage", exact: true })
    .fill("35");
  await page
    .getByRole("button", { name: "Valider série 1 Gainage", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Annuler série 1 Gainage", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Gainage", exact: true }),
  ).toBeVisible();
  await previous.click();
  await previous.click();
  await page
    .getByRole("button", { name: "Gérer l’exercice courant", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Remplacer Développé couché barre",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Curl haltères · kg/haltère", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Curl haltères", exact: true }),
  ).toBeVisible();
  await expect(previous).toBeDisabled();
  await page
    .getByRole("button", { name: "Annuler la dernière action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Développé couché barre", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "Charge série 1 Développé couché barre",
      exact: true,
    }),
  ).toHaveValue("47.5");
  for (let i = 2; i <= 4; i++) {
    await page
      .getByRole("button", {
        name: `Valider série ${i} Développé couché barre`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: `Annuler série ${i} Développé couché barre`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Développé couché barre", exact: true }),
  ).toBeVisible();
  await expect(next).toBeEnabled();
  await page
    .getByRole("button", { name: "Gérer l’exercice courant", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Retirer Développé couché barre",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Extension triceps poulie",
      exact: true,
    }),
  ).toBeVisible();
  await expect(previous).toBeDisabled();
  await page
    .getByRole("button", { name: "Annuler la dernière action", exact: true })
    .click();
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect(
    page.getByRole("button", {
      name: "Annuler série 4 Développé couché barre",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
