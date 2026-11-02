# Chantier — Indisponibilités des véhicules et corrections

> **Statut au 2026-11-02 :** **étape 1 faite et validée** ; prochaine étape : 2 (indisponibilités datées, avec
> migration). Décisions D58 à D65 tranchées (§2.1). Branche de travail : `dev-claude`.
> Source : demande du propriétaire du 2026-11-02. Chantier distinct de « mise en production » (terminé le
> 2026-10-29) et de « renommage EM Drive » (reste D57, le nom du projet Neon, sans lien avec ce chantier).

---

## 0. Mode d'emploi pour un agent

- Lire : `CLAUDE.md` ; ce plan en entier ; le plan [mise-en-production](mise-en-production.md) §0 et §4
  (pièges 2, 4, 9, 14, 15) ; [`architecture/mise-en-production.md`](../architecture/mise-en-production.md) (§3
  routes, §4 gardes, §8 écarts) ; [`memory/memory-exploitation.md`](../memory/memory-exploitation.md) §2
  (migrations) et §4.1 (livrer) ; [`edgecase.md`](../edgecase.md) ; le guide Next de ce que l'étape touche
  (AGENTS.md).
- Mêmes règles que le chantier « mise en production » (§0) : **une étape par session**, compte rendu, puis
  attente de la validation explicite du propriétaire ; **tests d'abord** pour tout ce qui garde (conflits,
  droits, disponibilité), vus en échec puis verts ; un test qui échoue ne s'affaiblit pas ; pas de commit ni de
  push sans demande.
- Les questions du §2.2 se posent **au début de leur étape**, par questions à cocher (quatre au plus, la
  recommandation en premier), puis passent au §2.1 avec leur numéro D.
- **Écrans** : Vitest tourne en environnement `node`, sans DOM. Une règle d'écran qui protège (résultats
  périmés) s'écrit dans une fonction pure, testée ; le reste se vérifie par un essai réel sur le poste
  (piège 15 du plan mise-en-production : viser les boutons par leur classe ou leur texte).
- **Migration** (étapes 2 et 3) : rédigée à la main, jamais modifiée une fois appliquée, appliquée sur accord
  du propriétaire, branche Neon `main` puis `dev`, **avant** le code qui en dépend (mémo §2, §4.1).

---

## 1. Pourquoi

Demandes du propriétaire du 2026-11-02 :

1. **Car Booking** : Car Booking est l'application de réservation commune à toute l'école. Un admin doit
   pouvoir indiquer dans EM Drive qu'un véhicule y est réservé d'une date à une autre. EM Drive ne le propose
   alors plus sur ce créneau.
2. **Maintenance datée** : la maintenance doit avoir une date de début et une date de fin. Aujourd'hui, c'est
   un interrupteur sans date.
3. **« Modifier l'heure »** sur `/trips/[id]` ne marche pas, ni pour un conducteur ni pour un admin. Le bouton
   est désactivé depuis l'origine (relevé à l'étape 3 de la mise en production, mémo §5).
4. **Recherche périmée** : après une recherche, si l'on modifie le formulaire sans relancer la recherche, les
   anciens résultats restent proposés. On peut alors réserver un véhicule trouvé pour d'autres critères que
   ceux affichés.
5. **En-tête opaque** : la barre du haut est aujourd'hui translucide et floutée.

---

## 2. Décisions

### 2.1. Tranchées

| # | Date | Question | Réponse |
|---|---|---|---|
| D58 | 2026-11-02 | Comment modéliser une réservation Car Booking et une maintenance datée ? | **Une notion commune**, « indisponibilité » : véhicule, début, fin, motif (`CAR_BOOKING` ou `MAINTENANCE`), commentaire. La recherche, la création, les changements d'horaire et le calendrier la lisent à un seul endroit. Recommandation retenue. |
| D59 | 2026-11-02 | Que devient l'interrupteur « Passer en maintenance » (sans dates) ? | **Remplacé par des périodes datées.** La fin est facultative pour une maintenance (panne de durée inconnue), obligatoire pour Car Booking. La colonne `vehicles.status` reste en base le temps d'une livraison (le code en ligne la lit encore pendant la migration), puis elle est retirée à l'étape 3. Recommandation retenue. |
| D60 | 2026-11-02 | Un admin déclare une indisponibilité sur un créneau où des trajets sont déjà réservés ? | **Refuser et lister** les trajets en conflit (409). L'admin les déplace ou les annule d'abord : comme entre deux trajets, aucune double réservation possible. Recommandation retenue. |
| D61 | 2026-11-02 | Que peut-on changer avec « Modifier l'heure » (conducteur et admin) ? | **Le départ et le retour, séparément.** Les durées de route restent celles du trajet (pas de nouvel appel à OpenRouteService). La route serveur est étendue. Recommandation retenue. |
| D62 | 2026-11-02 (Q1) | Le serveur revérifie-t-il, à la création et au changement d'horaire, que le véhicule sera au campus de départ ? | **Oui.** Recommandation retenue. |
| D63 | 2026-11-02 (Q2) | Peut-on changer l'horaire d'un trajet commencé ou terminé, ou mettre un départ dans le passé ? | **Non, par « Modifier l'heure », pour tout le monde, admin compris.** La modale complète de `/admin/trips` (`updateTripInfo`) reste l'outil de correction de l'admin, sans cette limite. Plus strict que la recommandation, qui laissait l'admin libre partout. |
| D64 | 2026-11-02 (essai) | Dans une modale, le calendrier était coupé par la modale (qui défile) et passait sous les boutons : comment le refaire ? | **Calendrier dans la modale** : il s'ouvre dans le flux, sous le champ, et la modale grandit (`DatePickerInput inline`), dans « Modifier les horaires » et dans la modale admin de `/admin/trips`. Recommandation retenue (l'autre option : un calendrier flottant, placé par calcul). |
| D65 | 2026-11-02 (essai) | Nom du bouton | **« Modifier les horaires »** (ex-« Modifier l'heure ») : on y change aussi le retour. Demande du propriétaire. |

### 2.2. À trancher au début de leur étape

| # | Étape | Question | Recommandation |
|---|---|---|---|
| Q1 | 1 | Le serveur revérifie-t-il, à la création et au changement d'horaire, que le véhicule sera **au campus de départ** ? Aujourd'hui, seule la recherche le vérifie. | Oui. Sinon une recherche périmée ou une requête forgée réserve un véhicule qui sera ailleurs. |
| Q2 | 1 | Peut-on changer l'horaire d'un trajet commencé ou terminé, ou mettre un départ dans le passé ? Aujourd'hui, rien ne l'empêche côté serveur. | Le conducteur : non (trajet pas encore parti, nouveau départ futur). Un admin : oui (corrections après coup). |
| Q3 | 2 | Pendant et après une réservation Car Booking, où est le véhicule ? | Il revient à son campus : la position d'EM Drive n'est pas touchée par une indisponibilité. |
| Q4 | 2 | Que voit un utilisateur non admin d'une indisponibilité (calendrier du véhicule, tableau de bord) ? | La période et le motif (« Maintenance », « Réservé sur Car Booking ») ; le commentaire reste réservé aux admins. |
| Q5 | 2 | Une indisponibilité se modifie-t-elle, ou se supprime-t-elle pour être recréée ? | Elle se modifie (dates, motif, commentaire), avec les mêmes contrôles qu'à la création. |
| Q6 | 3 | Retirer la colonne `vehicles.status` et le type `VehicleStatus` : c'est un `DROP`, interdit par la règle 8 de `CLAUDE.md` sauf exception accordée. | Accorder l'exception, pour cette seule colonne et ce seul type (D59). Sinon, la colonne reste en base, inutilisée. |

---

## 3. État des lieux (relevé du 2026-11-02)

- **Départ** : `dev-claude` sur `612fd64`, arbre propre au début de la session ; les vérifications (tests, `tsc`,
  lint, build) seront rejouées au départ de l'étape 1.
- **Maintenance** : `Vehicle.status` (`AVAILABLE` | `MAINTENANCE`) est basculé par
  `PATCH /api/admin/vehicles/[id]` depuis `/admin/vehicles` (audit `VEHICLE_MAINTENANCE_ON` / `_OFF`). Il est lu
  par `getAvailableVehicles` (filtre de la recherche), `getAllVehiclesWithPositions` (statut du tableau de
  bord), le compteur de `/admin` et `VehicleCard`. **Il n'est vérifié ni par `createTrip`, ni par
  `updateDepartureTime`, ni par `updateTripInfo`** : un véhicule en maintenance se réserve par une recherche
  périmée ou une requête forgée.
- **« Modifier l'heure »** : bouton `disabled` en dur
  ([TripDetail.tsx:151](../../src/components/trips/TripDetail.tsx#L151)). Côté serveur, `PATCH /api/trips/[id]`
  appelle `updateDepartureTime` : il décale les quatre dates du même écart et revérifie le véhicule, le
  conducteur et les passagers dans une transaction `Serializable`, buffer compris (cas limite 3). La règle des
  48 h quand des passagers se sont inscrits passe par `canModifyDepartureTime`, et un audit `TRIP_UPDATED` est
  écrit. Rien n'empêche de changer l'horaire d'un trajet passé (Q2).
- **Recherche** : `StepSearch` rend ses résultats par `onResults`. `TripWizard` les garde jusqu'à la recherche
  suivante, et un changement du formulaire ne les efface pas. `StepConfirm` réserve avec les paramètres de la
  **dernière recherche**, pas avec ceux affichés dans le formulaire. Variante : « Retour » depuis la
  confirmation remonte un formulaire vide, mais les anciens résultats restent affichés. `createTrip` ne
  revérifie que les chevauchements, ni le campus ni la maintenance.
- **En-tête** : `.navbar` ([layout.css](../../src/components/layout/layout.css)) a un fond
  `var(--glass-bg)` (blanc à 70 %) et un flou de 12 px. Il reste collé en haut de page (`sticky`).
- **Calendrier du véhicule** (`/vehicles/[id]/calendar`) : il ne montre que les trajets.

---

## 4. Pièges connus

1. **Migration** : le port 5432 est fermé sur le réseau de l'entreprise (piège 4 de la mise en production). Une
   migration se joue sur la branche Neon `main`, puis sur `dev`. Elle doit laisser fonctionner le code déjà en
   ligne : ajouter d'abord, retirer à la livraison suivante (D59, étape 3). Un retour arrière de Vercel ne
   défait pas une migration.
2. **`ALTER TYPE … ADD VALUE`** (nouvelles valeurs d'`AuditAction`) : PostgreSQL refuse d'employer une valeur
   ajoutée dans la transaction même qui l'ajoute. La migration ajoute les valeurs sans les employer.
3. **Heures locales** : les formulaires saisissent une date et une heure dans l'heure du navigateur
   (Europe/Paris), envoyées en ISO UTC. Il faut garder les conversions existantes (`AdminEditTripModal`) et
   penser au changement d'heure.
4. **Intervalles** : un trajet occupe `[départ, fin + buffer)`, une indisponibilité `[début, fin)` (fin absente :
   sans limite). Il y a conflit si départ < fin et fin + buffer > début. Deux créneaux qui se touchent ne sont
   pas en conflit : c'est la convention de `findVehicleConflict` (`lt` / `gt`).
5. **Position** : `getVehiclePosition` ne lit que les trajets. Une indisponibilité ne déplace pas le véhicule
   (Q3).
6. **Sur le poste**, la base est la branche Neon `dev`, et l'annuaire est fermé sur le client `dev` : la
   recherche de collègues répond 503. C'est attendu.

---

## 5. Étapes

### Étape 1 — Corrections, sans migration

**But** : en-tête opaque, recherche jamais périmée, « Modifier l'heure » qui marche, et un serveur qui
revérifie ce que la recherche promet.

- [x] Départ vérifié : `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (`DATABASE_URL` factice)
  puis `tsc` ; Q1 et Q2 tranchées (D62, D63).
- [x] **En-tête opaque** : `.navbar` sur fond plein (`var(--color-surface)`), sans flou. *Largeurs 375, 768 et
  1280 px à voir à l'essai réel.*
- [x] **Recherche périmée** : toute modification du formulaire après une recherche efface les résultats
  (véhicules et covoiturages) ; « Retour » depuis la confirmation retrouve le formulaire rempli et ses
  résultats. Logique dans une fonction pure, testée.
- [x] **Serveur, création** (tests d'abord) : `createTrip` refuse un véhicule en maintenance (`status`, en
  attendant l'étape 2) et, selon Q1, un véhicule qui ne sera pas au campus de départ.
- [x] **Serveur, horaires** (tests d'abord, D61) : `updateDepartureTime` devient `updateTripTimes`, qui reçoit
  le nouveau départ et, pour un aller-retour, le nouveau départ du retour. Les arrivées gardent les durées du
  trajet, et le retour doit partir après l'arrivée de l'aller. Il revérifie les conflits (véhicule, conducteur,
  passagers, buffer), la maintenance, Q1 et Q2, et garde la règle des 48 h et l'audit.
  `PATCH /api/trips/[id]` accepte `returnDepartureTime` sur ce chemin.
- [x] **Écran** : le bouton « Modifier l'heure » ouvre une modale (date et heure de départ, puis de retour pour
  un aller-retour, avec les arrivées calculées). Il est actif quand `permissions.canModifyDeparture` est vrai,
  affiche les erreurs du serveur (conflit 409, règle des 48 h) et rafraîchit le détail.
- [x] Vérifications vertes (303 tests, 21 fichiers ; `tsc` 0 ; lint 0 ; build, puis `tsc` 0).
- [x] Essai réel sur le poste (2026-11-02) : en-tête, recherche, horaires (affichage), maintenance conformes ;
  calendrier refait (D64), bouton renommé (D65). L'enregistrement de nouveaux horaires n'a pas été rejoué en réel
  (couvert par `tests/trip-times-route.test.ts`).
- [x] Docs : architecture (§1, §2.4, §3, §4, §4.1, §6, §7, §8), `edgecase.md` (cas 14), mémo §5 et `README.md`,
  `CLAUDE.md`, journal.
- [x] Validation du propriétaire (2026-11-02).

Livraison : pas de migration ; en ligne quand le propriétaire avance `main`.

### Étape 2 — Indisponibilités datées (Car Booking, maintenance)

**But** : un admin déclare, modifie et retire des périodes d'indisponibilité. Recherche, création et
changements d'horaire les respectent, et le tableau de bord et le calendrier les montrent.

- [ ] Départ vérifié ; Q3 à Q5 tranchées ; base relue en `SELECT` (`main` et `dev`) : les véhicules en
  `MAINTENANCE` à reprendre.
- [ ] **Schéma et migration** (rédigée à la main, D58, D59) :
  - type `UnavailabilityReason` (`CAR_BOOKING`, `MAINTENANCE`) ;
  - table `vehicle_unavailabilities` : `id`, `vehicle_id` (clé étrangère), `reason`, `starts_at`, `ends_at`
    (facultative), `comment`, `created_by_sub`, `created_by_email`, `created_at`, `updated_at`, avec un index
    (`vehicle_id`, `starts_at`) ;
  - valeurs d'audit `VEHICLE_UNAVAILABILITY_CREATED`, `_UPDATED` et `_DELETED` ;
  - reprise : chaque véhicule en `MAINTENANCE` reçoit une période `MAINTENANCE` ouverte, qui commence à la
    date de la migration. La colonne `status` reste en base.
- [ ] **Contrôle commun** (tests d'abord : bornes, période ouverte, buffer) : `findVehicleUnavailability`. Il
  est appelé par `getAvailableVehicles`, `createTrip`, `updateTripTimes` et `updateTripInfo`. Il remplace la
  lecture de `status`.
- [ ] **Routes admin** (tests d'abord) : `GET` / `POST /api/admin/vehicles/[id]/unavailabilities` et
  `PATCH` / `DELETE /api/admin/unavailabilities/[id]`, sous `requireAdminSession`. Schémas zod : la fin suit le
  début ; elle est obligatoire pour `CAR_BOOKING`. Erreurs : 409 avec la liste des trajets en conflit (D60), 400
  pour un corps invalide. Audit de chaque écriture. `PATCH /api/admin/vehicles/[id]` n'accepte plus `status`.
- [ ] **Lecture** : les périodes du véhicule dans les routes du calendrier et du tableau de bord, selon Q4.
- [ ] **Écran admin** (`/admin/vehicles`) : un bouton « Indisponibilités » par véhicule remplace
  l'interrupteur. Il ouvre la liste des périodes en cours et à venir, avec ajout (motif, début, fin, « sans
  date de fin » pour une maintenance), modification (Q5) et suppression. Un conflit affiche les trajets en
  cause, avec un lien vers chacun.
- [ ] **Affichage** : statut du tableau de bord tiré des périodes en cours (« En maintenance », « Réservé sur
  Car Booking ») ; compteur de `/admin` ; blocs d'indisponibilité dans le calendrier du véhicule, d'une couleur
  distincte de celle des trajets.
- [ ] Vérifications vertes ; migration appliquée sur accord (`main` puis `dev`) et contrôlée par le MCP Neon
  (lecture) ; essai réel sur le poste.
- [ ] Docs : architecture (§3, §4, §5 tables, §8), `edgecase.md`, mémo (§2 migrations, §5), `README.md`,
  journal.
- [ ] Validation du propriétaire.

Livraison : la migration d'abord (mémo §4.1), puis l'avance de `main`.

### Étape 3 — Retrait de l'ancienne colonne `status`

**But** : ne garder qu'une source de vérité (D59), une fois l'étape 2 en ligne et validée.

- [ ] Q6 tranchée (exception à la règle 8, ou colonne laissée en base).
- [ ] Selon Q6 : une migration retire `vehicles.status` et le type `VehicleStatus`. Les valeurs d'audit
  `VEHICLE_MAINTENANCE_ON` / `_OFF` restent, car des lignes du journal les portent. Schéma, seed et code
  nettoyés.
- [ ] Vérifications vertes ; migration appliquée sur accord (`main` puis `dev`) et contrôlée.
- [ ] Docs, journal ; validation du propriétaire.

---

## 6. Hors périmètre

- Une synchronisation automatique avec Car Booking (API, import) : un admin saisit les réservations à la main.
- Un avis aux personnes dont un trajet est touché : aucun mail (D6).
- Les défauts connus du mémo §5 non demandés ici : le `vehicleId` du bouton « Réserver » est ignoré par
  l'assistant, et les suggestions de covoiturage ne sont pas filtrées par destination.
- Le renommage du projet Neon (D57, chantier « renommage EM Drive »).

---

## 7. Journal de progression

| Date | Étape | Fait | Reste / surprises |
|---|---|---|---|
| 2026-11-02 | — | **Plan écrit.** Lus : `CLAUDE.md`, plan mise-en-production (§0, §4, §6, §9), plan renommage, cas limites, mémo (§2, §4) ; code de la maintenance, du détail d'un trajet, de l'assistant de réservation, des services de trajets et de véhicules, de l'en-tête. D58 à D61 tranchées par le propriétaire (recommandations retenues). Relevé (§3) : bouton « Modifier l'heure » désactivé en dur ; maintenance ni revérifiée à la création ni aux changements d'horaire ; réservation faite avec les paramètres de la dernière recherche, pas ceux affichés ; « Retour » vide le formulaire mais garde les résultats. | En attente de validation du plan. Aucun code modifié, rien n'est commité. |
| 2026-11-02 | 1 | **Début d'étape.** Le propriétaire répond à Q1 et Q2, ce qui lance l'étape 1 : **D62** (campus revérifié : oui, recommandation) ; **D63** (pas de changement d'horaire d'un trajet parti, ni de départ passé, par « Modifier l'heure », admin compris ; la modale de `/admin/trips` reste libre), précisée par une seconde question, plus stricte que la recommandation. Départ vérifié : `dev-claude` sur `612fd64` (docs du plan non commitées) ; 273 tests (19 fichiers), `tsc` 0, lint 0, build puis `tsc` 0. | — |
| 2026-11-02 | 1 | **Tests d'abord, vus en échec** : `updateTripTimes` (D61, D63), véhicule réservable à la création, au changement d'horaire et en modification admin (D62), `canModifyDepartureTime` sur un trajet parti, `tests/trip-times-route.test.ts` (3), `tests/wizard-state.test.ts` (7). Contre l'ancien code : 25 en échec et le fichier de l'assistant non chargé (module absent) ; entre autres, « refuse à la création un véhicule en maintenance » obtenait un trajet créé. **Code** : `VehicleUnavailableError` et `VehicleNotAtCampusError` (409) ; `assertVehicleBookable` et `getVehiclePosition` lue dans la transaction, trajet modifié exclu ; `updateTripTimes` remplace `updateDepartureTime` ; `canModifyDepartureTime` refuse un trajet parti à tous ; route `PATCH` ; `wizard-state.ts` et `TripWizard` ; `StepSearch` (changement signalé, version du formulaire) ; `EditTripTimesModal` et `TripDetail` ; `.navbar` opaque. 303 tests verts (21 fichiers), `tsc` 0, lint 0, build puis `tsc` 0. Docs : architecture, cas limite 14, mémo §5, `README.md`, `CLAUDE.md`. | **Surprise** : sans exclure le trajet modifié, son ancien enregistrement pouvait situer le véhicule (déplacé à une date plus tardive, l'ancien trajet est « terminé » avant le nouveau départ) ; exclusion ajoutée et testée. **Ajouts au plan**, dans l'esprit de D62 et D63 : contrôle du véhicule dans `updateTripInfo` quand le véhicule, le campus ou le départ d'un trajet prévu change (le reste, dont l'annulation, n'est pas bloqué par une maintenance) ; refus d'un trajet annulé dans `updateTripTimes` ; une recherche lancée avant un changement du formulaire ne rend pas ses résultats ; un refus du véhicule par le serveur ramène à la recherche. **Tests touchés, sans affaiblissement** : données de test complétées (`makeVehicle`, campus du trajet ; véhicule simulé de `directory-routes.test.ts`), car la création exige désormais un véhicule disponible au campus de départ ; le test « buffer compris, trajet exclu » du cas limite 3 ne passe plus en revue que les recherches de chevauchement, la position ayant sa propre recherche (vérifiée par un test à part). **Limite relevée, hors étape** : la recherche ne vérifie pas qu'un trajet réservé plus tard part du campus où le nouveau trajet laissera le véhicule (algorithme d'origine, cas limite 14). Essai réel à faire avec le propriétaire. Rien n'est commité. |
| 2026-11-02 | 1 | **Essai réel** sur le poste (`npm run dev`, branche Neon `dev`), le propriétaire connecté lui-même ; contrôle préalable sans session : `/login` 200, `/trips/new` et `/trips/[id]` → 307 `/login`, `PATCH /api/trips/[id]` → 401. Par questions à cocher : (1) en-tête opaque, fenêtre étroite comprise : **conforme** ; (2) recherche (OpenRouteService appelé à chaque recherche, accord par l'essai) : résultats effacés au changement, « Retour » qui garde formulaire et résultats : **conforme** ; (4) véhicule du trajet d'essai passé en maintenance par le propriétaire, « Modifier l'heure » refusé avec le message de maintenance, véhicule remis disponible : **conforme** ; (3) horaires : à la demande du propriétaire, l'agent ouvre un onglet dans son Chrome (Claude in Chrome, `localhost:3002` seulement, sa session) : le calendrier, en `position: absolute`, est coupé par `.modal-content` (`overflow-y: auto`), qui défile, et passe sous les boutons. Question posée, **D64** ; corrigé (`inline`) et revu dans l'onglet : calendrier entier, modale agrandie sans défilement, choix d'un jour qui met à jour l'arrivée prévue (sans enregistrer). Le propriétaire valide l'affichage et demande de renommer le bouton (**D65**), fait (code, commentaires, docs vivantes ; le journal garde l'ancien nom). Tests 303 verts, `tsc` 0, lint 0. Onglet fermé. | **Écart** : nouveaux horaires non enregistrés en réel (trajet d'essai toujours au 2 novembre, 19 h 04, relu dans la page) ; le chemin est couvert par les tests de la route et du service. La modale admin reçoit aussi `inline`, et ses rangées date et heure sont alignées en haut (sinon l'heure descendait au bas du calendrier ouvert) ; pas revue à l'écran. Un trajet d'essai et le passage en maintenance aller-retour restent sur la branche `dev` (écritures du propriétaire par l'application). Serveur de développement laissé lancé pour le propriétaire. Rien n'est commité. En attente de validation. |
| 2026-11-02 | 1 | **Étape 1 validée** par le propriétaire. Serveur de développement arrêté par son port, après vérification de sa ligne de commande. Prompt de départ de l'étape 2 rédigé pour un agent neuf (remis au propriétaire, hors du dépôt). | **Rien n'est commité** (étape 1, plan et docs) : commit à la demande du propriétaire. Prochaine étape : 2. |
