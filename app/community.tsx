import React, { useState } from "react";
import { useRouter } from "expo-router";
import { backend, rpc } from "../src/backend";
import { useStore } from "../src/store";
import { Exercise, exerciseSchema } from "../src/domain";
import {
  Button,
  Card,
  Field,
  Heading,
  Page,
  Row,
  Title,
  Txt,
  date,
} from "../src/ui";
type Proposal = {
  id: string;
  author: string | null;
  body: Exercise;
  created_at: string;
  status: string;
  target: string | null;
  reason: string | null;
};
type Vote = { proposal: string; voter: string; favorable: boolean };
type Report = { id: string; kind: string; target: string; reason: string };
export default function Community() {
  const { state, demo, auth, member, setMessage, sync } = useStore();
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]),
    [votes, setVotes] = useState<Vote[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [members, setMembers] = useState<{ id: string; suspended: boolean }[]>([]);
  const [selection, setSelection] = useState<Exercise>(),
    [target, setTarget] = useState<string | null>(null),
    [sharedIds, setSharedIds] = useState<string[]>([]),
    [report, setReport] = useState<{ kind: string; id: string }>(),
    [reason, setReason] = useState("");
  async function load() {
    if (!backend) return;
    await rpc("settle_proposals");
    const results = await Promise.all([
      backend
        .from("proposals")
        .select("*")
        .order("created_at", { ascending: false }),
      backend.from("votes").select("*"),
      backend.from("catalog").select("id"),
    ]);
    for (const r of results) if (r.error) throw r.error;
    setProposals((results[0]!.data ?? []) as unknown as Proposal[]);
    setVotes((results[1]!.data ?? []) as unknown as Vote[]);
    setSharedIds((results[2]!.data ?? []).map((x: { id: string }) => x.id));
    if (member?.role === "admin") {
      const { data, error } = await backend
        .from("reports")
        .select("id,kind,target,reason")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReports(data ?? []);
      const m = await backend.from("members").select("id,suspended");
      if (m.error) throw m.error;
      setMembers(m.data ?? []);
    }
    await sync();
  }
  React.useEffect(() => {
    if (!demo) void load().catch((e) => setMessage(String(e)));
  }, []);
  return (
    <Page>
      <Title>Communauté</Title>
      <Row>
        <Button
          label="Retour au catalogue"
          secondary
          onPress={() => router.push("/exercises")}
        />
        <Button
          label="Actualiser les votes"
          secondary
          disabled={demo}
          onPress={load}
        />
      </Row>
      <Txt>
        Partage facultatif. Une proposition est examinée pendant au moins 24 h.
        Ensuite, une majorité favorable et un vote suffisent ; sans vote elle
        reste en attente. Aucun vote sur sa propre proposition.
      </Txt>
      {demo && (
        <Card>
          <Txt>
            Connectez Supabase pour les propositions, votes et signalements.
          </Txt>
        </Card>
      )}
      {!selection ? (
        <Card>
          <Heading>Partager ou améliorer un exercice</Heading>
          <Txt muted>
            Choisissez une fiche. Les exercices personnels restent privés tant
            que vous ne soumettez pas de proposition.
          </Txt>
          {state.exercises
            .filter((e) => !e.archived)
            .map((e) => (
              <Button
                key={e.id}
                secondary
                disabled={demo}
                label={`${sharedIds.includes(e.id) ? "Proposer une modification" : "Proposer au catalogue"} : ${e.name}`}
                onPress={() => {
                  setSelection({ ...e });
                  setTarget(sharedIds.includes(e.id) ? e.id : null);
                }}
              />
            ))}
        </Card>
      ) : (
        <Card>
          <Heading>
            {target ? "Proposer une modification" : "Proposer un partage"}
          </Heading>
          <Field
            label="Nom proposé"
            value={selection.name}
            onChange={(name) => setSelection({ ...selection, name })}
          />
          <Field
            label="Description proposée"
            multiline
            value={selection.description}
            onChange={(description) =>
              setSelection({ ...selection, description })
            }
          />
          <Field
            label="Muscle proposé (facultatif)"
            value={selection.muscle}
            onChange={(muscle) => setSelection({ ...selection, muscle })}
          />
          <Field
            label="Matériel proposé (facultatif)"
            value={selection.equipment}
            onChange={(equipment) => setSelection({ ...selection, equipment })}
          />
          <Field
            label="Noms alternatifs proposés"
            value={selection.aliases}
            onChange={(aliases) => setSelection({ ...selection, aliases })}
          />
          <Txt muted>
            Mesure et convention inchangées. Pour une autre convention, créez un
            nouvel exercice.
          </Txt>
          <Row>
            <Button
              label="Soumettre au vote"
              onPress={async () => {
                const body = exerciseSchema.parse(selection);
                await rpc("submit_proposal", { body, target_id: target });
                setSelection(undefined);
                await load();
              }}
            />
            <Button
              label="Garder privé / annuler"
              secondary
              onPress={() => setSelection(undefined)}
            />
          </Row>
        </Card>
      )}
      <Heading>Propositions</Heading>
      {proposals.map((p) => {
        const pv = votes.filter((v) => v.proposal === p.id),
          mine = pv.find((v) => v.voter === auth?.user.id);
        return (
          <Card key={p.id}>
            <Heading>{p.body.name}</Heading>
            <Txt>{p.body.description}</Txt>
            <Txt muted>
              {p.status} · {date(p.created_at)} ·{" "}
              {pv.filter((v) => v.favorable).length} pour /{" "}
              {pv.filter((v) => !v.favorable).length} contre{" "}
              {mine
                ? `· Votre vote : ${mine.favorable ? "pour" : "contre"}`
                : ""}
            </Txt>
            {p.reason && <Txt muted>{p.reason}</Txt>}
            <Row>
              {p.status === "pending" && p.author !== auth?.user.id && (
                <>
                  <Button
                    label={`Pour ${p.body.name}`}
                    onPress={async () => {
                      await rpc("cast_vote", {
                        proposal_id: p.id,
                        favorable: true,
                      });
                      await load();
                    }}
                  />
                  <Button
                    label={`Contre ${p.body.name}`}
                    secondary
                    onPress={async () => {
                      await rpc("cast_vote", {
                        proposal_id: p.id,
                        favorable: false,
                      });
                      await load();
                    }}
                  />
                </>
              )}
              <Button
                label={`Signaler la proposition ${p.body.name}`}
                secondary
                onPress={() => {
                  setReport({ kind: "proposal", id: p.id });
                  setReason("");
                }}
              />
              {member?.role === "admin" && (
                <Button
                  label={`Modérer la proposition ${p.body.name}`}
                  secondary
                  onPress={() => {
                    setReport({ kind: "proposal", id: p.id });
                    setReason("");
                  }}
                />
              )}
            </Row>
          </Card>
        );
      })}
      <Card>
        <Heading>Signaler une fiche publique</Heading>
        {state.exercises
          .filter((e) => sharedIds.includes(e.id))
          .map((e) => (
            <Button
              key={e.id}
              secondary
              label={`Signaler ${e.name}`}
              onPress={() => {
                setReport({ kind: "catalog", id: e.id });
                setReason("");
              }}
            />
          ))}
      </Card>
      {member?.role === "admin" && (
        <>
          <Card>
            <Heading>Signalements reçus</Heading>
            {reports.map((r) => (
              <React.Fragment key={r.id}>
                <Txt>
                  {r.kind} · {r.target} : {r.reason}
                </Txt>
                <Button
                  label={`Examiner ${r.id}`}
                  secondary
                  onPress={() => {
                    setReport({ kind: r.kind, id: r.target });
                    setReason(r.reason);
                  }}
                />
              </React.Fragment>
            ))}
          </Card>
          <Card>
            <Heading>Membres</Heading>
            {members.map((m) => (
              <React.Fragment key={m.id}>
                <Txt>
                  {m.id} {m.suspended ? "· suspendu" : ""}
                </Txt>
                {m.id !== auth?.user.id && (
                  <Button
                    label={`Modérer le membre ${m.id}`}
                    secondary
                    onPress={() => {
                      setReport({ kind: "member", id: m.id });
                      setReason("");
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </Card>
        </>
      )}
      {report && (
        <Card>
          <Heading>Signalement / modération</Heading>
          <Txt muted>
            {report.kind} · {report.id}
          </Txt>
          <Field label="Motif" value={reason} onChange={setReason} multiline />
          <Row>
            <Button
              label="Envoyer le signalement"
              onPress={async () => {
                if (reason.trim().length < 3)
                  throw new Error("Précisez le motif.");
                await rpc("report_content", {
                  kind: report.kind,
                  target_id: report.id,
                  reason: reason.trim(),
                });
                setReport(undefined);
                setMessage("Signalement transmis.");
              }}
            />
            {member?.role === "admin" && (
              <>
                <Button
                  label={
                    report.kind === "member"
                      ? "Suspendre ce membre"
                      : "Masquer ce contenu"
                  }
                  danger
                  secondary
                  onPress={async () => {
                    await rpc("moderate", {
                      kind: report.kind,
                      target_id: report.id,
                      reason,
                      hidden: true,
                    });
                    setReport(undefined);
                    await load();
                  }}
                />
                {report.kind !== "proposal" && (
                  <Button
                    label={
                      report.kind === "member"
                        ? "Réactiver ce membre"
                        : "Rendre visible"
                    }
                    secondary
                    onPress={async () => {
                      await rpc("moderate", {
                        kind: report.kind,
                        target_id: report.id,
                        reason,
                        hidden: false,
                      });
                      setReport(undefined);
                      await load();
                    }}
                  />
                )}
              </>
            )}
            <Button
              label="Annuler le signalement"
              secondary
              onPress={() => setReport(undefined)}
            />
          </Row>
        </Card>
      )}
    </Page>
  );
}
