import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
const { Client } = pg;

test("PostgreSQL : invitations concurrentes, isolation, sync, votes et anonymisation", async () => {
  // Always create an isolated, uniquely named database. Never reset the configured database.
  const url =
    process.env.MW_TEST_DATABASE_URL ??
    "postgresql://postgres:myworkout-local-test@127.0.0.1:54329/postgres";
  const root = new Client({ connectionString: url });
  await root.connect();
  const name = `myworkout_test_${Date.now()}`;
  assert.match(name, /^myworkout_test_\d+$/);
  const clients = [];
  let db;
  try {
    await root.query(`CREATE DATABASE "${name}"`);
    const isolated = new URL(url);
    isolated.pathname = `/${name}`;
    db = new Client({ connectionString: isolated.toString() });
    await db.connect();
    await db.query(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`);
    await db.query(
      await readFile(
        new URL(
          "../supabase/migrations/202611030001_beta.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const ids = Array.from(
      { length: 16 },
      (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
    for (const id of ids)
      await db.query("INSERT INTO auth.users VALUES($1,now())", [id]);
    await db.query("INSERT INTO public.members(id,role) VALUES($1,'admin')", [
      ids[0],
    ]);
    async function as(id) {
      const c = new Client({ connectionString: isolated.toString() });
      await c.connect();
      clients.push(c);
      await c.query("SET ROLE authenticated");
      await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
      return c;
    }
    const owner = await as(ids[0]);
    const newCode = async () =>
      (await owner.query("SELECT public.create_invite() AS r")).rows[0].r;
    const invitation = await newCode();
    assert.equal(invitation.code.length, 32);
    await assert.rejects(newCode(), /24 heures/);
    await assert.rejects(
      owner.query("UPDATE public.members SET role = 'admin'"),
      /permission denied/,
    );
    const recipients = await Promise.all(ids.slice(1, 13).map(as));
    const redemption = await Promise.all(
      recipients.map((c) =>
        c.query("SELECT public.redeem_invite($1) AS r", [invitation.code]),
      ),
    );
    assert.equal(
      redemption.filter((r) => r.rows[0].r.ok).length,
      10,
      "exactement dix comptes consomment le code",
    );
    assert.equal(
      (
        await db.query("SELECT uses FROM public.invitations WHERE id=$1", [
          invitation.id,
        ])
      ).rows[0].uses,
      10,
    );
    const memberIndex = redemption.findIndex((r) => r.rows[0].r.ok),
      otherIndex = redemption.findIndex(
        (r, i) => r.rows[0].r.ok && i !== memberIndex,
      );
    const member = recipients[memberIndex],
      other = recipients[otherIndex];
    assert.equal(
      (
        await member.query("SELECT public.redeem_invite($1) AS r", [
          invitation.code,
        ])
      ).rows[0].r.ok,
      true,
      "idempotence de l’adhésion",
    );
    const outsider = await as(ids[15]);
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await outsider.query("SELECT public.redeem_invite('bad') AS r"))
          .rows[0].r.ok,
        false,
      );
    assert.match(
      (await outsider.query("SELECT public.redeem_invite('bad') AS r")).rows[0]
        .r.error,
      /Trop de tentatives/,
    );
    await db.query(
      "UPDATE public.members SET last_invite_at = now()-interval '25 hours' WHERE id=$1",
      [ids[0]],
    );
    const expired = await newCode();
    await db.query(
      "UPDATE public.invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    const unused = await as(ids[14]);
    assert.equal(
      (
        await unused.query("SELECT public.redeem_invite($1) AS r", [
          expired.code,
        ])
      ).rows[0].r.ok,
      false,
    );
    await db.query(
      "UPDATE public.invitations SET expires_at=now()+interval '1 day',revoked=true WHERE id=$1",
      [expired.id],
    );
    assert.equal(
      (
        await unused.query("SELECT public.redeem_invite($1) AS r", [
          expired.code,
        ])
      ).rows[0].r.ok,
      false,
    );
    const document = {
      version: 1,
      exercises: [],
      templates: [],
      sessions: [],
      favorites: [],
    };
    const write = async (c, revision, mutation, data = document) =>
      (
        await c.query("SELECT public.sync_document($1,$2,$3) AS r", [
          revision,
          mutation,
          data,
        ])
      ).rows[0].r;
    assert.equal((await write(member, 0, "first")).revision, 1);
    assert.equal(
      (await write(member, 0, "first")).revision,
      1,
      "réessai après réponse perdue",
    );
    assert.equal((await write(member, 0, "stale")).conflict, true);
    assert.equal(
      (await other.query("SELECT * FROM public.documents")).rowCount,
      0,
      "isolation RLS",
    );
    await assert.rejects(write(outsider, 0, "unauthorized"), /réservé/);
    await assert.rejects(write(member, 1, "malformed", {}), /invalide/);
    await assert.rejects(
      member.query("UPDATE public.documents SET revision=99"),
      /permission denied/,
    );
    const exercise = {
      id: "personal",
      name: "Développé",
      description: "Description originale",
      measure: "load",
      convention: "bar",
      muscle: "",
      equipment: "",
      aliases: "",
      archived: false,
    };
    const submit = async (c, target = null) =>
      (
        await c.query("SELECT public.submit_proposal($1,$2) AS id", [
          exercise,
          target,
        ])
      ).rows[0].id;
    const config = {
      id: "occurrence",
      exercise,
      sets: 1,
      load: 45,
      min: 6,
      max: 10,
      increment: 2.5,
      rest: 90,
      mode: null,
    };
    const full = {
      ...document,
      exercises: [exercise],
      templates: [
        {
          id: "push",
          name: "Push",
          mode: "standard",
          autoRest: true,
          exercises: [config],
        },
      ],
      sessions: [
        {
          id: "session",
          templateId: "push",
          name: "Push",
          startedAt: "2026-11-03T12:00:00.000Z",
          finishedAt: null,
          restEndsAt: null,
          autoRest: true,
          exercises: [
            {
              config,
              mode: "standard",
              sets: [
                {
                  id: "set",
                  load: 45,
                  reps: 6,
                  targetLoad: 45,
                  targetReps: 6,
                  warmup: false,
                  done: true,
                },
              ],
            },
          ],
        },
      ],
    };
    assert.equal(
      (await write(member, 1, "complete", full)).revision,
      2,
      "document complet produit par le carnet accepté",
    );
    await assert.rejects(
      write(member, 2, "bad-number", {
        ...full,
        templates: [
          { ...full.templates[0], exercises: [{ ...config, load: "45" }] },
        ],
      }),
      /invalide/,
    );
    await assert.rejects(
      write(member, 2, "bad-favorites", { ...full, favorites: [42] }),
      /invalide/,
    );
    await assert.rejects(
      write(member, 2, "complete", document),
      /déjà utilisé/,
    );
    const proposal = await submit(member);
    await assert.rejects(
      member.query("SELECT public.cast_vote($1,true)", [proposal]),
      /propre/,
    );
    await other.query("SELECT public.cast_vote($1,true)", [proposal]);
    await other.query("SELECT public.settle_proposals()");
    assert.equal(
      (
        await db.query("SELECT status FROM public.proposals WHERE id=$1", [
          proposal,
        ])
      ).rows[0].status,
      "pending",
    );
    await other.query("SELECT public.cast_vote($1,false)", [proposal]);
    await other.query("SELECT public.cast_vote($1,true)", [proposal]);
    await db.query(
      "UPDATE public.proposals SET created_at=now()-interval '25 hours' WHERE id=$1",
      [proposal],
    );
    await other.query("SELECT public.settle_proposals()");
    const published = (
      await db.query("SELECT * FROM public.proposals WHERE id=$1", [proposal])
    ).rows[0];
    assert.equal(published.status, "accepted");
    const amendments = [
      await submit(member, published.published_id),
      await submit(member, published.published_id),
    ];
    for (const id of amendments)
      await other.query("SELECT public.cast_vote($1,true)", [id]);
    await db.query(
      "UPDATE public.proposals SET created_at=now()-interval '25 hours' WHERE id=ANY($1::uuid[])",
      [amendments],
    );
    await other.query("SELECT public.settle_proposals()");
    assert.deepEqual(
      (
        await db.query(
          "SELECT status FROM public.proposals WHERE id=ANY($1::uuid[])",
          [amendments],
        )
      ).rows
        .map((r) => r.status)
        .sort(),
      ["accepted", "rejected"],
      "une modification obsolète ne remplace pas la fiche déjà révisée",
    );
    await assert.rejects(
      other.query("SELECT public.cast_vote($1,false)", [proposal]),
      /clôturé/,
    );
    const novotes = await submit(member);
    await db.query(
      "UPDATE public.proposals SET created_at=now()-interval '25 hours' WHERE id=$1",
      [novotes],
    );
    await other.query("SELECT public.settle_proposals()");
    assert.equal(
      (
        await db.query("SELECT status FROM public.proposals WHERE id=$1", [
          novotes,
        ])
      ).rows[0].status,
      "pending",
    );
    await other.query("SELECT public.cast_vote($1,false)", [novotes]);
    assert.equal(
      (
        await db.query("SELECT status FROM public.proposals WHERE id=$1", [
          novotes,
        ])
      ).rows[0].status,
      "rejected",
    );
    const tie = await submit(member);
    await other.query("SELECT public.cast_vote($1,true)", [tie]);
    await owner.query("SELECT public.cast_vote($1,false)", [tie]);
    await db.query(
      "UPDATE public.proposals SET created_at=now()-interval '25 hours' WHERE id=$1",
      [tie],
    );
    await other.query("SELECT public.settle_proposals()");
    assert.equal(
      (await db.query("SELECT status FROM public.proposals WHERE id=$1", [tie]))
        .rows[0].status,
      "rejected",
    );
    await assert.rejects(
      member.query("SELECT public.moderate('catalog',$1,'spam',true)", [
        published.published_id,
      ]),
      /Administration/,
    );
    await owner.query("SELECT public.moderate('catalog',$1,'doublon',true)", [
      published.published_id,
    ]);
    assert.equal(
      (
        await member.query("SELECT * FROM public.catalog WHERE id=$1", [
          published.published_id,
        ])
      ).rowCount,
      0,
    );
    await owner.query("SELECT public.moderate('member',$1,'abus',true)", [
      ids[memberIndex + 1],
    ]);
    await assert.rejects(write(member, 1, "suspended"), /réservé/);
    await db.query("DELETE FROM auth.users WHERE id=$1", [
      ids[memberIndex + 1],
    ]);
    assert.equal(
      (
        await db.query("SELECT * FROM public.documents WHERE owner=$1", [
          ids[memberIndex + 1],
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("SELECT author FROM public.catalog WHERE id=$1", [
          published.published_id,
        ])
      ).rows[0].author,
      null,
    );
    assert.equal(
      (
        await db.query("SELECT author FROM public.proposals WHERE id=$1", [
          proposal,
        ])
      ).rows[0].author,
      null,
    );
  } finally {
    await Promise.all(clients.map((c) => c.end()));
    if (db) await db.end();
    await root.query(`DROP DATABASE IF EXISTS "${name}"`);
    await root.end();
  }
});
