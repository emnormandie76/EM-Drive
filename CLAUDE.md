# ResaVroom (dépôt EMN-resaVroom)

**ResaVroom** est une application web interne de réservation de véhicules et de covoiturage entre trois
campus (Le Havre, Caen, Paris), pour les salariés d'une entreprise. Elle fonctionne en développement et n'est
pas déployée. On s'y connecte par le **portail admission** (G9, contrat portail v1), branché à l'étape 2a sur le
poste (client `dev`, `http://localhost:3002`).

- **Next.js 16.2** (App Router) et **React 19**, TypeScript strict : pages, routes API et actions serveur.
- **Prisma 7.7** avec l'adaptateur Neon (WebSocket) ; **NextAuth v4** (JWT) ; SWR, Sonner, Lucide.
- **PostgreSQL chez Neon** : une base configurée par `DATABASE_URL`, le projet `resavroom`
  (`wispy-shadow-66847588`), créé par l'intégration Neon de Vercel (D7), migré (deux migrations) et seedé.
  L'ancienne base `neon-cyclamen-river` (compte Anton1P) n'est plus utilisée. Lectures sur ce seul projet ;
  migration et seed sur accord.
- **Hébergement** : aucun à ce jour (Vercel visé). Dépôt : `github.com/emnormandie76/EMN-resaVroom`.

## Documents de référence

[`docs/README.md`](docs/README.md) est l'index de la documentation.

| Document | Rôle |
|---|---|
| [docs/features/mise-en-production.md](docs/features/mise-en-production.md) | **le plan** : décisions (§2), pièges (§4), étapes (§5), journal (§9) |
| [docs/architecture/mise-en-production.md](docs/architecture/mise-en-production.md) | **l'état réel du code** |
| [docs/memory/memory-exploitation.md](docs/memory/memory-exploitation.md) | exploitation : variables, base, services externes |
| [docs/edgecase.md](docs/edgecase.md) | cas limites et parades |
| [docs/SAD.md](docs/SAD.md), [docs/Cahier des charge.md](docs/Cahier%20des%20charge.md) | spécifications d'origine (lecture seule) |
| [README.md](README.md) | démarrage pour les humains |

## Phase en cours

Chantier « mise en production » ([plan](docs/features/mise-en-production.md)), branche `dev-claude` :

- **étape 0 faite** (2026-10-26) et validée (2026-10-28) : architecture de contexte installée, anciens documents
  retirés, aucun code modifié ;
- **D1 tranchée** (2026-10-28) : connexion par le portail (G9 ; prompt guidé P-01 du portail, contrat portail
  v1). L'étape 0 de ce branchement (préparation, sans code) est faite, validée et commitée (2026-10-28) ;
- **étape 1 faite et validée** (2026-10-28) : Vitest, cas limites 1, 2, 3, 9 et 6 (zod), `src/proxy.ts`,
  projet Neon neuf migré et seedé, `README.md` réécrit ;
- **étape 2a faite et validée** (2026-10-28, commit `25a24c0`) : connexion par le portail (fournisseur OIDC
  `portail`, table `people`, colonnes `*_sub`, 8 h fixes, cookies `resavroom.*`, déconnexion par le portail),
  décisions D17 à D23, migration `20261028160000_portail_identity` appliquée, essai réel conforme ;
- **étape 2b faite et validée** (2026-10-28) : recherche par l'annuaire du portail
  (`src/lib/portail-directory.ts`, `server-only`), identité d'une autre personne lue dans l'annuaire (écart 5),
  passagers choisis dans l'annuaire (cas limite 11), décisions D24 à D28, essai réel conforme, annuaire refermé ;
- **étape 3 faite et validée** (2026-10-29) : polish. D5, D30 à D36 : ESLint à 0 sans
  `eslint-disable` ; pages Next en français à la racine (`error`, `global-error`, `not-found`, `loading`) ; états
  communs (`PageState`, `fetch-json`) ; responsive vérifié à 375, 768 et 1280 px ; utilitaires CSS définis dans
  `globals.css` (pas de Tailwind) ; mentions de mails retirées ; cas 10 (409), cas 8 (filtre sur la fin des trajets,
  modale), « mes trajets » filtrés par le serveur, métriques Neon au clic ; build vert (`DATABASE_URL` factice) ;
- **ensuite** : 4 (mise en ligne et notifications), dernière étape du chantier.

L'étape en cours se lit dans le journal du plan (§9).

## Règles pour tout agent

1. **Avant toute action**, lire dans le plan le journal (§9), le mode d'emploi (§0), les pièges (§4) et la
   section de l'étape en cours, puis l'état du code. En fin de session, compléter le journal : fait, reste,
   surprises, écarts au plan et leur raison.
2. **Une étape à la fois.** Ne pas commencer la suivante tant que les cases ne sont pas cochées, que les
   vérifications ne sont pas vertes **et** que le propriétaire n'a pas validé.
3. **Ce qui revient au propriétaire** : valeurs des variables d'environnement, identité du projet Neon, accès,
   déploiement, déclaration de ResaVroom au portail et ouverture de l'annuaire (avec le super-admin du
   portail). S'arrêter, le guider pas à pas sans jamais lui demander de secret dans le chat, vérifier, puis
   consigner au journal.
4. **Ne pas s'écarter** du plan ni de l'architecture de sa propre initiative. En cas de doute, exposer le
   problème avec deux options et une recommandation (questions à cocher), puis consigner au journal.
5. **Un test qui échoue** ne se désactive pas et ne s'affaiblit pas. Quand le propriétaire change une règle,
   l'attendu du test change avec elle, et le journal le dit.
6. **En fin d'étape** : `npm test`, `npx tsc --noEmit` et `npm run lint` ;
   mettre à jour les docs de contexte pour qu'elles décrivent ce que le code fait réellement ; faire un compte
   rendu, puis s'arrêter.
7. **Dépenses et réseau.** Aucun appel payant ou à quota (OpenRouteService, API Neon) sans accord explicite ;
   les tests ne touchent jamais le réseau externe.
8. **Base de données.** Lectures libres ; toute écriture, migration ou suppression exige l'accord du
   propriétaire, à chaque fois. Interdits : `migrate reset`, `db push --force-reset`, `DROP`, `TRUNCATE`,
   `deleteMany` sans filtre, et tout script qui écrit dans la base réelle (l'ancien `tests/admin_delegation.ts`,
   qui vidait les trajets, est retiré : ne pas le restaurer). Seule exception accordée à ce jour : la
   suppression de `admins`, `authorized_services` et de l'ancien type `AuditAction` dans la migration de
   l'étape 2a (D17, D18), déjà appliquée.
   Une migration se rédige à la main et ne se modifie plus une fois appliquée.
9. **Sécurité.** Tout accès passe par `requireAuthSession()` / `requireAdminSession()`
   ([src/lib/api-helpers.ts](src/lib/api-helpers.ts)) ; le rôle est relu en base, jamais déduit du jeton. La
   table des gardes par route est dans l'architecture §4 ; les écarts connus sont dans l'architecture §8 et
   `docs/edgecase.md`.
10. **Parties à ne pas modifier.** `src/generated/prisma/` (généré), `docs/SAD.md` et `docs/Cahier des charge.md`
    (spécifications d'origine), la branche `main`.
11. **Next.js.** Lire le guide concerné de `node_modules/next/dist/docs/` avant de toucher au code Next
    (voir AGENTS.md).

## Modèle

Opus. Si la session tourne sur un autre modèle, le signaler à l'utilisateur en début de session.

## Conventions

- Échanges et documentation en français.
- Code en anglais ; commentaires et docstrings en français ; messages de commit en français, au format
  `feat(portée): …`, `fix(portée): …`, `docs(portée): …`.
- Interface en français, vouvoiement.
- Le poste est sous Windows 11 (PowerShell ; Bash disponible). Les fichiers s'écrivent avec l'outil d'écriture,
  pas avec un heredoc.
- **Secrets** : `.env` et `.env.local` appartiennent au propriétaire. Ne jamais les lire, les afficher, les
  modifier ni les committer. La liste des variables est dans `.env.example` et dans le mémo d'exploitation.
- **Branches.** Branche de travail : `dev-claude` (depuis `jules`). Existantes : `main`, `jules` (distante
  `origin`). Pas de commit ni de push sans demande explicite. Push : `git push -u origin dev-claude`.
- Ne jamais écrire un fichier par une chaîne PowerShell entre guillemets doubles : les accents graves
  (`` `b ``, `` `n ``) y sont des échappements (piège 5 du plan, qui a abîmé l'ancien `README.md`).

## Services externes (MCP)

Configurés dans [.mcp.json](.mcp.json). Périmètre commun : lectures permises, toute écriture sur accord, aucun
secret. Aucun de ces services n'héberge encore ResaVroom.

**Neon** — D7 tranchée le 2026-10-28. **Projet confirmé : `resavroom` (`wispy-shadow-66847588`)**, branche
`main` (`br-sparkling-snow-bal3lt7i`), dans l'organisation « Vercel: EM-Normandie » (gérée par Vercel). Le MCP
voit toute l'organisation : passer toujours `project_id` explicitement. Jamais touchés : `portail-admission`
(`shy-art-03916923`, le portail), `vc-bdd` (`noisy-credit-34683167`), `neon-bisque-pillar`
(`gentle-thunder-89807010`), et l'ancienne base `neon-cyclamen-river` (compte Anton1P).

| | Outils |
|---|---|
| **Permis sans demander** | `list_projects`, `describe_project`, `list_branches`, `describe_branch`, `get_database_tables`, `describe_table_schema`, `list_slow_queries`, `explain_sql_statement`, `run_sql` en `SELECT` seulement — sur un projet confirmé |
| **Avec l'accord du propriétaire, à chaque fois** | `run_sql` / `run_sql_transaction` en écriture, `prepare_database_migration`, `complete_database_migration`, `create_branch`, `reset_from_parent`, `restore_snapshot`, tout `update_*` et `create_*` |
| **Jamais** | `get_connection_string`, `*_credential`, `reset_postgres_role_password`, `get_realtime_secret`, `rotate_*`, tout `delete_*`, `recover_project` |

**Vercel** — aucun projet ResaVroom. Ne pas toucher `app-vc` ni `les-petits-pronos-de-la-promo`.

| | Outils |
|---|---|
| **Permis sans demander** | `list_projects`, `get_project`, `list_deployments`, `get_deployment`, `list_deployment_events`, `get_runtime_logs`, `get_runtime_errors` |
| **Avec l'accord du propriétaire, à chaque fois** | `create_project`, `create_deployment`, `update_project`, domaines, alias, promotion et retour arrière, pare-feu |
| **Jamais** | `get_project_env`, `filter_project_envs`, `create_project_env`, `edit_project_env`, `get_shared_env_var`, jetons Edge Config, clés KMS, tout ce qui lit ou change un secret |

**GitHub** (dépôt `emnormandie76/EMN-resaVroom`) — jeton lu dans la variable `GITHUB_MCP_PAT`, jamais affiché.

| | Outils |
|---|---|
| **Permis sans demander** | `get_file_contents`, `list_branches`, `list_commits`, `get_commit`, `search_code`, `actions_get`, `actions_list`, `get_job_logs` |
| **Avec l'accord du propriétaire, à chaque fois** | `create_branch`, `create_or_update_file`, `push_files`, `delete_file`, `actions_run_trigger`, `create_repository`, `fork_repository` |
| **Jamais** | `delete_repository`, tout ce qui touche à `main` |

**Portail admission** (<https://portail-admission.vercel.app>) — fournisseur d'identité de ResaVroom (G9),
qui n'est pas à elle. **Jamais** : écrire dans `../portail`, appeler un MCP sur ses ressources (dépôt
`emnormandie76/portail-admission`, projets Vercel et Neon `portail-admission`), demander ou lire
`PORTAIL_CLIENT_SECRET`, créer un compte de test, **travailler dans l'administration du portail, même dans la
session du propriétaire** (D29 du portail, G25) : un réglage du portail à changer (annuaire, grille, client) se
signale au propriétaire, qui le fait lui-même ou le confie à l'agent du portail. Contrat appliqué : contrat portail v1
(`../portail/docs/architecture/contrat-apps.md`, lecture seule) ; il ne se discute pas dans ce dépôt.
ResaVroom y est déclarée (2026-10-28) : restreinte, rôles `USER` et `ADMIN`, client `dev` seul sur
`http://localhost:3002`, annuaire **fermé** sur le client `dev` (ouvert pour l'étape 2b, refermé le 2026-10-28
à 16 h 59 ; le rouvrir revient au super-admin), propriétaire dans la grille en `ADMIN` (détails dans le mémo §3).
Sans annuaire, la recherche de collègues répond 503 : c'est attendu. Pour se connecter à ResaVroom sur le poste, il faut un rôle dans la grille : le demander au
super-admin du portail.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement sur le port 3002 (D12, adresse connue du portail ; base de `DATABASE_URL`). Arrêter sa tâche ne tue pas son processus `node` : l'arrêter par son port, après avoir vérifié sa ligne de commande |
| `npm test` | Vitest : aucun réseau, aucune base, portail imité (242 tests, 15 fichiers, à la fin de l'étape 3) |
| `npx tsc --noEmit` | contrôle des types (0 erreur) |
| `npm run lint` | ESLint : 0 problème depuis l'étape 3 (D5), sans aucun `eslint-disable` hors `src/generated/` ; n'en ajouter aucun |
| `npx next typegen` | régénère les types de routes de `.next/types` après le retrait d'une route (sinon `tsc` cite l'ancienne) ; `.next/dev/types`, laissé par `next dev`, se régénère au `next dev` suivant ou peut être effacé (cache ignoré par Git) |
| `npm run build` | build de production (vert depuis l'étape 3). Serveur de dev arrêté ; avec une `DATABASE_URL` factice dans son seul processus (`DATABASE_URL="postgresql://build:build@build.invalid:5432/build" npm run build`), pour qu'il ne puisse pas lire la base partagée (D30) ; puis `tsc` (piège 14) |
| `npx prisma generate` | régénère le client dans `src/generated/prisma/` |
| `npx prisma migrate dev` / `migrate deploy` | applique une migration — **accord du propriétaire requis** ; lit `DATABASE_URL_UNPOOLED` de `.env.local` (D15) ; port 5432, fermé sur le réseau de l'entreprise (mémo §2) |
| `npx prisma db seed` | écrit les données de départ — **accord du propriétaire requis** |
| `npx prisma studio` | interface sur la base partagée — **accord du propriétaire requis** |

@AGENTS.md
