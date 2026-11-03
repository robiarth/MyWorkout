import { test, expect, APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
test("Supabase réel : OTP → invitation → séance synchronisée → suppression", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!,
    key = process.env.MW_TEST_SERVICE_KEY!;
  expect(url).toBe("http://127.0.0.1:54321");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const suffix = Date.now();
  const email = `owner-${suffix}@example.test`,
    guest = `guest-${suffix}@example.test`;
  const ids: string[] = [];
  async function otp(email: string) {
    let code: string | undefined;
    await expect
      .poll(
        async () => {
          const listing = await (
            await request.get("http://127.0.0.1:54324/api/v1/messages")
          ).json();
          const mail = listing.messages?.find(
            (m: { To: { Address: string }[] }) =>
              m.To?.some((to) => to.Address === email),
          );
          if (!mail) return false;
          const detail = await (
            await request.get(
              `http://127.0.0.1:54324/api/v1/message/${mail.ID}`,
            )
          ).json();
          code = `${detail.Text} ${detail.HTML}`.match(
            /Code MyWorkout\s*:\s*(\d{6})/,
          )?.[1];
          return !!code;
        },
        { timeout: 15000 },
      )
      .toBe(true);
    return code!;
  }
  try {
    const owner = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (owner.error) throw owner.error;
    ids.push(owner.data.user.id);
    const member = await admin
      .from("members")
      .insert({ id: owner.data.user.id, role: "admin" });
    if (member.error) throw member.error;
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Adresse e-mail", exact: true })
      .fill(email);
    await page
      .getByRole("button", { name: "Recevoir un code e-mail", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Code reçu par e-mail", exact: true })
      .fill(await otp(email));
    await page
      .getByRole("button", { name: "Vérifier mon e-mail", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Démarrer une séance", exact: true }),
    ).toBeVisible();
    await page.goto("/settings");
    await page
      .getByRole("button", {
        name: "Générer un code d’invitation",
        exact: true,
      })
      .click();
    const code = await page
      .getByRole("textbox", {
        name: "Code à partager (affiché une seule fois)",
        exact: true,
      })
      .inputValue();
    expect(code).toHaveLength(32);
    const ctx = await browser.newContext();
    const invited = await ctx.newPage();
    await invited.goto("/");
    await invited
      .getByRole("textbox", { name: "Adresse e-mail", exact: true })
      .fill(guest);
    await invited
      .getByRole("textbox", {
        name: "Code d’invitation (nouveau membre)",
        exact: true,
      })
      .fill(code);
    await invited
      .getByRole("button", { name: "Recevoir un code e-mail", exact: true })
      .click();
    await invited
      .getByRole("textbox", { name: "Code reçu par e-mail", exact: true })
      .fill(await otp(guest));
    await invited
      .getByRole("button", { name: "Vérifier mon e-mail", exact: true })
      .click();
    await invited
      .getByRole("button", { name: "Rejoindre la bêta", exact: true })
      .click();
    await invited
      .getByRole("button", { name: "Démarrer une séance", exact: true })
      .click();
    await invited
      .getByRole("button", { name: "Créer un modèle", exact: true })
      .click();
    await invited
      .getByRole("textbox", { name: "Nom de la séance", exact: true })
      .fill("Push synchronisé");
    await invited
      .getByRole("button", { name: "Ajouter un exercice", exact: true })
      .click();
    await invited
      .getByRole("button", {
        name: "Développé couché barre · kg, barre comprise",
        exact: true,
      })
      .click();
    await invited
      .getByRole("textbox", { name: "Charge initiale (kg)", exact: true })
      .fill("45");
    await invited
      .getByRole("button", { name: "Enregistrer le modèle", exact: true })
      .click();
    await invited
      .getByRole("button", { name: "Démarrer Push synchronisé", exact: true })
      .click();
    await invited
      .getByRole("button", {
        name: "Valider série 1 Développé couché barre",
        exact: true,
      })
      .click();
    await expect(
      invited.getByRole("button", {
        name: "Annuler série 1 Développé couché barre",
        exact: true,
      }),
    ).toBeVisible();
    await invited.goto("/settings");
    await invited
      .getByRole("button", { name: "Synchroniser maintenant", exact: true })
      .click();
    const users = await admin.auth.admin.listUsers();
    const guestUser = users.data.users.find((u) => u.email === guest)!;
    ids.push(guestUser.id);
    await expect
      .poll(
        async () => {
          const d = await admin
            .from("documents")
            .select("data")
            .eq("owner", guestUser.id)
            .single();
          return d.data?.data?.sessions?.[0]?.exercises?.[0]?.sets?.[0]?.done;
        },
        { timeout: 15000 },
      )
      .toBe(true);
    await invited
      .getByRole("textbox", {
        name: "Confirmation de suppression",
        exact: true,
      })
      .fill("SUPPRIMER");
    await invited
      .getByRole("button", {
        name: "Supprimer définitivement mon compte",
        exact: true,
      })
      .click();
    await expect(
      invited.getByRole("button", {
        name: "Recevoir un code e-mail",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await admin.from("documents").select("owner").eq("owner", guestUser.id))
        .data,
    ).toEqual([]);
    expect(
      (await admin.auth.admin.getUserById(guestUser.id)).error,
    ).toBeTruthy();
    await ctx.close();
  } finally {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
    const remaining = await admin.auth.admin.listUsers();
    for (const u of remaining.data.users.filter((u) => u.email === guest))
      await admin.auth.admin.deleteUser(u.id);
  }
});
