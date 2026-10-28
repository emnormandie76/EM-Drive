# ResaVroom (dépôt EMN-resaVroom)

**ResaVroom** est une application web interne de réservation de véhicules et de covoiturage entre trois
campus (Le Havre, Caen, Paris), pour les salariés d'une entreprise. Elle fonctionne en développement, derrière
un fournisseur de connexion de développement ; elle n'est pas déployée. Elle se connectera par le **portail
admission** (G9, contrat portail v1), à l'étape 2a du plan.

- **Next.js 16.2** (App Router) et **React 19**, TypeScript strict : pages, routes API et actions serveur.
- **Prisma 7.7** avec l'adaptateur Neon (WebSocket) ; **NextAuth v4** (JWT) ; SWR, Sonner, Lucide.
- **PostgreSQL chez Neon** : une base configurée par `DATABASE_URL`. Base actuelle : projet `neon-cyclamen-river`
  du compte Anton1P ; projet neuf `resavroom` (`wispy-shadow-66847588`), créé par l'intégration Neon de Vercel,
  encore vide (D7). Lectures sur ce seul projet ; migration et seed sur accord.
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
- **ensuite**, dans l'ordre : 2a (connexion par le portail), 2b (annuaire), 3 (polish), 4 (mise en ligne).

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
   qui vidait les trajets, est retiré : ne pas le restaurer).
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
`PORTAIL_CLIENT_SECRET`, créer un compte de test. Contrat appliqué : contrat portail v1
(`../portail/docs/architecture/contrat-apps.md`, lecture seule) ; il ne se discute pas dans ce dépôt.
ResaVroom y est déclarée (2026-10-28) : restreinte, rôles `USER` et `ADMIN`, client `dev` seul sur
`http://localhost:3002`, annuaire fermé, grille vide (détails dans le mémo §3).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement (base de `DATABASE_URL`) ; d'ici l'étape 2a, `npm run dev -- -p 3002` (`NEXTAUTH_URL` est sur 3002) |
| `npm test` | Vitest : aucun réseau, aucune base (146 tests à la fin de l'étape 1) |
| `npx tsc --noEmit` | contrôle des types (0 erreur) |
| `npm run lint` | ESLint (17 problèmes depuis l'étape 1, tous antérieurs ; corrigés à l'étape 3) |
| `npm run build` | build de production |
| `npx prisma generate` | régénère le client dans `src/generated/prisma/` |
| `npx prisma migrate dev` / `migrate deploy` | applique une migration — **accord du propriétaire requis** ; lit `DATABASE_URL_UNPOOLED` de `.env.local` (D15) ; port 5432, fermé sur le réseau de l'entreprise (mémo §2) |
| `npx prisma db seed` | écrit les données de départ — **accord du propriétaire requis** |
| `npx prisma studio` | interface sur la base partagée — **accord du propriétaire requis** |

@AGENTS.md
