# Mise en service de la bêta

## Projet et migration

Utiliser un projet Supabase dédié. Avec le CLI officiel Supabase : `supabase start` pour le local, ou lier un projet existant puis appliquer `supabase db push` après revue. La migration `supabase/migrations/202611030001_beta.sql` crée les tables et RPC ; elle ne doit pas être appliquée à un projet partageant déjà d’autres fonctions publiques (elle révoque par défaut l’exécution des fonctions publiques pour les clients).

Sauvegarder la base avant toute migration ultérieure. Pour cette première installation vide, le retour arrière sûr est un nouveau projet dédié ; ne pas supprimer les tables d’un projet contenant des entraînements.

Configurer l’application avec l’URL et la clé anon/publishable du projet. Les accès restent fermés sans membership, même si quelqu’un crée directement un compte Supabase Auth.

## Premier administrateur

Créer et vérifier ton compte e-mail dans Supabase Auth. Dans l’éditeur SQL, avec un accès administrateur, exécuter en remplaçant l’UUID :

```sql
insert into public.members(id,role)
select id,'admin' from auth.users
where id = 'UUID-DU-COMPTE' and email_confirmed_at is not null;
```

Se reconnecter, puis générer une invitation depuis Compte. Aucun administrateur ni code permanent n’est embarqué.

## E-mails et protections

Activer la confirmation e-mail et le fournisseur e-mail. Configurer les modèles **Confirm signup** et **Magic Link** pour afficher `{{ .Token }}` : l’application vérifie un code, pas un lien profond. Configurer SMTP pour les testeurs (le SMTP de démonstration Supabase est limité), expiration OTP de dix minutes, un envoi par minute minimum et limites par IP adaptées à la bêta. Les réglages locaux correspondants figurent dans `supabase/config.toml`.

La vérification e-mail précède la consommation de l’invitation ; la création Auth ne réserve pas d’usage. Le RPC de consommation sérialise le destinataire et l’invitation, limite à dix adhésions et cinq essais par compte sur quinze minutes. Les limites d’Auth par IP doivent rester actives contre la création de nombreux comptes et le bombardement d’e-mails.

## Publication à 24 heures

Les appels `settle_proposals` et `cast_vote` clôturent les propositions arrivées à échéance ; les clients ne contrôlent jamais l’horloge de décision. Pour publier sans qu’un membre ouvre l’application, activer l’extension officielle `pg_cron` dans Supabase puis créer, en administrateur, une tâche toutes les minutes :

```sql
select cron.schedule('myworkout-publish', '* * * * *', $$
  select public.settle_proposal(id)
  from public.proposals
  where status = 'pending' and created_at <= now() - interval '24 hours'
  order by created_at;
$$);
```

La tâche s’exécute avec le rôle de son créateur ; ne pas accorder `settle_proposal` aux clients. Sans vote, la proposition reste en attente. Le premier vote après 24 h tranche immédiatement. Les modifications concurrentes d’une même fiche sont contrôlées par révision : une proposition devenue obsolète est refusée.

## Suppression

Déployer uniquement après configuration du projet : `supabase functions deploy delete-account`. La fonction vérifie le jeton via Auth et utilise `SUPABASE_SERVICE_ROLE_KEY` fourni à l’environnement Edge, jamais au client. Une suppression Auth déclenche les cascades pour données privées, invitations, votes et limites ; les auteurs des contributions et signalements deviennent nuls.

Configurer un délai de rétention des sauvegardes conforme à la politique annoncée aux testeurs. Une copie hors ligne sur un autre appareil ne peut pas être effacée à distance sans réseau ; lorsqu’un contrôle authentifié confirme l’absence du membre, son cache local est retiré. Si le jeton est déjà expiré, une reconnexion ou un effacement local reste nécessaire : une simple erreur d’authentification ne doit jamais détruire des séries non envoyées. La déconnexion ordinaire conserve le carnet local sous la clé du compte, mais retire l’identité active afin de fermer son accès dans l’interface.

## Avant invitation réelle

- Tester deux comptes sur le projet : code e-mail, invitation, refus d’accès sans membership, révocation et suspension.
- Vérifier la synchronisation de deux appareils, conflit exportable et conservation de deux brouillons.
- Tester la fonction Edge de suppression et l’anonymisation sur un compte jetable.
- Vérifier notifications et reprise sur Android réel, puis sur iPhone avant diffusion iOS.
- Vérifier sauvegardes et restauration, surveiller erreurs Auth/RPC/Edge et les propositions signalées. Ne pas journaliser les codes, jetons ou documents d’entraînement.

Les scripts de ce dépôt ne créent aucun service payant et ne déclenchent aucun déploiement distant.
