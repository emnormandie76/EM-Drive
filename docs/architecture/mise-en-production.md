# ResaVroom — état du code

> Ce que fait le code de la branche `dev-claude` (créée depuis `jules`). Chaque étape du plan
> [`features/mise-en-production.md`](../features/mise-en-production.md) tient ce document à jour ; les
> décisions citées (G1…, D1…) et les pièges (§4) y sont expliqués. Les spécifications d'origine sont dans
> [`SAD.md`](../SAD.md) et [`Cahier des charge.md`](../Cahier%20des%20charge.md).

---

## 1. Ce que c'est

**ResaVroom** est une application web interne de réservation de véhicules et de covoiturage entre trois
campus (Le Havre, Caen, Paris). Un utilisateur crée un trajet (aller simple, aller-retour inter-campus, ou
aller-retour vers une destination « autre »), choisit un véhicule libre, et d'autres utilisateurs peuvent
s'inscrire comme passagers. Un administrateur gère la flotte, les trajets, les paramètres et lit un journal
d'audit. Les accès et les rôles se gèrent dans le **portail admission**, par lequel on se connecte (§2).

- **Pile** : Next.js 16.2.3 (App Router, Turbopack), React 19, TypeScript strict, Prisma 7.7 avec
  l'adaptateur Neon (WebSocket, port 443), NextAuth v4 (JWT, fournisseur OIDC), SWR, date-fns, Sonner, Lucide.
- **Base** : PostgreSQL hébergée chez Neon. Une seule base est configurée par `DATABASE_URL` (voir mémo
  d'exploitation, [`memory/memory-exploitation.md`](../memory/memory-exploitation.md)).
- **Connexion** : par le portail admission, fournisseur d'identité OIDC (G9), selon le **contrat portail v1**
  (`../portail/docs/architecture/contrat-apps.md`, lecture seule), branchée à l'étape 2a avec le seul client
  `dev` (`http://localhost:3002`).
- **Recherche de collègues** : par l'annuaire du portail (contrat portail v1 §7), depuis l'étape 2b (§2.1).
- **Ne fait pas partie du code actuel** : connexion Microsoft Entra ID (abandonnée, G8), envoi de mails
  (jamais écrit), intégration continue. Les tests automatisés existent depuis l'étape 1 (§7).

---

## 2. Authentification et accès

### 2.1. Connexion par le portail (contrat portail v1)

**Contrat appliqué : contrat portail v1** (`../portail/docs/architecture/contrat-apps.md`, v1 précisée le
2026-10-28), branché à l'étape 2a (G9, D8 à D14, D17 à D23). ResaVroom est déclarée au portail : `resavroom`,
restreinte, rôles `USER` et `ADMIN`, client `dev` seul (mémo §3).

[src/lib/auth.ts](../../src/lib/auth.ts) déclare un seul fournisseur NextAuth, **`portail`**, de type `oauth` :

| Point du contrat | Réglage |
|---|---|
| Découverte (§3.3) | `wellKnown` = `PORTAIL_ISSUER` + `/.well-known/openid-configuration` ([src/lib/portail.ts](../../src/lib/portail.ts)) ; aucune route du portail écrite en dur |
| Flux | code d'autorisation, `checks: ["pkce", "state", "nonce"]` (PKCE S256), `idToken: true` (NextAuth vérifie `iss`, `aud`, `exp`, `nonce` par `openid-client`) |
| Client | `PORTAIL_CLIENT_ID`, `PORTAIL_CLIENT_SECRET`, `token_endpoint_auth_method: "client_secret_basic"` |
| Scopes | `openid profile email`, sans `offline_access` |
| Retour | `http://localhost:3002/api/auth/callback/portail` (adresse exacte déclarée, D12) |
| Profil (§3.4) | `profile()` lit `sub` (→ `id`), `email`, `name`, `role` ; `email_verified` est ignoré |

Les rappels de NextAuth (D22) :

- **`signIn`** appelle `reconcilePerson` ([person-service.ts](../../src/lib/services/person-service.ts)), qui
  retrouve le compte local (contrat §3.2) **par `sub`**, sinon **par l'adresse** (puis enregistre le `sub`),
  sinon le **crée**, et recopie adresse, nom, rôle et heure de connexion dans la table `people` (§5). Refus,
  renvoyés vers `/unauthorized` et consignés dans l'audit (`SIGNIN_REFUSED`, entité `person`) : adresse déjà
  liée à un autre `sub` (adresse réattribuée, ou nouvelle adresse déjà portée par une autre personne), rôle
  autre que `USER` ou `ADMIN` (D20). Un profil sans `sub` ou sans adresse est refusé sans audit.
- **`jwt`** : à la connexion, pose `sub`, `role` (affichage seulement), `signedInAt` (heure de connexion, en
  secondes) et `idToken` ; ne lit pas la base. À chaque lecture, **lève une erreur 8 h après `signedInAt`** :
  NextAuth repousse sinon l'expiration à chaque lecture (piège 11), alors que le contrat veut 8 h fixes.
  L'erreur efface la session (route `/api/auth/session`) ou la rend nulle (`getServerSession`).
- **`session`** : expose `sub`, `email`, `name`, `isAdmin` (affichage) et une expiration à `signedInAt` + 8 h ;
  jamais l'`id_token`.

**Session** : JWT, `maxAge` 8 h ([src/lib/auth-session.ts](../../src/lib/auth-session.ts)), plus le refus
ci-dessus. **Cookies renommés** (D12) : `resavroom.session-token`, `resavroom.csrf-token`,
`resavroom.callback-url`, `resavroom.state`, `resavroom.pkce.code_verifier`, `resavroom.nonce` ; en https,
préfixes `__Secure-` (et `__Host-` pour le jeton CSRF), selon `NEXTAUTH_URL`. Le proxy et la déconnexion lisent
le même nom par `sessionCookieName()`.

**Pages** : `/login` ([page.tsx](../../src/app/%28auth%29/login/page.tsx)) montre un bouton « Se connecter avec
le portail » (`signIn("portail")`) ; avec `?error=…` (`pages.error`), un message neutre et un lien vers le
portail, **sans relancer le flux**. `/unauthorized` dit que ResaVroom ne peut pas ouvrir de session avec ce
compte, avec un lien vers le portail. Un refus d'accès (personne hors de la grille) s'affiche sur le portail :
ResaVroom ne reçoit rien (contrat §3.6).

**Déconnexion** (contrat §3.8, D23) : la barre de navigation envoie un formulaire `POST /api/auth/logout`
([route.ts](../../src/app/api/auth/logout/route.ts)). La route lit l'`id_token` dans le cookie chiffré, efface
tous les morceaux du cookie de session, puis renvoie (303) vers `end_session_endpoint`, lu dans la découverte
et vérifié sur l'origine de l'émetteur, avec `id_token_hint`, `client_id` et `post_logout_redirect_uri`
(`NEXTAUTH_URL` + `/login`). Sans session, ou si le portail ne répond pas (5 s), elle renvoie vers `/login`.

**Identité** : partout, la personne est désignée par son **`sub`** du portail, recopié avec l'adresse et le nom
dans les trajets, passagers et journaux (`driverSub`, `userSub` ; piège 6). L'appelant vient de sa session ;
**une autre personne vient de l'annuaire**, jamais du corps de la requête (ci-dessous, D24).

### 2.1 bis. Recherche par l'annuaire du portail (contrat portail v1 §7)

**Contrat appliqué : contrat portail v1 §7**, branché à l'étape 2b (D24 à D28).
[src/lib/portail-directory.ts](../../src/lib/portail-directory.ts) est le seul module qui parle à l'annuaire ;
il lit `PORTAIL_CLIENT_SECRET` et commence par `import "server-only"` : une importation depuis un composant
client casse le build (D28 ; Next résout ce module sans paquet).

| Point du contrat | Réglage |
|---|---|
| Jeton | `POST` sur `token_endpoint`, lu dans la découverte (`portalDiscoveryUrl()`) et refusé hors de l'origine de l'émetteur ; corps `grant_type=client_credentials&scope=directory` en `application/x-www-form-urlencoded` ; `client_secret_basic` : `Authorization: Basic base64(id:secret)`, l'identifiant et le secret d'abord encodés en x-www-form-urlencoded (RFC 6749 §2.3.1) |
| Durée du jeton | gardé en mémoire du serveur jusqu'à `expires_in` (une heure) moins une minute ; une demande en cours est partagée entre les recherches simultanées ; sans durée lisible, il ne sert qu'une fois |
| Requête | `GET <origine de PORTAIL_ISSUER>/api/directory?q=…` avec `Authorization: Bearer` ; `q` de moins de deux caractères (après `trim`) → aucune requête, liste vide |
| 401 de l'annuaire | jeton jeté, un nouveau demandé, **un seul** nouvel essai ; un second 401 → indisponible |
| Annuaire fermé | 400 `unauthorized_client` à la demande de jeton → indisponible |
| Erreurs (D25) | `DirectoryUnavailableError` (503 `DIRECTORY_UNAVAILABLE` : fermé, 401 répété, panne, délai de 5 s par appel, réponse d'une autre forme) ; `DirectoryRateLimitedError` (429 `DIRECTORY_RATE_LIMITED`) |
| Réponse gardée (D26) | `{ sub, name, email }` : le rôle est écarté ; un nom vide est remplacé par l'adresse |
| Journal | une ligne `[ANNUAIRE]` avec le seul motif (code d'état, nom de l'erreur) : jamais le jeton, le secret, un nom ni une adresse (le message d'une erreur d'analyse JSON, qui cite le corps, n'est pas écrit) |

**Recherche** : `GET /api/users/search?q=…` (connecté) rend `searchDirectory(q)`, soit `[{ sub, name, email }]`
des personnes qui ont accès à ResaVroom, ou l'erreur ci-dessus en `{ error, message }`.

**Identité d'une autre personne** (écart 5 du relevé P-01, D24) : `resolveChosenPerson({ sub, email }, appelant)`
rend l'appelant lui-même (sa session) sans appel ; sinon exige l'adresse (400 `VALIDATION_ERROR`), cherche
l'annuaire avec `q` = l'adresse (il ne cherche pas par `sub`), garde l'entrée au `sub` identique et rend **son nom
et son adresse** ; absente : 400 `PERSON_NOT_IN_DIRECTORY`. Elle sert au conducteur choisi par un admin
(`POST /api/trips`, et `PATCH /api/trips/[id]` quand le conducteur change : un conducteur inchangé garde ses
valeurs en base, sans appel), aux passagers de `POST /api/trips` et au passager ajouté par le conducteur
(`POST /api/trips/[id]/passengers`, `addedBy=DRIVER`). Les écrans n'envoient que le `sub` et l'adresse ; un nom
envoyé est ignoré. Sans annuaire, ces écritures répondent 503 ; créer un trajet pour soi, sans passager, n'en
dépend pas.

**Retrait d'accès** (G15) : il prend effet à la connexion suivante, que le portail refuse ; une session
ResaVroom déjà ouverte va à son terme (8 h au plus), et le rôle en base reste celui de la dernière connexion.

### 2.2. Rôles

Deux rôles, déclarés au portail (D8) et recopiés à chaque connexion dans `people.role` :

| Rôle | Peut | Ne peut pas |
|---|---|---|
| **`USER`** (« Utilisateur ») | consulter flotte, trajets et calendriers ; créer un trajet à son nom ; s'inscrire comme passager ; annuler ou décaler son propre trajet (règles §2.4) ; se retirer d'un trajet | accéder à `/admin` et aux routes `/api/admin/*` ; modifier un trajet autre que l'heure de départ |
| **`ADMIN`** (« Administrateur ») | tout ce qui précède sur tous les trajets ; créer un trajet pour un autre conducteur ; modifier librement un trajet (véhicule, conducteur, destination, statut, horaires) ; gérer véhicules et paramètres ; lire le journal d'audit ; nettoyer la base (§8) | gérer les accès et les rôles (le portail seul, G11, G12) |

Le rôle est **relu en base à chaque requête gardée** (`isAdmin(sub)` dans
[src/lib/auth.ts](../../src/lib/auth.ts) lit `people.role`) ; le drapeau `isAdmin` de la session ne sert qu'à
l'affichage de la barre de navigation ([Navbar.tsx](../../src/components/layout/Navbar.tsx)).

### 2.3. Gardes

| Niveau | Fichier | Effet |
|---|---|---|
| Redirection des pages sans session | [src/proxy.ts](../../src/proxy.ts) | `withAuth` de NextAuth, avec le cookie `resavroom.session-token` et un rappel `authorized` qui refuse un jeton de plus de 8 h (`signedInAt`) : redirige vers `/login` ; couvre toutes les pages sauf `login`, `unauthorized`, `_next/static`, `_next/image`, `favicon.ico` ; **exclut `/api`**, dont les routes répondent 401 elles-mêmes. Vérification optimiste seulement. Jusqu'à l'étape 1, `middleware.ts` était à la racine et Next l'ignorait (piège 3, D4) |
| Garde API « connecté » | `requireAuthSession()` dans [src/lib/api-helpers.ts](../../src/lib/api-helpers.ts) | 401 `UNAUTHORIZED` |
| Garde API « administrateur » | `requireAdminSession()` dans le même fichier | 401 puis 403 `FORBIDDEN` |
| Garde de pages admin | [src/app/admin/layout.tsx](../../src/app/admin/layout.tsx) | redirige vers `/login` ou `/dashboard` |
| Garde d'actions serveur | `verifyAdmin()` dans [src/app/admin/settings/actions.ts](../../src/app/admin/settings/actions.ts) | lève une erreur |
| Règles métier de permission | [src/lib/validators/permission-checker.ts](../../src/lib/validators/permission-checker.ts) | voir §2.4 |

### 2.4. Règles de permission sur les trajets

| Règle | Fonction | Appelée par |
|---|---|---|
| Supprimer (annuler) : admin toujours ; sinon conducteur seulement, et seulement s'il n'y a aucun passager `SELF` | `canDeleteTrip` | `cancelTrip` ([trip-service.ts](../../src/lib/services/trip-service.ts)) |
| Décaler le départ : admin toujours ; sinon conducteur ; s'il y a des passagers `SELF`, au moins 48 h avant le départ (`MIN_HOURS_BEFORE_MODIFICATION`) | `canModifyDepartureTime` | `updateDepartureTime` |
| Rejoindre : trajet `SCHEDULED`, futur, passager ≠ conducteur, places libres (`seats - 1`) | `canJoinAsPassenger` | `addPassenger` (à l'écriture, pour tous, admin compris) et [GET /api/trips/[id]](../../src/app/api/trips/[id]/route.ts) (bouton) |
| Ajouter un passager « par le conducteur » (`addedBy: DRIVER`) : conducteur du trajet ou admin | dans `addPassenger` | `POST /api/trips/[id]/passengers` |
| Désigner une autre personne (conducteur choisi par un admin, passagers à la création, passager ajouté par le conducteur) : son identité vient de l'annuaire, jamais du corps (D24, §2.1 bis) | `resolveChosenPerson` | `POST /api/trips`, `PATCH /api/trips/[id]`, `POST /api/trips/[id]/passengers` |
| Passagers à la création : ni le conducteur, ni deux fois la même personne, dans la limite des places | dans `createTrip` | `POST /api/trips` |
| Changer de conducteur (admin) : pas pour un passager du trajet | dans `updateTripInfo` | `PATCH /api/trips/[id]` |
| Retirer un passager : admin toujours ; sinon le passager lui-même, ou le conducteur pour un passager qu'il a ajouté (`DRIVER`), et seulement avant le départ (SAD, cahier des charges) | `canLeaveTrip` + règle dans `removePassenger` | `DELETE /api/trips/[id]/passengers/[passengerId]` |

---

## 3. Écrans

| Chemin | Accès | Fichier | Remarque |
|---|---|---|---|
| `/` | connecté | [src/app/page.tsx](../../src/app/page.tsx) | redirige vers `/dashboard` |
| `/login` | public | [src/app/(auth)/login/page.tsx](../../src/app/%28auth%29/login/page.tsx) | bouton « Se connecter avec le portail » ([PortalSignInButton.tsx](../../src/app/%28auth%29/login/PortalSignInButton.tsx)) ; avec `?error=…`, message neutre et lien vers le portail, sans relancer le flux (§2.1) |
| `/unauthorized` | public | [src/app/(auth)/unauthorized/page.tsx](../../src/app/%28auth%29/unauthorized/page.tsx) | « Connexion refusée » : cible du rappel `signIn` quand le compte ne peut pas être rattaché (§2.1) ; lien vers le portail |
| `/dashboard` | connecté | [src/app/dashboard/page.tsx](../../src/app/dashboard/page.tsx) | flotte (position, statut), prochains trajets ; polling SWR 30 s |
| `/trips` | connecté | [src/app/trips/page.tsx](../../src/app/trips/page.tsx) | liste filtrable |
| `/trips/new` | connecté | [src/app/trips/new/page.tsx](../../src/app/trips/new/page.tsx) | assistant `TripWizard` : recherche (`StepSearch`) puis confirmation (`StepConfirm`) ; dans `StepConfirm`, passagers choisis dans l'annuaire (le conducteur et les passagers déjà choisis ne sont pas proposés ; un passager choisi ensuite comme conducteur sort de la liste, D27) et, pour un admin, conducteur choisi dans l'annuaire |
| `/trips/[id]` | connecté | [src/app/trips/[id]/page.tsx](../../src/app/trips/[id]/page.tsx) | détail, frise, passagers, actions selon `permissions` |
| `/vehicles/[id]/calendar` | connecté | [src/app/vehicles/[id]/calendar/page.tsx](../../src/app/vehicles/[id]/calendar/page.tsx) | calendrier hebdomadaire et mensuel |
| `/admin` | admin | [src/app/admin/page.tsx](../../src/app/admin/page.tsx) | compteurs lus directement via Prisma (composant serveur) : véhicules, en maintenance, trajets à venir |
| `/admin/vehicles` | admin | [src/app/admin/vehicles/page.tsx](../../src/app/admin/vehicles/page.tsx) | ajout, modification, maintenance |
| `/admin/trips` | admin | [src/app/admin/trips/page.tsx](../../src/app/admin/trips/page.tsx) | liste paginée, filtres, modale `AdminEditTripModal` (conducteur choisi dans l'annuaire, passagers du trajet non proposés) |
| `/admin/settings` | admin | [src/app/admin/settings/page.tsx](../../src/app/admin/settings/page.tsx) | `buffer_minutes` ; `DatabaseControls` (métriques Neon, nettoyage) |
| `/admin/audit` | admin | [src/app/admin/audit/page.tsx](../../src/app/admin/audit/page.tsx) | journal paginé, filtres |

`/admin/users` (administrateurs et services) et son entrée de menu sont retirés à l'étape 2a : les accès se
gèrent dans le portail.

Composants : `src/components/ui/` (Badge, Button, Card, Input, Select, Modal, `CustomCalendarPicker`,
`UserSearchAutocomplete`), `layout/Navbar` (déconnexion par formulaire `POST /api/auth/logout`), `dashboard/*`,
`trips/*`, `vehicles/VehicleCalendar`, `admin/*`.
[`UserSearchAutocomplete`](../../src/components/ui/UserSearchAutocomplete.tsx) interroge `/api/users/search`
(300 ms après la frappe, deux caractères au moins, SWR sans nouvel essai ni relecture au retour sur l'onglet),
rend `{ sub, name, email }`, écarte les `sub` de `excludeSubs`, se vide après un choix avec `clearOnSelect`, et
affiche le message d'une erreur (annuaire indisponible, trop de recherches) à la place de « Aucun utilisateur
trouvé ».
Hooks SWR : [src/hooks/](../../src/hooks/) (`use-vehicles`, `use-trips`, `use-geo`).

---

## 4. Routes API

Toutes les réponses d'erreur ont la forme `{ error: CODE, message }`. Les erreurs métier
([src/lib/utils/errors.ts](../../src/lib/utils/errors.ts)) sont converties par `handleBusinessError` : conflits en
**409** (`VEHICLE_CONFLICT`, `DRIVER_OVERLAP`, `PASSENGER_OVERLAP`, avec `conflictingTripId`), `PERMISSION_DENIED`
en **403**, `VALIDATION_ERROR` et `PERSON_NOT_IN_DIRECTORY` en **400**, `DIRECTORY_RATE_LIMITED` en **429**,
`DIRECTORY_UNAVAILABLE` en **503** (§2.1 bis) ; toute autre erreur donne **500** `INTERNAL_ERROR`.

**Corps validés** (étape 1, cas limite 6) : les routes d'écriture qui survivront à l'étape 2a lisent leur corps
par `parseJsonBody` et un schéma zod de [request-schemas.ts](../../src/lib/validators/request-schemas.ts) (trajets,
passagers, véhicules, paramètres). JSON mal formé, champ manquant ou invalide, date nulle ou incohérente :
**400** `VALIDATION_ERROR`, avec le champ fautif dans le message (en français). Les champs inconnus sont ignorés.

**Table de référence** : la colonne « Garde » ci-dessous est [tests/helpers/access-policy.ts](../../tests/helpers/access-policy.ts),
vérifiée contre le code par [tests/access-policy.test.ts](../../tests/access-policy.test.ts) (toute route ou
méthode ajoutée sans y figurer fait échouer `npm test`).

| Route | Méthodes | Garde | Remarque |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | public | NextAuth : fournisseur `portail`, retour `/api/auth/callback/portail` (§2.1) |
| `/api/auth/logout` | POST | public | déconnexion par le portail (§2.1, D23) : efface la session, 303 vers `end_session_endpoint` ou `/login` |
| `/api/campuses` | GET | connecté | |
| `/api/vehicles` | GET | connecté | véhicules avec position et statut d'affichage |
| `/api/vehicles/[id]` | GET | connecté | |
| `/api/vehicles/availability` | GET | connecté | véhicules libres + covoiturages suggérés |
| `/api/trips` | GET | connecté | tous les trajets non annulés, quel que soit l'appelant |
| `/api/trips` | POST | connecté | l'admin peut choisir le conducteur (`driverSub`, `driverEmail`) ; passagers `{ userSub, userEmail }` ; nom et adresse de chacun lus dans l'annuaire (D24, écart 5 corrigé) ; passagers limités aux places, sans le conducteur ni doublon |
| `/api/trips/[id]` | GET | connecté | ajoute `permissions` calculées pour l'appelant |
| `/api/trips/[id]` | PATCH | connecté | non-admin ou corps limité aux horaires/statut : `updateDepartureTime` (`departureTime` requis) ; admin avec d'autres champs : `updateTripInfo`, un nouveau conducteur étant lu dans l'annuaire (D24) et refusé s'il est passager |
| `/api/trips/[id]` | DELETE | connecté + `canDeleteTrip` | annulation logique (`CANCELLED`) |
| `/api/trips/[id]/passengers` | POST | connecté + règles dans `addPassenger` | `addedBy` = `SELF` (soi-même) ou `DRIVER` (conducteur ou admin ; `userSub` et `userEmail`, passager lu dans l'annuaire, D24) ; `canJoinAsPassenger` appliquée |
| `/api/trips/[id]/passengers/[passengerId]` | DELETE | connecté + règles dans `removePassenger` | admin ; soi-même ou conducteur pour ses ajouts `DRIVER`, avant le départ |
| `/api/geo/autocomplete` | GET | connecté | proxy BAN (communes) |
| `/api/geo/directions` | GET | connecté | proxy ORS, repli à vol d'oiseau |
| `/api/users/search` | GET | connecté | annuaire du portail (contrat portail v1 §7, §2.1 bis) : `[{ sub, name, email }]` ; `[]` sous deux caractères ; 503 ou 429 si l'annuaire ne répond pas (D25) |
| `/api/admin/vehicles` | POST | admin | |
| `/api/admin/vehicles/[id]` | PATCH | admin | audit `VEHICLE_UPDATED` / `VEHICLE_MAINTENANCE_ON` / `_OFF` |
| `/api/admin/settings` | GET, PATCH | admin | audit `SETTINGS_UPDATED` ; seule la clé `buffer_minutes` est acceptée (entier de 0 à 1440) |
| `/api/admin/trips` | GET | admin | liste paginée (max 100) |
| `/api/admin/audit` | GET | admin | journal paginé |

Retirées à l'étape 2a : `/api/auth/check-admin` (route de débogage, D14), `/api/admin/admins`,
`/api/admin/admins/[id]`, `/api/admin/services`, `/api/admin/services/[id]` (tables supprimées, D10, D17).

Actions serveur ([actions.ts](../../src/app/admin/settings/actions.ts)) : `getNeonMetrics()` (lit l'API Neon avec
`NEON_PROJET_ID` et `NEON_API_KEY`) et `cleanupDatabase(cible, statut)` (suppression définitive des trajets ou des
journaux de plus d'un mois, admin seulement).

### 4.1. Algorithmes métier

| Sujet | Fichier | Règle |
|---|---|---|
| Position d'un véhicule | `getVehiclePosition` ([vehicle-service.ts](../../src/lib/services/vehicle-service.ts)) | dérivée du dernier trajet non annulé terminé : `ONE_WAY` → destination ; `ROUND_TRIP` → origine ; `ROUND_TRIP_OTHER` → campus de retour ; sans trajet → campus par défaut |
| Disponibilité | `getAvailableVehicles`, `findVehicleConflict` | véhicule `AVAILABLE`, positionné au campus de départ, sans trajet qui chevauche `[départ, fin + buffer]` |
| Fin d'un trajet | [dates.ts](../../src/lib/utils/dates.ts) | `estimatedReturnArrivalTime ?? estimatedArrivalTime` ; le buffer (`buffer_minutes`, 30 par défaut) s'ajoute pour les conflits |
| Statut d'affichage | `getTripDisplayStatus` | `cancelled`, `scheduled`, `in_progress`, `completed` dérivés du temps ; la base ne stocke que `SCHEDULED` et `CANCELLED` |
| Création | `createTrip` ([trip-service.ts](../../src/lib/services/trip-service.ts)) | transaction `Serializable` : passagers dans la limite des places, sans le conducteur ni doublon, conflit véhicule, conflit conducteur, conflit de chaque passager ; audit hors transaction. Les identités viennent de la route, déjà lues dans l'annuaire (D24) |
| Modification admin | `updateTripInfo` | refuse un nouveau conducteur qui est passager du trajet ; transaction `Serializable` : conflit véhicule et conducteur (trajet exclu) ; les passagers ne sont pas revérifiés |
| Décalage d'horaire | `updateDepartureTime` | décale les quatre dates du même delta ; transaction `Serializable` qui revérifie véhicule, conducteur et chaque passager sur le nouveau créneau, buffer compris, trajet exclu |
| Passagers | `addPassenger`, `removePassenger` | ajout : droit d'ajouter, `canJoinAsPassenger` et chevauchement du passager, lus et écrits dans une même transaction `Serializable` ; retrait : règles du §2.4 |
| Chevauchement | `findVehicleConflict`, `findPersonConflict` | trajet non annulé avec `departureTime < fin` et arrivée (aller ou retour selon le type) `> début` ; un trajet peut être exclu |
| Itinéraire | [geo-service.ts](../../src/lib/services/geo-service.ts) | BAN pour les communes ; ORS pour durée et distance ; repli Haversine × 1,3 à 70 km/h, minimum 10 min |

Constantes : [src/lib/utils/constants.ts](../../src/lib/utils/constants.ts) (`MAX_PASSENGERS` 4, `TOTAL_SEATS` 5,
48 h, 30 min, polling 30 s). La capacité réelle d'un trajet est `vehicle.seats - 1`.

---

## 5. Tables

Schéma : [prisma/schema.prisma](../../prisma/schema.prisma). Deux migrations, appliquées au projet Neon
`resavroom` le 2026-10-28 : `20260415124547_init` (étape 1, puis le seed) et
`20261028160000_portail_identity` (étape 2a, écrite à la main : table `people` et énumération `Role`, colonnes
`*_entra_id` renommées `*_sub` sans perte, `AuditAction` recréée, `admins` et `authorized_services` supprimées
avec l'accord du propriétaire, D17). Base et schéma vérifiés identiques après application
(`prisma migrate diff --from-config-datasource`). Client généré dans `src/generated/prisma/` (versionné ; ne
pas éditer).

| Table (modèle) | Contenu | Relations et contraintes |
|---|---|---|
| `campuses` (Campus) | nom unique, latitude, longitude | référencé par véhicules et trajets (origine, destination, retour) |
| `vehicles` (Vehicle) | nom, plaque unique, places (5 par défaut, conducteur inclus), `status` `AVAILABLE`/`MAINTENANCE`, campus par défaut | N trajets |
| `trips` (Trip) | véhicule, conducteur (`driverSub`, e-mail, nom copiés), `type` (`ONE_WAY`, `ROUND_TRIP`, `ROUND_TRIP_OTHER`), campus origine/destination/retour, destination « autre » (libellé, lat, lng), quatre horaires, commentaire, `status` | index `(vehicleId, status, departureTime)` et `(driverSub, status)` |
| `passengers` (Passenger) | `userSub`, e-mail, nom, `addedBy` `DRIVER`/`SELF` | unique `(tripId, userSub)` ; suppression en cascade avec le trajet |
| `people` (Person) | `sub` du portail (unique, facultatif pour l'étape « par l'adresse »), `email` (unique), `name`, `role` (`Role` : `USER`, `ADMIN`), `last_login_at` | écrite par le rapprochement à chaque connexion (§2.1) ; lue par `isAdmin` ; pas de clé étrangère depuis les autres tables (copies, piège 6) |
| `app_settings` (AppSetting) | clé/valeur ; clé connue : `buffer_minutes` | |
| `audit_logs` (AuditLog) | `userSub`, e-mail, `action` (12 valeurs, dont `SIGNIN_REFUSED`), type (`trip`, `vehicle`, `setting`, `person`) et id d'entité, `details` JSON | index `(entityType, entityId)` et `createdAt` |

Données de départ : [prisma/seed.ts](../../prisma/seed.ts) (3 campus, 3 véhicules, `buffer_minutes = 30`) ; plus
d'administrateur de départ (D21) : le premier administrateur est la personne qui reçoit `ADMIN` du portail.

---

## 6. Styles

- Jetons de conception (couleurs, rayons, ombres, verre dépoli, transitions) : `:root` de
  [src/app/globals.css](../../src/app/globals.css).
- Feuilles par domaine, importées par le code qui les utilise : `components/ui/ui.css`,
  `components/layout/layout.css`, `components/dashboard/dashboard.css`, `components/trips/trips.css`.
- Beaucoup de styles sont aussi écrits en `style={{…}}` dans les composants. Police : Inter
  (`next/font/google`). Interface en français, vouvoiement.

---

## 7. Tests

**Vitest** ([vitest.config.ts](../../vitest.config.ts), `npm test`), installé à l'étape 1 (D2). Les tests ne
touchent ni le réseau ni une base : `@/lib/prisma` est remplacé par un client simulé
([tests/helpers/prisma-mock.ts](../../tests/helpers/prisma-mock.ts)), et le portail par une imitation de son
annuaire qui suit le contrat §7 ([tests/helpers/portail-fake.ts](../../tests/helpers/portail-fake.ts) : `fetch`
simulé, découverte, jeton `client_credentials` vérifié en `client_secret_basic`, annuaire filtré sur le nom ou
l'adresse, pannes réglables). `server-only` est remplacé par le module vide de Next (alias de
`vitest.config.ts`, D28). Limite assumée : les requêtes SQL de chevauchement ne sont pas exécutées, seule leur
forme est vérifiée.

| Fichier | Ce qu'il vérifie |
|---|---|
| [access-policy.test.ts](../../tests/access-policy.test.ts) | chaque méthode de chaque route API appelle la garde de la table (§4) ; aucune route oubliée |
| [auth.test.ts](../../tests/auth.test.ts) | connexion par le portail (§2.1), en appelant directement les rappels d'`authOptions` : réglages du fournisseur (découverte, PKCE, `state`, `nonce`, `client_secret_basic`, scopes), `profile()`, rapprochement par `sub` / adresse / création, refus consignés, rôle recopié, rôle inconnu refusé, 8 h fixes même relue (`vi.setSystemTime`), session sans `id_token`, cookies renommés (`__Secure-` en https), `isAdmin` et garde administrateur qui suivent la base |
| [logout.test.ts](../../tests/logout.test.ts) | `POST /api/auth/logout` avec `fetch` simulé : adresse de fin de session et ses trois paramètres, cookies effacés (morceaux compris), repli sur `/login` sans session, portail muet ou adresse hors de l'émetteur |
| [portail-directory.test.ts](../../tests/portail-directory.test.ts) | annuaire (§2.1 bis), contre le portail imité, l'heure simulée (`vi.setSystemTime`) : jeton sur le `token_endpoint` de la découverte, corps et en-tête Basic exacts (secret fictif avec un deux-points et l'exemple de la RFC 6749, annexe B), gardé jusqu'à son terme moins la marge puis renouvelé, demande partagée, aucun appel sous deux caractères, délai sur chaque appel, secret jamais envoyé hors de l'émetteur ; fermé, 401 puis un seul nouvel essai, deux 401, 429, panne, 500, réponse illisible ; forme `{ sub, name, email }` ; rien de secret ni de personnel dans la console ; `resolveChosenPerson` (D24) |
| [directory-routes.test.ts](../../tests/directory-routes.test.ts) | route par route, Prisma simulé et portail imité : `/api/users/search` (401, moins de deux caractères, forme, 503, 429) ; écart 5 (conducteur choisi par un admin à la création et en modification, passager ajouté par le conducteur : nom et adresse de l'annuaire, inconnu refusé, conducteur inchangé sans appel) ; cas limite 11 (passagers par `sub` et adresse, absent de l'annuaire, égal au conducteur, doublon, annuaire fermé) |
| [permission-checker.test.ts](../../tests/permission-checker.test.ts) | les quatre règles du §2.4 |
| [conflicts.test.ts](../../tests/conflicts.test.ts) | forme des requêtes de chevauchement, exclusion d'un trajet |
| [trip-service.test.ts](../../tests/trip-service.test.ts) | cas limites 1, 2, 3 et 9 ; capacité à la création ; passager en double (cas limite 11) ; nouveau conducteur déjà passager |
| [request-schemas.test.ts](../../tests/request-schemas.test.ts) | schémas zod sur les corps réellement envoyés par l'interface ; cas limite 11 (`sub` exigé, nom plus lu) |
| [routes-validation.test.ts](../../tests/routes-validation.test.ts) | un corps invalide donne 400, jamais 500, sur cinq routes d'écriture |
| [proxy.test.ts](../../tests/proxy.test.ts) | emplacement, export et matcher de `src/proxy.ts` ; lecture du cookie `resavroom.session-token` (pas celui par défaut) ; redirection 8 h après la connexion, même si le jeton a été relu |

L'ancien script `tests/admin_delegation.ts`, qui vidait les trajets de la base réelle, a été retiré (piège 1).

| Commande | Rôle | Résultat relevé le 2026-10-28 (fin d'étape 2b) |
|---|---|---|
| `npm test` | Vitest | 11 fichiers, 219 tests, tous verts |
| `npx tsc --noEmit` | types | 0 erreur |
| `npm run lint` | ESLint | 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs à l'étape 1 |
| `npm run build` | compilation de production | non rejoué (étape 3) |

---

## 8. Sécurité

**Protégé** : connexion par le portail seulement, selon le contrat portail v1 (§2.1 : PKCE, `state`, `nonce`,
client confidentiel, session de 8 h fixes, cookies propres, rapprochement par `sub` avec refus consigné d'une
adresse réattribuée, rôle relu en base) ; redirection des pages sans session (§2.3) ; gardes API et pages admin
(§2.3), table vérifiée par test ; règles de passagers appliquées à l'écriture (§2.4) ; transactions
`Serializable` pour la création, le décalage, la modification admin d'un trajet et l'ajout d'un passager ;
corps des routes d'écriture validés (§4) ; audit des actions sensibles (l'écriture de l'audit ne bloque jamais
l'opération) ; annuaire du portail (§2.1 bis) : secret du client dans un module `server-only`, envoyé au seul
`token_endpoint` de l'origine de l'émetteur, jeton en mémoire du serveur, aucun jeton ni nom ni adresse dans les
journaux ; l'identité d'une autre personne vient de l'annuaire, jamais du corps de la requête (D24). Pas de CSP
(`next.config.ts` vide) : la clause `form-action` du contrat §3.2 ne s'applique pas.

**Écarts** (relevé du 2026-10-26, mis à jour aux étapes 1, 2a et 2b ; aucun n'est une décision acceptée, voir
les cas limites et le plan) :

| # | Écart | Cas limite |
|---|---|---|
| 1 | *Corrigé à l'étape 1* : `addPassenger` applique `canJoinAsPassenger` et réserve `addedBy: "DRIVER"` au conducteur ou à un admin ; `createTrip` limite les passagers aux places | EC 1 |
| 2 | *Corrigé à l'étape 1* : retrait selon le SAD (§2.4) | EC 2 |
| 3 | *Corrigé à l'étape 1* : `updateDepartureTime` revérifie véhicule, conducteur et passagers | EC 3 |
| 4 | *Corrigé à l'étape 2a* : `authorized_services` est supprimée ; le mode restreint et la grille du portail filtrent la connexion | EC 4 |
| 5 | *Corrigé à l'étape 2a* : le fournisseur de développement et ses comptes sont retirés ; seul le fournisseur `portail` existe | EC 5 |
| 6 | *Corrigé en partie à l'étape 1* : corps validés par zod (§4). Reste : pas de limitation de débit | EC 6 |
| 7 | `GET /api/trips` expose à tout utilisateur connecté tous les trajets avec e-mails des conducteurs et passagers ; `/api/users/search` lui rend le nom et l'adresse des personnes qui ont accès (usage prévu par le contrat §7) | EC 7 |
| 8 | `cleanupDatabase` supprime définitivement ; seule garde : `window.confirm` côté client | EC 8 |
| 9 | *Corrigé à l'étape 1* : les deux traces de débogage sont retirées | EC 9 |
| 10 | Un doublon de plaque de véhicule donne une erreur Prisma convertie en 500 (administrateurs et services ont disparu en 2a) | EC 10 |
| 11 | *Corrigé à l'étape 2b* : les passagers se choisissent dans l'annuaire, avec leur `sub` (D27) ; doublon refusé en 400. Reste : sans annuaire (fermé, en panne), la création avec passagers répond 503 | EC 11 |
| 12 | Une adresse portée en base par une autre personne (autre `sub`) bloque la connexion, sans écran pour lever le conflit | EC 12 |
| 13 | Après un retrait d'accès, la session ouverte va à son terme (8 h au plus) et le rôle en base reste celui de la dernière connexion (contrat, G15) | EC 13 |
| 14 | *Corrigé à l'étape 2b* (écart 5 du relevé P-01, D24) : l'identité d'une autre personne (conducteur choisi par un admin, passagers à la création, passager ajouté par le conducteur) était recopiée du corps de la requête ; elle vient de l'annuaire | EC 11 |

---

## 9. Outillage et build

- Scripts `package.json` : `dev` (`next dev -p 3002`, port fixe connu du portail, D12), `build`, `start`,
  `lint`, `test` (`vitest run`). Alias `@/*` → `src/`. `"type": "module"`. Dépendances ajoutées à l'étape 1 :
  `zod` 4, `vitest` 4.1 (Vitest 5 exige `@types/node` 22 ou plus ; le projet est en 20). Retirée à l'étape 2a :
  `@azure/msal-node` (D14). `@prisma/adapter-pg` reste, sans usage. Aucune dépendance ajoutée à l'étape 2b :
  `import "server-only"` est résolu par Next lui-même (sa doc : installation facultative ; types dans
  `next/types/global.d.ts`), et Vitest le remplace par `next/dist/compiled/server-only/empty.js` (D28).
- `next dev` affiche un avertissement `DEP0169` (`url.parse()`) venu d'`openid-client`, la bibliothèque OIDC de
  NextAuth v4 : sans effet, pas dans notre code.
- Prisma 7 : l'URL du CLI est dans [prisma.config.ts](../../prisma.config.ts), pas dans le schéma ; depuis
  l'étape 1 (D15), il charge `.env.local` puis `.env` et lit `DATABASE_URL_UNPOOLED` (connexion directe). Le
  client runtime est [src/lib/prisma.ts](../../src/lib/prisma.ts) (adaptateur Neon + `ws`, `DATABASE_URL`
  pooled). Les migrations se jouent par la procédure du mémo d'exploitation.
- Aucune intégration continue (`.github/` absent). Hébergement visé : Vercel (aucun projet relevé à ce jour).

---

## 10. Pour aller plus loin

- Plan, décisions, pièges, journal : [`features/mise-en-production.md`](../features/mise-en-production.md).
- Exploitation (variables, base, MCP) : [`memory/memory-exploitation.md`](../memory/memory-exploitation.md).
- Cas limites : [`edgecase.md`](../edgecase.md).
- Spécifications d'origine : [`SAD.md`](../SAD.md) (algorithmes §7, pages UI, phases) et
  [`Cahier des charge.md`](../Cahier%20des%20charge.md).
