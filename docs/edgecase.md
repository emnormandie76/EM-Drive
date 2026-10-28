# Cas limites et parades — ResaVroom

> Un cas par entrée, numéroté à vie (jamais renuméroté). État du code concerné :
> [`architecture/mise-en-production.md`](architecture/mise-en-production.md) §8. Relevé initial du 2026-10-26 :
> ces cas décrivent le code tel qu'il est, aucune parade n'est encore écrite sauf mention contraire.

### Edge Case 1 : Inscription d'un passager sans aucun contrôle de capacité ni d'identité
- **Contexte :** `POST /api/trips/[id]/passengers`, par n'importe quel utilisateur connecté.
- **Problème :** `addPassenger` ne vérifie que le chevauchement du passager. Un trajet complet, passé, annulé, ou dont l'appelant est le conducteur est accepté. Avec `addedBy: "DRIVER"`, l'appelant n'a pas à être le conducteur et choisit l'identité du passager.
- **Solution actuelle :** aucune côté serveur. `canJoinAsPassenger` n'est utilisée que pour masquer le bouton.
- **Risque accepté :** non.

### Edge Case 2 : Retrait de passager plus large que la règle écrite
- **Contexte :** `removePassenger`.
- **Problème :** le commentaire prévoit « le conducteur retire ses passagers `DRIVER` », le code laisse le conducteur retirer tout passager, y compris `SELF`. `canLeaveTrip` (retrait impossible après le départ) n'est jamais appelée.
- **Solution actuelle :** aucune.
- **Risque accepté :** non.

### Edge Case 3 : Décalage d'horaire sans contrôle de conflit
- **Contexte :** `PATCH /api/trips/[id]` par le conducteur ou par un admin ne changeant que les horaires.
- **Problème :** `updateDepartureTime` décale les quatre dates du même delta sans vérifier les chevauchements de véhicule, de conducteur ni de passagers, ni le buffer. Deux trajets peuvent occuper le même véhicule.
- **Solution actuelle :** aucune (seul `updateTripInfo`, réservé à l'admin, contrôle véhicule et conducteur).
- **Risque accepté :** non.

### Edge Case 4 : Liste blanche de services jamais appliquée
- **Contexte :** connexion d'un utilisateur.
- **Problème :** la table `authorized_services` est éditable dans l'admin mais aucun code ne la lit pour accepter ou refuser une connexion, contrairement à ce que dit le README.
- **Solution actuelle :** aucune. Dépend de la méthode d'authentification (D1).
- **Risque accepté :** non.

### Edge Case 5 : Fournisseur de connexion de développement
- **Contexte :** `src/lib/auth.ts`.
- **Problème :** trois comptes et un mot de passe commun sont codés en dur ; l'administrateur a l'identifiant `TO_BE_CONFIGURED`. Déployé tel quel, n'importe qui connaissant le dépôt peut se connecter en administrateur.
- **Solution actuelle :** aucune ; marqué « à supprimer avant la production » dans le code.
- **Risque accepté :** non. Bloquant pour toute mise en ligne (D1).

### Edge Case 6 : Corps de requêtes non validés, aucune limitation de débit
- **Contexte :** toutes les routes `POST`/`PATCH`.
- **Problème :** les champs sont lus directement de `request.json()` ; `updateTripInfo` reçoit le corps brut ; `PATCH /api/admin/settings` accepte n'importe quelle clé ; une date invalide donne `Invalid Date` et une erreur 500.
- **Solution actuelle :** contrôle ponctuel de champs requis.
- **Risque accepté :** non.

### Edge Case 7 : Tous les trajets, avec e-mails, visibles de tout utilisateur connecté
- **Contexte :** `GET /api/trips`, `GET /api/trips/[id]`.
- **Problème :** les e-mails des conducteurs et des passagers sont renvoyés à tout utilisateur authentifié.
- **Solution actuelle :** aucune. Peut être voulu par le métier (covoiturage) : à confirmer par le propriétaire.
- **Risque accepté :** à décider.

### Edge Case 8 : Nettoyage définitif de la base depuis l'interface
- **Contexte :** `/admin/settings`, action serveur `cleanupDatabase`.
- **Problème :** supprime sans retour possible tous les trajets (et leurs passagers en cascade) ou journaux de plus d'un mois, selon un filtre de statut. Seule garde en plus du rôle admin : `window.confirm`.
- **Solution actuelle :** garde admin (`verifyAdmin`).
- **Risque accepté :** non formalisé.

### Edge Case 9 : Identifiants écrits dans les journaux serveur
- **Contexte :** `removePassenger` et `DELETE /api/trips/[id]/passengers/[passengerId]`.
- **Problème :** `console.error("403 Debug", …)` et `console.log("DELETE route hit", …)` écrivent des identifiants d'utilisateurs et de trajets ; ce sont des traces de débogage.
- **Solution actuelle :** aucune.
- **Risque accepté :** non.

### Edge Case 10 : Doublon d'administrateur ou de service renvoyé en 500
- **Contexte :** `POST /api/admin/admins`, `POST /api/admin/services`.
- **Problème :** la violation d'unicité Prisma n'est pas une `BusinessError` ; `handleBusinessError` la renvoie en 500 `INTERNAL_ERROR` sans message utile.
- **Solution actuelle :** aucune.
- **Risque accepté :** à décider (impact limité : action d'administrateur seulement).
