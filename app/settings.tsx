import React, { useState } from "react";
import { useRouter } from "expo-router";
import { backend, rpc, signOut } from "../src/backend";
import { useStore } from "../src/store";
import { csv } from "../src/domain";
import { exportFile } from "../src/export";
import { remove } from "../src/storage";
import { scheduleRest } from "../src/notifications";
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
type Invitation = {
  id: string;
  created_at: string;
  expires_at: string;
  uses: number;
  revoked: boolean;
};
export default function Settings() {
  const store = useStore();
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[]>([]),
    [created, setCreated] = useState<{ code: string; expires_at: string }>(),
    [confirm, setConfirm] = useState("");
  async function load() {
    if (!backend) return;
    const { data, error } = await backend
      .from("invitations")
      .select("id,created_at,expires_at,uses,revoked")
      .order("created_at", { ascending: false });
    if (error) throw error;
    setInvitations(data ?? []);
  }
  return (
    <Page>
      <Title>Compte et réglages</Title>
      <Card>
        <Heading>
          {store.demo ? "Développement local" : store.auth?.user.email}
        </Heading>
        <Txt muted>{store.cloudStatus}</Txt>
        <Row>
          <Button
            label="Synchroniser maintenant"
            disabled={store.demo}
            onPress={store.sync}
          />
          <Button
            label="Votes et communauté"
            secondary
            onPress={() => router.push("/community")}
          />
        </Row>
      </Card>
      <Card>
        <Heading>Inviter un testeur</Heading>
        <Txt>
          Chaque code expire après sept jours et permet dix inscriptions
          vérifiées. Un nouveau code toutes les 24 heures.
        </Txt>
        <Button
          label="Générer un code d’invitation"
          disabled={store.demo}
          onPress={async () => {
            const result = await rpc<{ code: string; expires_at: string }>(
              "create_invite",
            );
            setCreated(result);
            await load();
          }}
        />
        {created && (
          <>
            <Field
              label="Code à partager (affiché une seule fois)"
              value={created.code}
              onChange={() => {}}
            />
            <Txt muted>
              Expire le {date(created.expires_at)}. Copiez ce code maintenant.
            </Txt>
          </>
        )}
        <Button
          label="Actualiser mes invitations"
          secondary
          disabled={store.demo}
          onPress={load}
        />
        {invitations.map((i) => (
          <Card key={i.id}>
            <Txt>
              {i.uses}/10 utilisations ·{" "}
              {i.revoked ? "Révoqué" : `Expire le ${date(i.expires_at)}`}
            </Txt>
            <Button
              label={`Révoquer le code du ${date(i.created_at)}`}
              secondary
              disabled={i.revoked}
              onPress={async () => {
                await rpc("revoke_invite", { invitation_id: i.id });
                await load();
              }}
            />
          </Card>
        ))}
      </Card>
      <Card>
        <Heading>Mes données</Heading>
        <Txt>
          Exportez vos modèles, exercices personnels et séances, y compris les
          brouillons.
        </Txt>
        <Row>
          <Button
            label="Exporter JSON complet"
            secondary
            onPress={() =>
              exportFile(
                "myworkout.json",
                JSON.stringify(store.state, null, 2),
                "application/json",
              )
            }
          />
          <Button
            label="Exporter les séries CSV"
            secondary
            onPress={() =>
              exportFile("myworkout-series.csv", csv(store.state), "text/csv")
            }
          />
        </Row>
      </Card>
      {!store.demo && (
        <Card>
          <Heading>Suppression du compte</Heading>
          <Txt>
            Cette action supprime vos données privées sur le serveur et cet
            appareil. Les contributions publiques sont conservées sans lien avec
            votre compte. Les copies hors ligne sur vos autres appareils seront
            effacées à leur prochaine connexion constatant la suppression du
            compte.
          </Txt>
          <Txt muted>
            Exportez vos données avant de continuer. Saisissez SUPPRIMER pour
            confirmer.
          </Txt>
          <Field
            label="Confirmation de suppression"
            value={confirm}
            onChange={setConfirm}
          />
          <Button
            label="Supprimer définitivement mon compte"
            danger
            secondary
            disabled={confirm !== "SUPPRIMER"}
            onPress={async () => {
              if (!backend || !store.auth) return;
              const result = await backend.functions.invoke("delete-account", {
                body: {},
              });
              if (result.error || !result.data?.ok)
                throw new Error(
                  result.error?.message ?? "Suppression non confirmée.",
                );
              await remove(`state:${store.auth.user.id}`);
              await remove(`member:${store.auth.user.id}`);
              await scheduleRest(null);
              await signOut();
            }}
          />
        </Card>
      )}
      {!store.demo && (
        <Button
          label="Se déconnecter"
          secondary
          onPress={async () => {
            await store.sync();
            await scheduleRest(null);
            await signOut();
          }}
        />
      )}
      <Txt muted>
        MyWorkout 0.1 · Français · Kilogrammes · Gratuit et sans publicité
      </Txt>
    </Page>
  );
}
