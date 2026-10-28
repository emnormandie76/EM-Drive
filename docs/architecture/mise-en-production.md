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
  (jamais écrit), tests automatisés, intégration continue. Le fournisseur de connexion actuel est un
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
| Authentification de toutes les pages et API | [middleware.ts](../../middleware.ts) | redirige vers `/login` ; exclut `login`, `unauthorized`, `api/auth`, `_next/static`, `_next/image`, `favicon.ico`. La convention `middleware` est dépréciée en Next 16 (piège 3) |
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
| Rejoindre : trajet `SCHEDULED`, futur, appelant ≠ conducteur, places libres | `canJoinAsPassenger` | **uniquement** pour afficher le bouton ([GET /api/trips/[id]](../../src/app/api/trips/[id]/route.ts)) — non appliquée à l'écriture (§8, écart 1) |
| Se retirer : avant le départ (admin toujours) | `canLeaveTrip` | **jamais appelée** (§8, écart 2) |

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

| Route | Méthodes | Garde | Remarque |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | public | NextAuth |
| `/api/auth/check-admin` | GET | connecté (401 sinon) | route de débogage |
| `/api/campuses` | GET | connecté | |
| `/api/vehicles` | GET | connecté | véhicules avec position et statut d'affichage |
| `/api/vehicles/[id]` | GET | connecté | |
| `/api/vehicles/availability` | GET | connecté | véhicules libres + covoiturages suggérés |
| `/api/trips` | GET | connecté | tous les trajets non annulés, quel que soit l'appelant |
| `/api/trips` | POST | connecté | l'admin peut fixer le conducteur (`driverEntraId`, …) |
| `/api/trips/[id]` | GET | connecté | ajoute `permissions` calculées pour l'appelant |
| `/api/trips/[id]` | PATCH | connecté | non-admin ou corps limité aux horaires/statut : `updateDepartureTime` ; admin avec d'autres champs : `updateTripInfo` |
| `/api/trips/[id]` | DELETE | connecté + `canDeleteTrip` | annulation logique (`CANCELLED`) |
| `/api/trips/[id]/passengers` | POST | connecté | `addedBy` = `SELF` ou `DRIVER` (§8, écart 1) |
| `/api/trips/[id]/passengers/[passengerId]` | DELETE | connecté + règle dans `removePassenger` | soi-même, conducteur ou admin |
| `/api/geo/autocomplete` | GET | connecté | proxy BAN (communes) |
| `/api/geo/directions` | GET | connecté | proxy ORS, repli à vol d'oiseau |
| `/api/users/search` | GET | connecté | **simulation** : filtre les trois comptes de développement |
| `/api/admin/vehicles` | POST | admin | |
| `/api/admin/vehicles/[id]` | PATCH | admin | audit `VEHICLE_UPDATED` / `VEHICLE_MAINTENANCE_ON` / `_OFF` |
| `/api/admin/admins` | GET, POST | admin | audit `ADMIN_PROMOTED` |
| `/api/admin/admins/[id]` | DELETE | admin | refuse l'auto-révocation ; audit `ADMIN_REVOKED` |
| `/api/admin/services` | GET, POST | admin | audit `SERVICE_ADDED` |
| `/api/admin/services/[id]` | DELETE | admin | |
| `/api/admin/settings` | GET, PATCH | admin | audit `SETTINGS_UPDATED` ; clé et valeur libres |
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
| Création | `createTrip` ([trip-service.ts](../../src/lib/services/trip-service.ts)) | transaction `Serializable` : conflit véhicule, conflit conducteur, conflit de chaque passager ; audit hors transaction |
| Modification admin | `updateTripInfo` | transaction `Serializable` : conflit véhicule et conducteur (trajet exclu) ; les passagers ne sont pas revérifiés |
| Décalage d'horaire | `updateDepartureTime` | décale les quatre dates du même delta ; **aucune revérification de conflit** (§8, écart 3) |
| Passagers | `addPassenger`, `removePassenger` | chevauchement du passager vérifié en transaction (niveau par défaut) à l'ajout |
| Itinéraire | [geo-service.ts](../../src/lib/services/geo-service.ts) | BAN pour les communes ; ORS pour durée et distance ; repli Haversine × 1,3 à 70 km/h, minimum 10 min |

Constantes : [src/lib/utils/constants.ts](../../src/lib/utils/constants.ts) (`MAX_PASSENGERS` 4, `TOTAL_SEATS` 5,
48 h, 30 min, polling 30 s). La capacité réelle d'un trajet est `vehicle.seats - 1`.

---

## 5. Tables

Schéma : [prisma/schema.prisma](../../prisma/schema.prisma). Migration unique :
`prisma/migrations/20260415124547_init` (8 tables et 5 enums, identiques au schéma). Client généré dans
`src/generated/prisma/` (versionné ; ne pas éditer).

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

**Il n'existe aucune suite de tests automatisés** : `package.json` n'a pas de script de test et aucune
bibliothèque de test n'est installée. Le seul fichier de [tests/](../../tests/) est
[admin_delegation.ts](../../tests/admin_delegation.ts), un script manuel (`tsx`) qui s'exécute **sur la base
réelle** et commence par `prisma.trip.deleteMany()` : il ne se lance jamais (piège 1).

Vérifications disponibles :

| Commande | Rôle | Résultat relevé le 2026-10-26 |
|---|---|---|
| `npx tsc --noEmit` | types | 0 erreur |
| `npm run lint` | ESLint | 18 problèmes (15 erreurs, 3 avertissements) |
| `npm run build` | compilation de production | non rejoué |

---

## 8. Sécurité

**Protégé** : authentification de toutes les pages ; gardes API et pages admin (§2.3) ; transactions
`Serializable` pour la création et la modification admin d'un trajet ; auto-révocation d'un administrateur
refusée ; audit des actions sensibles (l'écriture de l'audit ne bloque jamais l'opération).

**Ce qui n'est pas protégé** (relevé du 2026-10-26 ; aucun n'est une décision acceptée, voir les cas
limites et le plan) :

| # | Écart | Cas limite |
|---|---|---|
| 1 | `POST /api/trips/[id]/passengers` n'appelle pas `canJoinAsPassenger` : ni capacité, ni trajet passé ou annulé, ni conducteur = passager ne sont contrôlés côté serveur. Avec `addedBy: "DRIVER"`, n'importe quel utilisateur connecté peut inscrire n'importe qui sur n'importe quel trajet | EC 1 |
| 2 | `canLeaveTrip` n'est jamais appelée ; `removePassenger` laisse le conducteur retirer tout passager, y compris `SELF` | EC 2 |
| 3 | `updateDepartureTime` décale un trajet sans revérifier conflits de véhicule, de conducteur ni de passagers | EC 3 |
| 4 | La liste `authorized_services` ne filtre pas la connexion | EC 4 |
| 5 | Fournisseur de connexion de développement actif, comptes et mot de passe dans le code | EC 5 |
| 6 | Corps JSON non validés par schéma ; `updateTripInfo` reçoit le corps brut ; pas de limitation de débit | EC 6 |
| 7 | `GET /api/trips` expose à tout utilisateur connecté tous les trajets avec e-mails des conducteurs et passagers | EC 7 |
| 8 | `cleanupDatabase` supprime définitivement ; seule garde : `window.confirm` côté client | EC 8 |
| 9 | Journaux serveur : `console.error("403 Debug", …)` et `console.log("DELETE route hit", …)` écrivent des identifiants | EC 9 |
| 10 | Un doublon d'administrateur ou de service donne une erreur Prisma convertie en 500 | EC 10 |

---

## 9. Outillage et build

- Scripts `package.json` : `dev`, `build`, `start`, `lint`. Alias `@/*` → `src/`. `"type": "module"`.
- Prisma 7 : l'URL de base est dans [prisma.config.ts](../../prisma.config.ts), pas dans le schéma ; le client
  runtime est [src/lib/prisma.ts](../../src/lib/prisma.ts) (adaptateur Neon + `ws`). Les migrations se jouent
  par la procédure du mémo d'exploitation.
- Aucune intégration continue (`.github/` absent). Hébergement visé : Vercel (aucun projet relevé à ce jour).

---

## 10. Pour aller plus loin

- Plan, décisions, pièges, journal : [`features/mise-en-production.md`](../features/mise-en-production.md).
- Exploitation (variables, base, MCP) : [`memory/memory-exploitation.md`](../memory/memory-exploitation.md).
- Cas limites : [`edgecase.md`](../edgecase.md).
- Spécifications d'origine : [`SAD.md`](../SAD.md) (algorithmes §7, pages UI, phases) et
  [`Cahier des charge.md`](../Cahier%20des%20charge.md).
