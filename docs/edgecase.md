# Cas limites et parades — ResaVroom

> Un cas par entrée, numéroté à vie (jamais renuméroté). État du code concerné :
> [`architecture/mise-en-production.md`](architecture/mise-en-production.md) §8. Relevé initial du 2026-10-26,
> mis à jour aux étapes 1 et 2a (2026-10-28) : chaque cas dit si une parade est écrite.

### Edge Case 1 : Inscription d'un passager sans aucun contrôle de capacité ni d'identité
- **Contexte :** `POST /api/trips/[id]/passengers`, par n'importe quel utilisateur connecté.
- **Problème :** `addPassenger` ne vérifie que le chevauchement du passager. Un trajet complet, passé, annulé, ou dont l'appelant est le conducteur est accepté. Avec `addedBy: "DRIVER"`, l'appelant n'a pas à être le conducteur et choisit l'identité du passager.
- **Solution actuelle :** corrigé à l'étape 1 (D3). `addPassenger` applique `canJoinAsPassenger` (statut, départ futur, conducteur exclu, places) et réserve `addedBy: "DRIVER"` au conducteur ou à un admin, dans une transaction `Serializable` ; `createTrip` limite les passagers aux places et refuse le conducteur parmi eux. Tests : `tests/trip-service.test.ts`.
- **Risque accepté :** non.

### Edge Case 2 : Retrait de passager plus large que la règle écrite
- **Contexte :** `removePassenger`.
- **Problème :** le commentaire prévoit « le conducteur retire ses passagers `DRIVER` », le code laisse le conducteur retirer tout passager, y compris `SELF`. `canLeaveTrip` (retrait impossible après le départ) n'est jamais appelée.
- **Solution actuelle :** corrigé à l'étape 1 (D3), selon le SAD et le cahier des charges : admin toujours ; sinon le passager lui-même ou le conducteur pour un passager qu'il a ajouté, avant le départ. Tests : `tests/trip-service.test.ts`.
- **Risque accepté :** non.

### Edge Case 3 : Décalage d'horaire sans contrôle de conflit
- **Contexte :** `PATCH /api/trips/[id]` par le conducteur ou par un admin ne changeant que les horaires.
- **Problème :** `updateDepartureTime` décale les quatre dates du même delta sans vérifier les chevauchements de véhicule, de conducteur ni de passagers, ni le buffer. Deux trajets peuvent occuper le même véhicule.
- **Solution actuelle :** corrigé à l'étape 1 (D3) : transaction `Serializable` qui revérifie véhicule, conducteur et chaque passager sur le nouveau créneau, buffer compris, trajet exclu. Tests : `tests/trip-service.test.ts`.
- **Risque accepté :** non.

### Edge Case 4 : Liste blanche de services jamais appliquée
- **Contexte :** connexion d'un utilisateur.
- **Problème :** la table `authorized_services` est éditable dans l'admin mais aucun code ne la lit pour accepter ou refuser une connexion, contrairement à ce que disait l'ancien README.
- **Solution actuelle :** corrigé à l'étape 2a (G9, G14, D17) : la table `authorized_services`, ses routes et son écran sont supprimés. Seul le portail décide qui entre : ResaVroom y est déclarée **restreinte**, et une personne hors de sa grille voit le refus du portail, sans que ResaVroom reçoive rien (contrat portail v1 §3.6). Vérifié lors de l'essai réel du 2026-10-28 (refus avant l'attribution du rôle et après son retrait).
- **Risque accepté :** non.

### Edge Case 5 : Fournisseur de connexion de développement
- **Contexte :** `src/lib/auth.ts`.
- **Problème :** trois comptes et un mot de passe commun sont codés en dur ; l'administrateur a l'identifiant `TO_BE_CONFIGURED`. Déployé tel quel, n'importe qui connaissant le dépôt peut se connecter en administrateur.
- **Solution actuelle :** corrigé à l'étape 2a (G9) : le fournisseur de développement, ses comptes, son mot de passe et l'administrateur `TO_BE_CONFIGURED` (code, seed et base) sont retirés. Le seul fournisseur est `portail` (OIDC, PKCE, `state`, `nonce`, client confidentiel) ; le rôle vient du portail et est relu en base. Tests : `tests/auth.test.ts` (un seul fournisseur, ses réglages). Reste simulée jusqu'à l'étape 2b : la recherche de collègues (`/api/users/search`), qui ne donne aucun droit.
- **Risque accepté :** non.

### Edge Case 6 : Corps de requêtes non validés, aucune limitation de débit
- **Contexte :** toutes les routes `POST`/`PATCH`.
- **Problème :** les champs sont lus directement de `request.json()` ; `updateTripInfo` reçoit le corps brut ; `PATCH /api/admin/settings` accepte n'importe quelle clé ; une date invalide donne `Invalid Date` et une erreur 500.
- **Solution actuelle :** corrigé en partie à l'étape 1 : schémas zod (`src/lib/validators/request-schemas.ts`) sur les routes de trajets, passagers, véhicules et paramètres ; corps invalide → 400. `admins` et `services` ne sont pas validés (ils disparaissent en 2a). Reste : aucune limitation de débit. Tests : `tests/request-schemas.test.ts`, `tests/routes-validation.test.ts`.
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
- **Solution actuelle :** corrigé à l'étape 1 : les deux traces sont retirées. Les autres `console.error` restants journalisent des erreurs, sans identifiant d'utilisateur.
- **Risque accepté :** non.

### Edge Case 10 : Doublon d'administrateur ou de service renvoyé en 500
- **Contexte :** `POST /api/admin/admins`, `POST /api/admin/services` ; aussi `POST`/`PATCH /api/admin/vehicles` avec une plaque déjà prise (relevé à l'étape 1).
- **Problème :** la violation d'unicité Prisma n'est pas une `BusinessError` ; `handleBusinessError` la renvoie en 500 `INTERNAL_ERROR` sans message utile.
- **Solution actuelle :** aucune. `admins` et `services` ont disparu à l'étape 2a (routes et tables supprimées) ; reste le cas des plaques.
- **Risque accepté :** à décider (impact limité : action d'administrateur seulement).

### Edge Case 11 : Création d'un trajet avec passagers impossible depuis l'interface
- **Contexte :** assistant de création (`StepConfirm`), `POST /api/trips`. Relevé à l'étape 1 (2026-10-28).
- **Problème :** les passagers se saisissent en texte libre (nom et e-mail) et partent sans identifiant (`userSub` depuis l'étape 2a, `userEntraId` avant), que la base exige. Avant l'étape 1, la création échouait en 500 ; depuis, elle est refusée en 400 avec le message « passengers.0.userSub ». La recherche (`UserSearchAutocomplete`) ne sert qu'au choix du conducteur par un admin.
- **Solution actuelle :** aucune. Parade prévue à l'étape 2b : choisir les passagers dans l'annuaire du portail (`sub`, nom, adresse), comme le conducteur. (Depuis l'étape 2a, le champ s'appelle `userSub`.)
- **Risque accepté :** non (défaut fonctionnel, pas de faille).

### Edge Case 12 : Adresse déjà portée par une autre personne
- **Contexte :** connexion par le portail, rappel `signIn` (`reconcilePerson`). Relevé à l'étape 2a (2026-10-28).
- **Problème :** le contrat portail v1 (§3.2) demande de refuser une adresse liée à un autre `sub` (signe d'une adresse réattribuée). Le même refus vaut quand le super-admin change l'adresse d'une personne pour une adresse que `people` attribue encore à quelqu'un d'autre (qui ne s'est pas reconnecté depuis son propre changement). La personne refusée ne peut plus entrer, et ResaVroom n'a aucun écran pour lever le conflit.
- **Solution actuelle :** refus vers `/unauthorized`, consigné dans l'audit (`SIGNIN_REFUSED`, raison `EMAIL_BOUND_TO_OTHER_SUB`, id de la personne qui porte l'adresse). Le conflit se lève quand l'autre personne se reconnecte (son adresse est alors mise à jour) ou par une correction en base, sur accord du propriétaire. Tests : `tests/auth.test.ts`.
- **Risque accepté :** à décider (situation rare : changement d'adresse par le super-admin).

### Edge Case 13 : Rôle et session après un retrait d'accès
- **Contexte :** le super-admin retire l'accès ou le rôle `ADMIN` d'une personne dans le portail. Relevé à l'étape 2a (2026-10-28).
- **Problème :** le retrait prend effet à la connexion suivante (G15). Une session ResaVroom déjà ouverte reste valable jusqu'à son terme, 8 h au plus après la connexion ; et `people.role`, relu par les gardes, garde la valeur de la dernière connexion tant que la personne ne se reconnecte pas.
- **Solution actuelle :** voulu par le contrat portail v1 (§3.1, §3.2) : sessions de 8 h fixes depuis la connexion, jamais prolongées (`tests/auth.test.ts`, `tests/proxy.test.ts`) ; la connexion suivante est refusée par le portail, ou recopie le nouveau rôle. Vérifié lors de l'essai réel du 2026-10-28.
- **Risque accepté :** oui, par décision du portail (G15, portail G6), et non par ResaVroom.
