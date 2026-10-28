# Chantier — Mise en production de ResaVroom

> **Statut au 2026-10-28 :** étape 0 faite (architecture de contexte installée) et validée par le propriétaire.
> Les étapes 1 à 4 du §5 sont des **ébauches** à confirmer : le propriétaire fournira la
> spécification de l'authentification dans un prochain prompt (G8). Le détail de chaque étape est au §5, son
> histoire au journal (§9).
> **Branche de travail :** `dev-claude` (créée depuis `jules`).
> **Source :** [`SAD.md`](../SAD.md) et [`Cahier des charge.md`](../Cahier%20des%20charge.md) (spécifications
> d'origine, phases 0 à 11 du SAD) ; échange avec le propriétaire du 2026-10-26.
> **Lire avant de coder :** ce document en entier, puis
> [`architecture/mise-en-production.md`](../architecture/mise-en-production.md), puis
> [`memory/memory-exploitation.md`](../memory/memory-exploitation.md).

---

## 0. Mode d'emploi pour un agent

- Les étapes se font **dans l'ordre** du §5.
- **Une étape par session, puis arrêt.** À la fin d'une étape : compte rendu au propriétaire (fait, tests,
  écarts, décisions en attente) ; compléter le [journal](#9-journal-de-progression) ; **attendre sa validation
  explicite.**
- Les décisions « à trancher » (§2.2) se posent au début de leur étape, avec deux options, une recommandation,
  par questions à cocher (`AskUserQuestion`, quatre au plus, la recommandée en premier).
- Une case ne se coche `[x]` que lorsque le code est écrit **et** que ses tests passent (`npx tsc --noEmit`,
  `npm run lint`, puis la commande de test que l'étape 1 installera).
- **Tests d'abord** pour tout ce qui garde ou protège (droits, capacités, conflits) : écrire le test qui montre
  le défaut, le voir échouer, puis corriger.
- **Un test qui échoue ne se désactive pas et ne s'affaiblit pas.** Quand le propriétaire change une règle,
  l'attendu du test change avec elle, et le journal nomme la décision et le test touché.
- **Documentation au fil de l'eau**, en premier lieu
  [`architecture/mise-en-production.md`](../architecture/mise-en-production.md), puis la « Phase en cours » de
  `CLAUDE.md` et l'index.
- Ne commiter et ne pousser que si le propriétaire le demande. Un commit par étape, au format du dépôt
  (`feat(portée): …`, `fix(portée): …`, en français).
- **Interdits, sans exception** (repris de `CLAUDE.md`) : lire, afficher, modifier ou committer `.env` et
  `.env.local` ; écrire dans la base Neon, appliquer une migration ou déployer sans accord explicite ; lancer
  `tests/admin_delegation.ts` ; toute commande destructrice (`migrate reset`, `DROP`, `TRUNCATE`, `deleteMany`
  sans filtre) ; lire ou changer un secret par MCP ; toucher `main`.
- **Migrations** : rédigées à la main, jamais modifiées une fois appliquées, appliquées avec l'accord du
  propriétaire (mémo d'exploitation §2).

---

## 1. Pourquoi

ResaVroom fonctionne en développement (phases 0 à 9 du SAD faites, voir §3) mais n'est pas prêt à être mis en
ligne : l'authentification est un fournisseur de développement, la base n'a aucun test automatisé, plusieurs
règles métier ne sont pas appliquées côté serveur (cas limites 1 à 4 de [`edgecase.md`](../edgecase.md)), et
aucun hébergement ni procédure de livraison n'existe. Le chantier amène l'application à un état déployable.

L'authentification Microsoft Entra ID prévue par le SAD est **abandonnée** (G8). La méthode qui la remplace sera
spécifiée par le propriétaire ; tant qu'elle ne l'est pas, les étapes qui en dépendent sont bloquées.

---

## 2. Décisions

### 2.1. Prises le 2026-10-26

| # | Décision | Par qui |
|---|---|---|
| G1 | **Chantier « mise en production ».** Objectif : rendre l'application déployable (gardes serveur, tests, authentification de production, polish, mise en ligne). Le périmètre exact des étapes 1 à 4 reste à confirmer. | propriétaire |
| G2 | **Base Neon : lectures libres, écritures sur accord.** SELECT et inspection du schéma sans demander. Toute écriture, migration ou suppression exige l'accord à chaque fois. Interdits : reset, drop, `deleteMany` sans filtre. `tests/admin_delegation.ts` ne se lance jamais sur la base réelle. | propriétaire (recommandation retenue) |
| G3 | **Branche de travail `dev-claude`**, créée depuis `jules`. Pas de commit ni de push sans demande explicite ; `main` n'est jamais touchée. | propriétaire |
| G4 | **MCP (GitHub, Neon, Vercel) : lectures permises, écritures sur accord.** Jamais : lecture, création ou rotation de secrets, variables d'environnement ou credentials ; suppression de projet. | propriétaire (recommandation retenue) |
| G5 | **Langue** : échanges, documentation, commentaires et commits en français ; identifiants du code en anglais ; interface en vouvoiement. | propriétaire (recommandation retenue) |
| G6 | **Modèle** : Opus, sans niveau d'effort imposé. | propriétaire |
| G7 | **Anciens documents** : `SAD.md` et `Cahier des charge.md` restent comme spécifications d'origine ; le périmé est retiré après accord (voir §5, étape 0). | propriétaire (recommandation retenue) |
| G8 | **Microsoft Entra ID est abandonné.** La nouvelle méthode d'authentification sera spécifiée par le propriétaire dans un prochain prompt. Conséquences : `message-IT.md`, le bloc Entra de `src/lib/auth.ts`, les permissions Graph du SAD et les mails par Graph (phase 10 du SAD) sont à redéfinir. | propriétaire |

### 2.2. À trancher au début de leur étape

| # | Étape | Question | Recommandation |
|---|---|---|---|
| D1 | 2 | Quelle méthode d'authentification de production, et comment s'appliquent la liste blanche `authorized_services` et l'identité (`entraId`) ? | À spécifier par le propriétaire. Tant que ce n'est pas fait, l'étape 2 reste bloquée et l'application ne se déploie pas (cas limite 5). |
| D2 | 1 | Quel cadre de tests et sur quelle base ? | Vitest, avec les services testés contre une branche Neon jetable (créée sur accord) ou des mocks Prisma pour les règles pures ; les tests ne touchent jamais le réseau externe ni la base réelle. Coût : une branche Neon de plus (quota gratuit à surveiller) contre des tests moins fidèles avec des mocks. |
| D3 | 1 | Que faire des cas limites 1 à 3 (passagers, retrait, décalage d'horaire) : corriger côté serveur ? | Corriger tous les trois, tests d'abord : appliquer `canJoinAsPassenger`/`canLeaveTrip` dans les services, réserver `addedBy: "DRIVER"` au conducteur ou à l'admin, revérifier les conflits dans `updateDepartureTime`. |
| D4 | 1 | Convertir `middleware.ts` en `proxy.ts` (convention de Next 16) ? | Oui, par `npx @next/codemod@latest middleware-to-proxy .`, à faire dans l'étape 1 après lecture de `node_modules/next/dist/docs/`. |
| D5 | 3 | Corriger les 15 erreurs ESLint maintenant ou les laisser ? | Les corriger : `npm run lint` doit devenir un contrôle de fin d'étape fiable. |
| D6 | 4 | Les notifications mail (phase 10 du SAD) sont-elles encore voulues, et par quel canal ? | À spécifier par le propriétaire (le canal Graph prévu dépendait d'Entra ID). |
| D7 | 1 | Quel projet Neon est celui de ResaVroom ? Existe-t-il une base distincte pour la production ? | Le propriétaire indique l'identifiant ; l'agent le consigne dans CLAUDE.md et le mémo. Recommandation : une branche Neon dédiée aux tests (D2) et une pour la production. |

---

## 3. État des lieux au départ (2026-10-26)

- Dépôt : branche `dev-claude` sur `1080aa7` (« add .mcp.json config »), arbre propre avant l'étape 0.
- Phases 0 à 9.6 du SAD faites en développement (voir `git log` ; l'ancien suivi `context/task.md`, retiré à
  l'étape 0, était périmé et contradictoire). Phases 10 (mails) et 11 (polish) non faites.
- `npx tsc --noEmit` : 0 erreur. `npm run lint` : 18 problèmes (15 erreurs, 3 avertissements). Aucun test
  automatisé, aucune CI, aucun déploiement.
- Écarts de sécurité relevés : [`architecture/mise-en-production.md`](../architecture/mise-en-production.md) §8.

---

## 4. Pièges connus

1. **`tests/admin_delegation.ts` détruit des données.** Il commence par `prisma.trip.deleteMany()` et utilise la
   base réelle de `DATABASE_URL`. Ne jamais le lancer ; D2 le remplacera.
2. **Prisma 7 change les conventions.** Le schéma n'a plus `url` : l'URL est dans `prisma.config.ts` ; le
   générateur est `prisma-client` avec `output` obligatoire (`src/generated/prisma/`) ; `PrismaNeon` reçoit un
   objet `{ connectionString }`, pas un `Pool` ; `"type": "module"` dans `package.json`. (Ancien
   `docs/errors/errors.md`.)
3. **`middleware.ts` est une convention dépréciée en Next 16** (renommée `proxy.ts`). Elle fonctionne encore ;
   voir D4. Lire `node_modules/next/dist/docs/` avant de toucher à Next (AGENTS.md).
4. **Port 5432 bloqué sur le réseau de l'entreprise.** Le runtime passe par WebSocket (443) ; les commandes
   `prisma migrate` ouvrent du TCP direct et échouent sur ce réseau (migration initiale jouée via un partage de
   connexion mobile).
5. **`README.md` est en Windows-1252** (accents illisibles en UTF-8) : l'outil d'édition refuse de le modifier.
   Le convertir en UTF-8 avec un outil shell qui garde le contenu, sur accord du propriétaire.
6. **Les identités sont des copies, pas des liens.** `driverEntraId`, `userEntraId`, e-mails et noms sont
   recopiés dans les trajets, passagers et journaux : changer de méthode d'authentification (G8) change le sens
   de ces identifiants et impose de migrer ou d'aligner les `entraId` existants (D1).
7. **Le jeton JWT garde `isAdmin` à la connexion, les gardes relisent la base.** Ne pas s'appuyer sur
   `session.user.isAdmin` pour une décision de sécurité (affichage seulement).
8. **`NEON_PROJET_ID` s'écrit avec « PROJET »** (faute figée dans `actions.ts`), et ni elle ni `NEON_API_KEY` ne
   sont dans `.env.example`.
9. **Dépôt en CRLF sous Windows** : un test qui lit un fichier figé peut casser après un checkout en CRLF ; à
   noter ici si cela arrive. Les heredocs du shell avalent des antislashs : écrire les fichiers avec l'outil
   d'écriture.
10. **Les anciens documents de pilotage** (`docs/errors/errors.md`, `docs/context/task.md`,
    `docs/prompt/prompt.md`, `docs/context/résumé SAD.md`) décrivaient un fonctionnement par phases du SAD ; le
    présent plan les remplace. Retirés à l'étape 0 (2026-10-28), ils restent lisibles dans l'historique Git.

---

## 5. Étapes

> Les étapes 1 à 4 sont des **ébauches proposées le 2026-10-26** : à confirmer par le propriétaire avant de
> commencer. Elles ne cochent rien tant que leur contenu n'est pas validé.

### Étape 0 — Recentrer le dépôt ✅ (2026-10-26)

- [x] Branche `dev-claude` créée depuis `jules`.
- [x] Ce plan.
- [x] `architecture/mise-en-production.md` : l'état réel du code, écrit à partir des fichiers.
- [x] `memory/memory-exploitation.md` et `edgecase.md`.
- [x] `docs/README.md` : l'index.
- [x] `CLAUDE.md` réécrit autour de ce plan.
- [x] Validation du propriétaire (2026-10-28).
- [x] Retrait (`git rm`) de `context/task.md`, `prompt/prompt.md`, `context/résumé SAD.md`, `errors/errors.md`
      (repris au §4), de `message-IT.md` et de `fix_eslint.sh` — accord du propriétaire le 2026-10-28.

Aucun code modifié : pas de suite de tests à rejouer (tsc et lint donnent les mêmes chiffres qu'au départ).

### Étape 1 — Gardes serveur et tests (ébauche)

**À trancher en début d'étape :** D2, D3, D4, D7.

- [ ] Installer le cadre de tests et ajouter le script `npm test` ; remplacer `tests/admin_delegation.ts`.
- [ ] Tests d'abord, vus en échec, puis correctifs : cas limites 1, 2, 3 (passagers, retrait, décalage).
- [ ] Tests des règles de `permission-checker.ts` et de `findPersonConflict` / `findVehicleConflict`.
- [ ] Table de référence des droits par route (`test/helpers/access-policy.ts`) lue par un test contre le code,
      reprise dans l'architecture §4.
- [ ] Retirer les `console.log/error` de débogage (cas limite 9) ; valider les corps JSON (cas limite 6).
- [ ] Convertir `middleware.ts` en `proxy.ts` (D4).

**Docs :** architecture §2, §4, §7, §8 ; `edgecase.md` ; CLAUDE.md (commandes) ; README (scripts).

### Étape 2 — Authentification de production (ébauche, bloquée par D1)

**À trancher en début d'étape :** D1.

- [ ] Appliquer la spécification donnée par le propriétaire (méthode, liste blanche, identité).
- [ ] Supprimer le fournisseur de développement, les comptes codés en dur et l'administrateur `TO_BE_CONFIGURED`
      (cas limite 5) ; adapter `/api/users/search`, `seed.ts`, `.env.example`.
- [ ] Tests d'abord pour la garde de connexion.

**Docs :** architecture §2, §5 ; mémo §1 ; `edgecase.md`.

### Étape 3 — Polish (ébauche, phase 11 du SAD)

**À trancher en début d'étape :** D5.

- [ ] Corriger les erreurs ESLint ; `npm run lint` sans erreur.
- [ ] États de chargement, états vides, pages d'erreur ; responsive (375, 768, 1280 px).
- [ ] `npm run build` sans erreur ; convertir `README.md` en UTF-8 sur accord.

**Docs :** architecture §3, §6, §9 ; README.

### Étape 4 — Mise en ligne et notifications (ébauche)

**À trancher en début d'étape :** D6.

- [ ] Créer le projet d'hébergement et poser les variables (le propriétaire pose les valeurs, l'agent guide).
- [ ] Écrire la procédure de livraison et la vérification en ligne (mémo §4) ; CI.
- [ ] Notifications mail si D6 les conserve.

**Docs :** mémo d'exploitation, architecture §1 et §9, CLAUDE.md.

---

## 6. Hors périmètre

- Microsoft Entra ID et Graph (G8).
- Nouvelles fonctionnalités métier non demandées (nouveaux types de trajet, autres campus).
- Les projets `app-vc` et `les-petits-pronos-de-la-promo` de Vercel, et tout projet Neon non confirmé (D7).
- Spécifications d'origine : [`SAD.md`](../SAD.md), [`Cahier des charge.md`](../Cahier%20des%20charge.md)
  (lecture seule).

---

## 7. Récapitulatif des fichiers

Les fichiers touchés par une étape se lisent dans son commit (`git show --stat <commit>`) ; le journal (§9)
donne les commits.

---

## 8. Documentation à mettre à jour, étape par étape

Chaque étape nomme ses docs (§5). Dans tous les cas : le journal (§9), le statut en tête de ce document, la
section « Phase en cours » de `CLAUDE.md`, [`README.md` de docs](../README.md) si un document est ajouté ou
retiré, et [`architecture/mise-en-production.md`](../architecture/mise-en-production.md) dès que le code qu'elle
décrit change.

---

## 9. Journal de progression

| Date | Étape | Fait | Reste / surprises |
|---|---|---|---|
| 2026-10-26 | 0 | **Départ vérifié.** Branche `jules` sur `1080aa7` ; `dev-claude` créée ; `npx tsc --noEmit` : 0 erreur ; `npm run lint` : 18 problèmes (15 erreurs, 3 avertissements) ; aucun test automatisé, aucune CI ; arbre propre. Note : le statut Git du début de session montrait `.mcp.json` non suivi ; il a été committé entre-temps (`1080aa7`). | Aucun déploiement Vercel de ResaVroom ; deux projets Neon sans lien établi avec ResaVroom (D7). |
| 2026-10-26 | 0 | **Choix du propriétaire** : G1 à G8. Entra ID abandonné (G8) : la suite fonctionnelle sera spécifiée plus tard. | Étapes 1 à 4 laissées en ébauche. |
| 2026-10-26 | 0 | **Architecture installée** : plan, `architecture/mise-en-production.md`, `memory/memory-exploitation.md`, `edgecase.md` (10 cas), `docs/README.md`, `CLAUDE.md`, mémoire de l'agent. Aucun code modifié. Relevé : 4 écarts de règles métier non appliquées côté serveur (EC 1 à 4), provider de développement actif (EC 5). | Retrait des anciens documents en attente d'accord ; conversion du `README.md` (Windows-1252) en attente d'accord. Rien n'est commité. |
| 2026-10-28 | 0 | **Étape 0 validée** par le propriétaire, au début de la session du prompt guidé P-01 du portail. Retrait accordé et fait : les quatre anciens documents de pilotage, `message-IT.md`, `fix_eslint.sh` ; index et architecture §9 mis à jour. `npx tsc --noEmit` : 0 erreur ; `npm run lint` : 18 problèmes (15 erreurs, 3 avertissements), inchangé. Étape commitée seule, à la demande du propriétaire. | Conversion du `README.md` (Windows-1252) toujours en attente (étape 3). |
