# MyWorkout

Application de suivi de musculation pour Android, iOS et le web, inspiree des usages de Liftoff. Projet en phase de cadrage : aucune application executable pour le moment.

## MVP

- Creer des routines avec exercices et objectifs de series/repetitions.
- Demarrer une seance et saisir poids, repetitions et effort ressenti (RPE facultatif).
- Minuteur de repos, historique et consultation de la seance precedente.
- Suivre la progression : records personnels et volume par exercice.
- Enregistrer une seance hors ligne ; synchroniser entre appareils apres connexion.
- Exporter ses donnees et supprimer son compte.

## Technologies proposees

| Besoin | Choix | Raison |
| --- | --- | --- |
| Android, iOS et web responsive | TypeScript, React Native, Expo, Expo Router, React Native Web | Partager les ecrans et la logique entre les trois plateformes |
| Interface | Composants React Native et StyleSheet | Rester proche de la plateforme et limiter les dependances |
| Comptes et donnees distantes | Supabase Auth et PostgreSQL | Authentification et stockage relationnel sans serveur applicatif sur mesure au depart |
| Isolation des donnees | PostgreSQL Row Level Security | Autoriser chaque utilisateur a acceder uniquement a ses donnees |
| Donnees locales | expo-sqlite sur mobile ; IndexedDB sur web | Conserver les seances hors ligne avec des adaptateurs propres a chaque plateforme |
| Validation des entrees | Zod et contraintes PostgreSQL | Valider les saisies et proteger les invariants en base |
| Tests | Jest / jest-expo, React Native Testing Library, Playwright pour le web | Tester les calculs, la saisie et les parcours essentiels |
| Livraison | GitHub Actions, Expo EAS Build/Submit, hebergement web statique | Verifications automatiques et distribution sur les stores |

Ces technologies sont des choix de depart, pas des services deja configures. Les comptes Supabase, Expo et stores seront necessaires lors de la mise en service. Les builds iOS locaux necessitent macOS ; EAS permet des builds distants.

## Organisation

Un seul depot public `MyWorkout` pour l'application universelle, les migrations Supabase et la documentation. Pas de depots distincts mobile/web/backend au depart : une modification fonctionnelle reste dans une seule pull request.

Organisation cible lorsque l'implementation commence : `app/` pour les routes Expo, `src/` pour les composants et la logique, `supabase/migrations/` pour le schema et les politiques d'acces.

## Regles de fonctionnement

- Une routine est un modele ; modifier une routine ne modifie jamais les seances deja enregistrees.
- Une serie conserve ses valeurs historiques et son ordre dans la seance. Les charges sont stockees dans une unite canonique et converties pour l'affichage kg/lb.
- Une saisie est sauvegardee localement avant d'etre annoncee comme enregistree. Une erreur de synchronisation reste visible et ne supprime pas la copie locale.
- Les identifiants stables rendent les nouvelles tentatives de synchronisation idempotentes. Les mises a jour utilisent une revision verifiee cote serveur ; un conflit ne doit pas ecraser silencieusement une seance.
- Les donnees d'entrainement restent privees meme si le code est public. Aucun secret ni donnee personnelle ne doit etre commite. La cle Supabase service_role ne doit jamais etre embarquee dans un client.

## Premiere tranche a implementer

Catalogue d'exercices initial, creation d'une routine, saisie et sauvegarde locale d'une seance, puis historique. Ajouter ensuite les comptes, les politiques d'acces et la synchronisation avec tests de perte de reseau et de conflits.

Le nom et les parcours sont propres au projet ; aucun code ou asset de Liftoff n'est inclus.
