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
s'inscrire comme passagers. Un administrateur gère la flotte, les trajets, les droits et un journal d'audit.

- **Pile** : Next.js 16.2.3 (App Router, Turbopack), React 19, TypeScript strict, Prisma 7.7 avec
  l'adaptateur Neon (WebSocket, port 443), NextAuth v4 (JWT), SWR, date-fns, Sonner, Lucide.
- **Base** : PostgreSQL hébergée chez Neon. Une seule base est configurée par `DATABASE_URL` (voir mémo
  d'exploitation, [`memory/memory-exploitation.md`](../memory/memory-exploitation.md)).
- **Ne fait pas partie du code actuel** : connexion Microsoft Entra ID (abandonnée, G8), envoi de mails
  (jamais écrit), intégration continue. Les tests automatisés existent depuis l'étape 1 (§7). Le fournisseur de connexion actuel est un
  **fournisseur de développement** (§2).

---

## 2. Authentification et accès

### 2.1. Connexion

[src/lib/auth.ts](../../src/lib/auth.ts) déclare un seul fournisseur : `CredentialsProvider` (`dev-credentials`),
qui accepte trois comptes codés en dur (un administrateur, deux utilisateurs) avec un mot de passe commun
défini dans le fichier. Le bloc Entra ID est en commentaire. La session est un **JWT** ; au moment de la
connexion, le jeton reçoit `entraId`, `email`, `name` et `isAdmin`.

L'identité d'un utilisateur dans toute la base est son `entraId` (chaîne). L'administrateur de développement
a l'`entraId` `TO_BE_CONFIGURED`, le même que l'administrateur créé par [prisma/seed.ts](../../prisma/seed.ts).

**Connexion par le portail : décidée, pas encore codée.** Contrat appliqué : **contrat portail v1** (2026-10-28,
`../portail/docs/architecture/contrat-apps.md`), pour le branchement de l'étape 2a du plan (G9, D8 à D14). Le
code décrit ici est celui d'avant ce branchement.

### 2.2. Rôles

| Rôle | Peut | Ne peut pas |
|---|---|---|
| **Utilisateur connecté** | consulter flotte, trajets et calendriers ; créer un trajet à son nom ; s'inscrire comme passager ; annuler ou décaler son propre trajet (règles §2.4) ; se retirer d'un trajet | accéder à `/admin` et aux routes `/api/admin/*` ; modifier un trajet autre que l'heure de départ |
| **Administrateur** (présent dans la table `admins`) | tout ce qui précède sur tous les trajets ; créer un trajet pour un autre conducteur ; modifier librement un trajet (véhicule, conducteur, destination, statut, horaires) ; gérer véhicules, administrateurs, services, paramètres ; lire le journal d'audit ; nettoyer la base (§8) | se révoquer lui-même |

Le rôle est **relu en base à chaque requête gardée** (`isAdmin(entraId)` dans
[src/lib/auth.ts](../../src/lib/auth.ts)) ; le drapeau `isAdmin` du jeton ne sert qu'à l'affichage de la barre de
navigation ([Navbar.tsx](../../src/components/layout/Navbar.tsx)).

### 2.3. Gardes

| Niveau | Fichier | Effet |
|---|---|---|
| Redirection des pages sans session | [src/proxy.ts](../../src/proxy.ts) | `withAuth` de NextAuth : redirige vers `/login` ; couvre toutes les pages sauf `login`, `unauthorized`, `_next/static`, `_next/image`, `favicon.ico` ; **exclut `/api`**, dont les routes répondent 401 elles-mêmes. Vérification optimiste seulement. Jusqu'à l'étape 1, `middleware.ts` était à la racine et Next l'ignorait (piège 3, D4) |
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
| Retirer un passager : admin toujours ; sinon le passager lui-même, ou le conducteur pour un passager qu'il a ajouté (`DRIVER`), et seulement avant le départ (SAD, cahier des charges) | `canLeaveTrip` + règle dans `removePassenger` | `DELETE /api/trips/[id]/passengers/[passengerId]` |

---

## 3. Écrans

| Chemin | Accès | Fichier | Remarque |
|---|---|---|---|
| `/` | connecté | [src/app/page.tsx](../../src/app/page.tsx) | redirige vers `/dashboard` |
| `/login` | public | [src/app/(auth)/login/page.tsx](../../src/app/%28auth%29/login/page.tsx) | sélecteur de compte de développement |
| `/unauthorized` | public | [src/app/(auth)/unauthorized/page.tsx](../../src/app/%28auth%29/unauthorized/page.tsx) | « accès refusé » |
| `/dashboard` | connecté | [src/app/dashboard/page.tsx](../../src/app/dashboard/page.tsx) | flotte (position, statut), prochains trajets ; polling SWR 30 s |
| `/trips` | connecté | [src/app/trips/page.tsx](../../src/app/trips/page.tsx) | liste filtrable |
| `/trips/new` | connecté | [src/app/trips/new/page.tsx](../../src/app/trips/new/page.tsx) | assistant `TripWizard` : recherche (`StepSearch`) puis confirmation (`StepConfirm`) |
| `/trips/[id]` | connecté | [src/app/trips/[id]/page.tsx](../../src/app/trips/[id]/page.tsx) | détail, frise, passagers, actions selon `permissions` |
| `/vehicles/[id]/calendar` | connecté | [src/app/vehicles/[id]/calendar/page.tsx](../../src/app/vehicles/[id]/calendar/page.tsx) | calendrier hebdomadaire et mensuel |
| `/admin` | admin | [src/app/admin/page.tsx](../../src/app/admin/page.tsx) | compteurs lus directement via Prisma (composant serveur) |
| `/admin/vehicles` | admin | [src/app/admin/vehicles/page.tsx](../../src/app/admin/vehicles/page.tsx) | ajout, modification, maintenance |
| `/admin/trips` | admin | [src/app/admin/trips/page.tsx](../../src/app/admin/trips/page.tsx) | liste paginée, filtres, modale `AdminEditTripModal` |
| `/admin/users` | admin | [src/app/admin/users/page.tsx](../../src/app/admin/users/page.tsx) | administrateurs et services |
| `/admin/settings` | admin | [src/app/admin/settings/page.tsx](../../src/app/admin/settings/page.tsx) | `buffer_minutes` ; `DatabaseControls` (métriques Neon, nettoyage) |
| `/admin/audit` | admin | [src/app/admin/audit/page.tsx](../../src/app/admin/audit/page.tsx) | journal paginé, filtres |

Composants : `src/components/ui/` (Badge, Button, Card, Input, Select, Modal, `CustomCalendarPicker`,
`UserSearchAutocomplete`), `layout/Navbar`, `dashboard/*`, `trips/*`, `vehicles/VehicleCalendar`, `admin/*`.
Hooks SWR : [src/hooks/](../../src/hooks/) (`use-vehicles`, `use-trips`, `use-geo`).

---

## 4. Routes API

Toutes les réponses d'erreur ont la forme `{ error: CODE, message }`. Les erreurs métier
([src/lib/utils/errors.ts](../../src/lib/utils/errors.ts)) sont converties par `handleBusinessError` : conflits en
**409** (`VEHICLE_CONFLICT`, `DRIVER_OVERLAP`, `PASSENGER_OVERLAP`, avec `conflictingTripId`), `PERMISSION_DENIED`
en **403**, `VALIDATION_ERROR` en **400** ; toute autre erreur donne **500** `INTERNAL_ERROR`.

**Corps validés** (étape 1, cas limite 6) : les routes d'écriture qui survivront à l'étape 2a lisent leur corps
par `parseJsonBody` et un schéma zod de [request-schemas.ts](../../src/lib/validators/request-schemas.ts) (trajets,
passagers, véhicules, paramètres). JSON mal formé, champ manquant ou invalide, date nulle ou incohérente :
**400** `VALIDATION_ERROR`, avec le champ fautif dans le message (en français). Les champs inconnus sont ignorés.
`admins` et `services`, qui disparaissent en 2a, ne sont pas validés.

**Table de référence** : la colonne « Garde » ci-dessous est [tests/helpers/access-policy.ts](../../tests/helpers/access-policy.ts),
vérifiée contre le code par [tests/access-policy.test.ts](../../tests/access-policy.test.ts) (toute route ou
méthode ajoutée sans y figurer fait échouer `npm test`).

| Route | Méthodes | Garde | Remarque |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | public | NextAuth |
| `/api/auth/check-admin` | GET | connecté (401 sinon) | route de débogage |
| `/api/campuses` | GET | connecté | |
| `/api/vehicles` | GET | connecté | véhicules avec position et statut d'affichage |
| `/api/vehicles/[id]` | GET | connecté | |
| `/api/vehicles/availability` | GET | connecté | véhicules libres + covoiturages suggérés |
| `/api/trips` | GET | connecté | tous les trajets non annulés, quel que soit l'appelant |
| `/api/trips` | POST | connecté | l'admin peut fixer le conducteur (`driverEntraId`, `driverEmail`, `driverDisplayName`, recopiés du corps : écart 5 du relevé P-01, étape 2b) ; passagers limités aux places, conducteur exclu |
| `/api/trips/[id]` | GET | connecté | ajoute `permissions` calculées pour l'appelant |
| `/api/trips/[id]` | PATCH | connecté | non-admin ou corps limité aux horaires/statut : `updateDepartureTime` (`departureTime` requis) ; admin avec d'autres champs : `updateTripInfo` |
| `/api/trips/[id]` | DELETE | connecté + `canDeleteTrip` | annulation logique (`CANCELLED`) |
| `/api/trips/[id]/passengers` | POST | connecté + règles dans `addPassenger` | `addedBy` = `SELF` (soi-même) ou `DRIVER` (conducteur ou admin) ; `canJoinAsPassenger` appliquée |
| `/api/trips/[id]/passengers/[passengerId]` | DELETE | connecté + règles dans `removePassenger` | admin ; soi-même ou conducteur pour ses ajouts `DRIVER`, avant le départ |
| `/api/geo/autocomplete` | GET | connecté | proxy BAN (communes) |
| `/api/geo/directions` | GET | connecté | proxy ORS, repli à vol d'oiseau |
| `/api/users/search` | GET | connecté | **simulation** : filtre les trois comptes de développement |
| `/api/admin/vehicles` | POST | admin | |
| `/api/admin/vehicles/[id]` | PATCH | admin | audit `VEHICLE_UPDATED` / `VEHICLE_MAINTENANCE_ON` / `_OFF` |
| `/api/admin/admins` | GET, POST | admin | audit `ADMIN_PROMOTED` |
| `/api/admin/admins/[id]` | DELETE | admin | refuse l'auto-révocation ; audit `ADMIN_REVOKED` |
| `/api/admin/services` | GET, POST | admin | audit `SERVICE_ADDED` |
| `/api/admin/services/[id]` | DELETE | admin | audit `SERVICE_REMOVED` |
| `/api/admin/settings` | GET, PATCH | admin | audit `SETTINGS_UPDATED` ; seule la clé `buffer_minutes` est acceptée (entier de 0 à 1440) |
| `/api/admin/trips` | GET | admin | liste paginée (max 100) |
| `/api/admin/audit` | GET | admin | journal paginé |

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
| Création | `createTrip` ([trip-service.ts](../../src/lib/services/trip-service.ts)) | transaction `Serializable` : passagers dans la limite des places et sans le conducteur, conflit véhicule, conflit conducteur, conflit de chaque passager ; audit hors transaction |
| Modification admin | `updateTripInfo` | transaction `Serializable` : conflit véhicule et conducteur (trajet exclu) ; les passagers ne sont pas revérifiés |
| Décalage d'horaire | `updateDepartureTime` | décale les quatre dates du même delta ; transaction `Serializable` qui revérifie véhicule, conducteur et chaque passager sur le nouveau créneau, buffer compris, trajet exclu |
| Passagers | `addPassenger`, `removePassenger` | ajout : droit d'ajouter, `canJoinAsPassenger` et chevauchement du passager, lus et écrits dans une même transaction `Serializable` ; retrait : règles du §2.4 |
| Chevauchement | `findVehicleConflict`, `findPersonConflict` | trajet non annulé avec `departureTime < fin` et arrivée (aller ou retour selon le type) `> début` ; un trajet peut être exclu |
| Itinéraire | [geo-service.ts](../../src/lib/services/geo-service.ts) | BAN pour les communes ; ORS pour durée et distance ; repli Haversine × 1,3 à 70 km/h, minimum 10 min |

Constantes : [src/lib/utils/constants.ts](../../src/lib/utils/constants.ts) (`MAX_PASSENGERS` 4, `TOTAL_SEATS` 5,
48 h, 30 min, polling 30 s). La capacité réelle d'un trajet est `vehicle.seats - 1`.

---

## 5. Tables

Schéma : [prisma/schema.prisma](../../prisma/schema.prisma). Migration unique :
`prisma/migrations/20260415124547_init` (8 tables et 5 enums, identiques au schéma), appliquée au projet Neon
`resavroom` le 2026-10-28, puis le seed. Client généré dans `src/generated/prisma/` (versionné ; ne pas éditer).

| Table (modèle) | Contenu | Relations et contraintes |
|---|---|---|
| `campuses` (Campus) | nom unique, latitude, longitude | référencé par véhicules et trajets (origine, destination, retour) |
| `vehicles` (Vehicle) | nom, plaque unique, places (5 par défaut, conducteur inclus), `status` `AVAILABLE`/`MAINTENANCE`, campus par défaut | N trajets |
| `trips` (Trip) | véhicule, conducteur (`driverEntraId`, e-mail, nom copiés), `type` (`ONE_WAY`, `ROUND_TRIP`, `ROUND_TRIP_OTHER`), campus origine/destination/retour, destination « autre » (libellé, lat, lng), quatre horaires, commentaire, `status` | index `(vehicleId, status, departureTime)` et `(driverEntraId, status)` |
| `passengers` (Passenger) | `userEntraId`, e-mail, nom, `addedBy` `DRIVER`/`SELF` | unique `(tripId, userEntraId)` ; suppression en cascade avec le trajet |
| `authorized_services` (AuthorizedService) | nom de service unique | **non utilisée à la connexion** (§8, écart 4) |
| `admins` (Admin) | `userEntraId` unique, e-mail | lue par `isAdmin` |
| `app_settings` (AppSetting) | clé/valeur ; clé connue : `buffer_minutes` | |
| `audit_logs` (AuditLog) | utilisateur, `action` (15 valeurs), type et id d'entité, `details` JSON | index `(entityType, entityId)` et `createdAt` |

Données de départ : [prisma/seed.ts](../../prisma/seed.ts) (3 campus, 3 véhicules, `buffer_minutes = 30`,
l'administrateur `TO_BE_CONFIGURED`). Les identités sont des copies : aucun lien vers un annuaire.

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
([tests/helpers/prisma-mock.ts](../../tests/helpers/prisma-mock.ts)). Limite assumée : les requêtes SQL de
chevauchement ne sont pas exécutées, seule leur forme est vérifiée.

| Fichier | Ce qu'il vérifie |
|---|---|
| [access-policy.test.ts](../../tests/access-policy.test.ts) | chaque méthode de chaque route API appelle la garde de la table (§4) ; aucune route oubliée |
| [permission-checker.test.ts](../../tests/permission-checker.test.ts) | les quatre règles du §2.4 |
| [conflicts.test.ts](../../tests/conflicts.test.ts) | forme des requêtes de chevauchement, exclusion d'un trajet |
| [trip-service.test.ts](../../tests/trip-service.test.ts) | cas limites 1, 2, 3 et 9 ; capacité à la création |
| [request-schemas.test.ts](../../tests/request-schemas.test.ts) | schémas zod sur les corps réellement envoyés par l'interface ; cas limite 11 |
| [routes-validation.test.ts](../../tests/routes-validation.test.ts) | un corps invalide donne 400, jamais 500, sur cinq routes d'écriture |
| [proxy.test.ts](../../tests/proxy.test.ts) | emplacement, export et matcher de `src/proxy.ts` |

L'ancien script `tests/admin_delegation.ts`, qui vidait les trajets de la base réelle, a été retiré (piège 1).

| Commande | Rôle | Résultat relevé le 2026-10-28 (fin d'étape 1) |
|---|---|---|
| `npm test` | Vitest | 7 fichiers, 146 tests, tous verts |
| `npx tsc --noEmit` | types | 0 erreur |
| `npm run lint` | ESLint | 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs à l'étape 1 |
| `npm run build` | compilation de production | non rejoué (étape 3) |

---

## 8. Sécurité

**Protégé** : redirection des pages sans session (§2.3) ; gardes API et pages admin (§2.3), table vérifiée par
test ; règles de passagers appliquées à l'écriture (§2.4) ; transactions `Serializable` pour la création, le
décalage, la modification admin d'un trajet et l'ajout d'un passager ; corps des routes d'écriture validés (§4) ;
auto-révocation d'un administrateur refusée ; audit des actions sensibles (l'écriture de l'audit ne bloque
jamais l'opération).

**Écarts** (relevé du 2026-10-26, mis à jour à l'étape 1 ; aucun n'est une décision acceptée, voir les cas
limites et le plan) :

| # | Écart | Cas limite |
|---|---|---|
| 1 | *Corrigé à l'étape 1* : `addPassenger` applique `canJoinAsPassenger` et réserve `addedBy: "DRIVER"` au conducteur ou à un admin ; `createTrip` limite les passagers aux places | EC 1 |
| 2 | *Corrigé à l'étape 1* : retrait selon le SAD (§2.4) | EC 2 |
| 3 | *Corrigé à l'étape 1* : `updateDepartureTime` revérifie véhicule, conducteur et passagers | EC 3 |
| 4 | La liste `authorized_services` ne filtre pas la connexion (disparaît en 2a) | EC 4 |
| 5 | Fournisseur de connexion de développement actif, comptes et mot de passe dans le code (remplacé en 2a) | EC 5 |
| 6 | *Corrigé en partie à l'étape 1* : corps validés par zod (§4). Reste : pas de limitation de débit | EC 6 |
| 7 | `GET /api/trips` expose à tout utilisateur connecté tous les trajets avec e-mails des conducteurs et passagers | EC 7 |
| 8 | `cleanupDatabase` supprime définitivement ; seule garde : `window.confirm` côté client | EC 8 |
| 9 | *Corrigé à l'étape 1* : les deux traces de débogage sont retirées | EC 9 |
| 10 | Un doublon (administrateur, service, plaque de véhicule) donne une erreur Prisma convertie en 500 | EC 10 |
| 11 | La création d'un trajet avec passagers est impossible depuis l'interface : `StepConfirm` les saisit en texte libre, sans identifiant (400 depuis l'étape 1, 500 avant) | EC 11 |

---

## 9. Outillage et build

- Scripts `package.json` : `dev`, `build`, `start`, `lint`, `test` (`vitest run`). Alias `@/*` → `src/`.
  `"type": "module"`. Dépendances ajoutées à l'étape 1 : `zod` 4, `vitest` 4.1 (Vitest 5 exige `@types/node` 22
  ou plus ; le projet est en 20).
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
