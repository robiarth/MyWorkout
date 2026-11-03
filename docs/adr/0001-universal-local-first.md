# Application universelle et stockage local avant synchronisation

Une application Expo / React Native partage les parcours Android, iOS et web afin d’éviter trois implémentations divergentes des règles de progression. Les saisies sont enregistrées dans SQLite sur mobile et IndexedDB sur web avant confirmation ; le serveur ne conditionne pas la poursuite d’une séance déjà téléchargée. Cela demande deux adaptateurs locaux et une gestion explicite des conflits, mais garde les performances disponibles sans réseau.
