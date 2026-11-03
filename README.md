# MyWorkout

Carnet de musculation gratuit et sans publicité, en français et en kg. Application Expo commune à Android (prioritaire), iOS et web. Code public, entraînements privés, accès à la bêta sur invitation.

## Démarrer

Node 24 et npm sont nécessaires.

```sh
npm ci
```

Copier `.env.example` vers `.env` et renseigner les deux variables publiques Supabase. Puis :

```sh
npm run web
npm run android
```

Sans Supabase, l’application affiche l’écran de configuration. Pour essayer le carnet **uniquement en développement**, mettre `EXPO_PUBLIC_LOCAL_DEMO=true` dans `.env`, sans URL ni clé Supabase, puis redémarrer Expo. Ce mode ne fonctionne pas dans un export de production et ses données sont séparées des comptes réels. Les votes et invitations nécessitent le serveur.

## Fonctions

- Modèles libres, exercices personnels, conventions de charge, échauffements et séries ajustables.
- Un exercice à la fois, séries en grille compacte et flèches précédent/suivant pour alterner librement en superset. Validation en un appui, comparaison ciblée, repos fixe en bas de l’écran, annulation et reprise de brouillon.
- Reprise des résultats ou progression douce / standard / soutenue, réglage global et exceptions par exercice. Les objectifs manqués sont reconduits ; toutes les séries au plafond proposent un incrément puis le bas de la fenêtre.
- Tableau de bord, favoris, historique corrigeable, charge maximale, charge à répétitions fixes et 1RM estimé distinct.
- Sauvegarde locale SQLite / IndexedDB, synchronisation versionnée, conflits explicites et conservation des brouillons de plusieurs appareils.
- Invitations de dix usages, un code par 24 h, validité sept jours ; exports JSON/CSV et suppression de compte.
- Catalogue communautaire sur proposition, votes après 24 h, signalements et modération.

Le catalogue initial contient douze descriptions originales dans `src/catalog.ts`, sans médias ni base externe copiée. L’import d’une source tierce reste conditionné à la vérification de licence et d’attribution ; le catalogue original constitue le repli prévu. Les tractions lestées/assistées, objectifs datés, supersets structurés, séries dégressives et fonctions sociales sont différés.

## Configurer Supabase

Voir [le guide serveur](docs/server.md) pour les migrations, l’administrateur initial, les e-mails OTP, les tâches de publication, la fonction de suppression et les contrôles avant ouverture.

Les seules variables embarquées sont l’URL et la clé **publique** Supabase. Ne jamais exposer une clé `service_role`. L’authentification seule ne donne pas accès aux données : il faut être membre actif. Les écritures sensibles passent exclusivement par les fonctions SQL ; les tables sont protégées par RLS.

## Vérifier

```sh
npm run typecheck
npm test
npm run build:web
npx expo export --platform android --output-dir dist-android
npx expo export --platform ios --output-dir dist-ios
npx playwright install chromium
npm run test:e2e
npm run test:offline
```

Pour vérifier aussi le vrai parcours Auth / invitation / synchronisation / suppression, démarrer Supabase local avec le CLI officiel (`npx supabase start`), puis lancer `npm run test:cloud`. Le script refuse une URL distante, utilise le serveur e-mail local et supprime uniquement ses comptes jetables `@example.test`. Il ne journalise pas les clés de service.

Les tests PostgreSQL créent puis suppriment leur propre base `myworkout_test_<timestamp>`, sans réinitialiser la base de connexion. Utiliser une instance locale jetable :

```sh
docker run --detach --rm --name myworkout-db-test --publish 127.0.0.1:54329:5432 --env POSTGRES_PASSWORD=myworkout-local-test postgres:17-alpine
npm run test:db
docker stop myworkout-db-test
```

`MW_TEST_DATABASE_URL` permet de choisir une autre instance de test. Le test couvre les dix activations concurrentes, expiration/révocation, limitation des tentatives, RLS, mutations idempotentes, conflits, votes, modération et anonymisation par suppression. Il utilise un schéma `auth` minimal ; `test:cloud` complète cette preuve avec les vrais services Supabase, e-mails et fonction Edge locaux.

## Distribution et limites vérifiables

- `npm run build:web` produit `dist/` et un service worker pour rouvrir le web hors ligne après son premier chargement complet. Héberger à la racine en HTTPS avec repli des routes vers `index.html`. Le cache ne contient que les fichiers de l’application ; les données privées restent dans IndexedDB.
- `eas.json` prépare un APK interne. Les comptes Expo/stores, signatures, tests Android réels et tests iPhone sont requis avant distribution ; les exports JavaScript ne sont pas des APK/IPA ni des essais sur appareil.
- Le repos web fonctionne dans la page. Les notifications mobiles nécessitent l’autorisation système et un build compatible ; elles restent à vérifier écran verrouillé et après redémarrage.
- La publication communautaire est calculée côté serveur lors des consultations/votes ; activer la tâche périodique du guide pour une publication même sans visite.
- Les dépendances Expo/Jest comportent des alertes npm indirectes de sévérité faible/modérée ; ne pas appliquer `npm audit fix --force`, qui propose une régression majeure d’Expo. Réévaluer avant distribution.

Voir [le glossaire](CONTEXT.md) et les [décisions d’architecture](docs/adr/).
