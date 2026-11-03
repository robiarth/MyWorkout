import React, { useState } from "react";
import { backend, signOut } from "./backend";
import { rpc } from "./backend";
import { useStore } from "./store";
import { Button, Card, Field, Heading, Page, Title, Txt } from "./ui";
import { write, read } from "./storage";
export function AuthScreen() {
  const { auth, member, reloadMember, ready, message, setMessage } = useStore();
  const [email, setEmail] = useState(""),
    [invite, setInvite] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false);
  React.useEffect(() => {
    void read("pending-invite").then((v) => {
      if (v) setInvite(v);
    });
  }, []);
  if (!backend)
    return (
      <Page>
        <Title>MyWorkout</Title>
        <Card>
          <Heading>Bêta privée</Heading>
          <Txt>
            La connexion n’est pas encore configurée. Renseignez les variables
            Supabase dans .env pour accéder à la bêta.
          </Txt>
          <Txt muted>
            Le mode de développement local doit être activé explicitement ;
            aucune inscription publique n’est ouverte.
          </Txt>
        </Card>
      </Page>
    );
  if (auth && !ready)
    return (
      <Page>
        <Title>Chargement du compte…</Title>
        {!!message && <Txt>{message}</Txt>}
      </Page>
    );
  const client = backend;
  if (member?.suspended)
    return (
      <Page>
        <Title>Accès suspendu</Title>
        <Txt>Contactez l’administrateur de la bêta.</Txt>
        <Button label="Se déconnecter" onPress={signOut} />
      </Page>
    );
  return (
    <Page>
      <Title>Bienvenue dans MyWorkout</Title>
      <Txt>Votre carnet de musculation privé. Gratuit, sans publicité.</Txt>
      {!!message && (
        <Card>
          <Txt>{message}</Txt>
          <Button
            label="Fermer le message"
            secondary
            onPress={() => setMessage("")}
          />
        </Card>
      )}
      <Card>
        {!auth ? (
          <>
            <Heading>
              {sent ? "Vérifiez votre e-mail" : "Connexion / invitation"}
            </Heading>
            <Field
              label="Adresse e-mail"
              email
              value={email}
              onChange={setEmail}
            />
            <Field
              label="Code d’invitation (nouveau membre)"
              value={invite}
              onChange={setInvite}
            />
            <Button
              label={
                sent ? "Renvoyer un code e-mail" : "Recevoir un code e-mail"
              }
              onPress={async () => {
                if (!/^\S+@\S+\.\S+$/.test(email.trim()))
                  throw new Error("Adresse e-mail invalide.");
                await write("pending-invite", invite.trim());
                const { error } = await client.auth.signInWithOtp({
                  email: email.trim(),
                  options: { shouldCreateUser: !!invite.trim() },
                });
                if (error) throw error;
                setMessage("");
                setSent(true);
              }}
            />
            {sent && (
              <>
                <Field
                  label="Code reçu par e-mail"
                  value={otp}
                  onChange={setOtp}
                />
                <Button
                  label="Vérifier mon e-mail"
                  onPress={async () => {
                    const { error } = await client.auth.verifyOtp({
                      email: email.trim(),
                      token: otp.trim(),
                      type: "email",
                    });
                    if (error) throw error;
                  }}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Heading>Activer mon invitation</Heading>
            <Txt>Connecté : {auth.user.email}</Txt>
            <Field
              label="Code d’invitation"
              value={invite}
              onChange={setInvite}
            />
            <Button
              label="Rejoindre la bêta"
              onPress={async () => {
                const result = await rpc<{ ok: boolean; error?: string }>(
                  "redeem_invite",
                  { code: invite.trim() },
                );
                if (!result.ok) throw new Error(result.error);
                await write("pending-invite", "");
                await reloadMember();
              }}
            />
            <Button label="Se déconnecter" secondary onPress={signOut} />
          </>
        )}
      </Card>
      <Txt muted>
        Une connexion Internet est nécessaire pour le premier accès. Les séances
        déjà téléchargées restent ensuite disponibles hors ligne.
      </Txt>
    </Page>
  );
}
