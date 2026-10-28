# Chantier — Mise en production de ResaVroom

> **Statut au 2026-10-28 :** étape 0 faite et validée (commit `1436416`). **D1 tranchée** : la connexion se fait
> par le **portail admission** (G9 ; prompt guidé P-01 du portail, contrat portail v1). L'étape 0 de ce
> branchement (préparation, sans code) est faite, validée et commitée (2026-10-28). **D7 tranchée** :
> projet Neon neuf `resavroom`, migré et seedé. **Étape 1 faite et validée le 2026-10-28.** **Étape 2a faite et validée le
> 2026-10-28** (connexion par le portail, essai réel conforme ; commit `25a24c0`). Prochaine : 2b (annuaire).
> Ordre des étapes : 1, 2a, 2b, 3, 4 (D13). Les étapes 3 et 4 restent des ébauches. Le détail de chaque étape
> est au §5, son histoire au journal (§9).
> **Branche de travail :** `dev-claude` (créée depuis `jules`).
> **Source :** [`SAD.md`](../SAD.md) et [`Cahier des charge.md`](../Cahier%20des%20charge.md) (spécifications
> d'origine, phases 0 à 11 du SAD) ; échange avec le propriétaire du 2026-10-26 ; prompt guidé P-01 du portail
> (`../portail/docs/prompts/P-01-appVoiture-connexion-portail.md`, émis le 2026-10-28) et contrat portail v1
> (`../portail/docs/architecture/contrat-apps.md`). Ces deux chemins partent de la racine du dépôt et désignent
> le dépôt voisin du portail, sur le poste : lecture seule.
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
- **Tests d'abord** pour tout ce qui garde ou protège (droits, capacités, conflits, connexion) : écrire le test
  qui montre le défaut, le voir échouer, puis corriger.
- **Un test qui échoue ne se désactive pas et ne s'affaiblit pas.** Quand le propriétaire change une règle,
  l'attendu du test change avec elle, et le journal nomme la décision et le test touché.
- **Documentation au fil de l'eau**, en premier lieu
  [`architecture/mise-en-production.md`](../architecture/mise-en-production.md), puis la « Phase en cours » de
  `CLAUDE.md` et l'index.
- Ne commiter et ne pousser que si le propriétaire le demande. Un commit par étape, au format du dépôt
  (`feat(portée): …`, `fix(portée): …`, en français).
- **Le portail n'est pas à nous.** Le contrat portail v1 se lit dans le dépôt du portail et ne se discute pas
  ici : un point qui ne convient pas se signale au propriétaire, et le portail émet un prompt correctif ou une
  nouvelle version. Déclarer ResaVroom, ses rôles, ses clients et ouvrir l'annuaire revient au super-admin du
  portail (G12), avec l'agent du portail ; ResaVroom fournit les informations dans ses comptes rendus.
  **Rendez-vous avec le portail** : à la fin de l'étape 2a (essai), au début de l'étape 2b (ouverture de
  l'annuaire) et avant l'étape 4 (client de production). Le propriétaire fait le lien.
- **Interdits, sans exception** (repris de `CLAUDE.md`) : lire, afficher, modifier ou committer `.env` et
  `.env.local` ; écrire dans la base Neon, appliquer une migration ou déployer sans accord explicite ; lancer
  `tests/admin_delegation.ts` ; toute commande destructrice (`migrate reset`, `DROP`, `TRUNCATE`, `deleteMany`
  sans filtre) ; lire ou changer un secret par MCP ; toucher `main` ; écrire dans `../portail` ou appeler un MCP
  sur les ressources du portail (dépôt `emnormandie76/portail-admission`, projets Vercel et Neon
  `portail-admission`) ; demander ou lire `PORTAIL_CLIENT_SECRET` ; créer un compte de test dans le portail.
- **Migrations** : rédigées à la main, jamais modifiées une fois appliquées, appliquées avec l'accord du
  propriétaire (mémo d'exploitation §2).

---

## 1. Pourquoi

ResaVroom fonctionne en développement (phases 0 à 9 du SAD faites, voir §3) mais n'est pas prêt à être mis en
ligne : l'authentification est un fournisseur de développement, la base n'a aucun test automatisé, plusieurs
règles métier ne sont pas appliquées côté serveur (cas limites 1 à 4 de [`edgecase.md`](../edgecase.md)), et
aucun hébergement ni procédure de livraison n'existe. Le chantier amène l'application à un état déployable.

L'authentification Microsoft Entra ID prévue par le SAD est **abandonnée** (G8). Elle est remplacée par la
**connexion par le portail admission** (G9) : le portail (<https://portail-admission.vercel.app>) est le
fournisseur d'identité OIDC et la seule source des accès des applications internes de l'équipe. ResaVroom est
la première application branchée.

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
| G8 | **Microsoft Entra ID est abandonné.** La nouvelle méthode d'authentification sera spécifiée par le propriétaire dans un prochain prompt. Conséquences : `message-IT.md`, le bloc Entra de `src/lib/auth.ts`, les permissions Graph du SAD et les mails par Graph (phase 10 du SAD) sont à redéfinir. Méthode spécifiée le 2026-10-28 : G9. | propriétaire |

### 2.2. À trancher au début de leur étape

| # | Étape | Question | Recommandation |
|---|---|---|---|
| D1 | 2 | Quelle méthode d'authentification de production, et comment s'appliquent la liste blanche `authorized_services` et l'identité (`entraId`) ? | **Tranchée le 2026-10-28** : connexion par le portail (G9, §2.3). |
| D2 | 1 | Quel cadre de tests et sur quelle base ? | Vitest, avec les services testés contre une branche Neon jetable du projet neuf (créée sur accord) ou des mocks Prisma pour les règles pures ; les tests ne touchent jamais le réseau externe ni la base réelle. Coût : une branche Neon de plus (quota gratuit à surveiller) contre des tests moins fidèles avec des mocks. |
| D3 | 1 | Que faire des cas limites 1 à 3 (passagers, retrait, décalage d'horaire) : corriger côté serveur ? | Corriger tous les trois, tests d'abord : appliquer `canJoinAsPassenger`/`canLeaveTrip` dans les services, réserver `addedBy: "DRIVER"` au conducteur ou à l'admin, revérifier les conflits dans `updateDepartureTime`. |
| D4 | 1 | Convertir `middleware.ts` en `proxy.ts` (convention de Next 16) ? | Oui, par `npx @next/codemod@latest middleware-to-proxy .`, à faire dans l'étape 1 après lecture de `node_modules/next/dist/docs/`. |
| D5 | 3 | Corriger les 15 erreurs ESLint maintenant ou les laisser ? | Les corriger : `npm run lint` doit devenir un contrôle de fin d'étape fiable. |
| D6 | 4 | Les notifications mail (phase 10 du SAD) sont-elles encore voulues, et par quel canal ? | À spécifier par le propriétaire (le canal Graph prévu dépendait d'Entra ID ; les notifications sont hors du contrat du portail). |
| D7 | 1 | Quel projet Neon est celui de ResaVroom ? Existe-t-il une base distincte pour la production ? | **Tranchée le 2026-10-28 par le propriétaire.** La base actuelle est le projet Neon `neon-cyclamen-river` du compte Anton1P ; `vc-bdd` et `neon-bisque-pillar` ne sont pas à ResaVroom. Le propriétaire **crée lui-même un projet neuf** sur le compte emnormandie76, dans la console Neon, et pose la nouvelle `DATABASE_URL` dans `.env.local`. L'agent ne touche à aucun projet Neon et ne lance ni migration ni seed sans son accord. Les données de `neon-cyclamen-river` ne sont pas reprises. **Projet neuf créé le 2026-10-28** par l'intégration Neon de Vercel (et non dans la console Neon) : `resavroom`, identifiant `wispy-shadow-66847588`, région `aws-eu-central-1`, Postgres 18, organisation Neon « Vercel: EM-Normandie » (`org-long-unit-38729916`, gérée par Vercel), branche `main` (`br-sparkling-snow-bal3lt7i`, protégée contre la suppression par Vercel), base vide. Voir piège 12 et D15. |
| D15 | 1 | La CLI Prisma ne lit que `.env` (piège 12) alors que la nouvelle `DATABASE_URL` va dans `.env.local` : comment éviter qu'une migration vise l'ancienne base ? | `.env.local` porte, comme Vercel le fera en production, `DATABASE_URL` (pooled : application et seed, par WebSocket) et `DATABASE_URL_UNPOOLED` (directe). Recommandation : `prisma.config.ts` charge `.env.local` puis `.env`, comme `prisma/seed.ts`, et donne `DATABASE_URL_UNPOOLED` à la CLI (les migrations veulent une connexion directe) ; ajouter ce nom à `.env.example`. D'ici là, aucune commande `prisma migrate`. Autre option : le propriétaire recopie l'adresse directe dans `.env`. |
| D16 | 4 | Mode d'accès au portail à la mise en ligne : restreinte, ou ouverte avec `USER` par défaut (G19) ? | À poser au début de l'étape 4 (D9). |

### 2.2 bis. Tranchées au début de l'étape 1 (2026-10-28)

Toutes par le propriétaire, recommandation retenue.

| # | Réponse |
|---|---|
| D2 | **Vitest, Prisma simulé.** `npm test` ne touche ni le réseau ni une base (règle 7) : règles pures testées directement ; services testés avec un client Prisma simulé. Limite assumée : la requête SQL de chevauchement n'est pas exécutée, seule sa forme est vérifiée. |
| D3 | **Corriger les cas limites 1, 2 et 3**, tests d'abord vus en échec. Le 2 suit le SAD (« le conducteur peut retirer un passager qu'il a ajouté (`addedBy = DRIVER`) ») et le cahier des charges (« un passager peut se retirer à tout moment avant le départ »). |
| D4 | **Renommer `middleware.ts` en `proxy.ts` à la main** (`git mv`, contenu inchangé) : la doc de Next 16 (`01-app/03-api-reference/03-file-conventions/proxy.md`) accepte l'export par défaut et fait tourner le proxy en Node.js ; le codemod n'aurait rien fait de plus ici. *Complété en cours d'étape* : le fichier va dans `src/` et sa fonction est écrite (`withAuth`), voir piège 3 et la ligne suivante. |
| — | **Proxy : pages seulement** (question posée en cours d'étape, après la découverte du piège 3) : il redirige vers `/login` les pages sans session et exclut tout `/api`, dont les routes répondent 401 en JSON. |
| D15 | **`prisma.config.ts` charge `.env.local` puis `.env` et donne `DATABASE_URL_UNPOOLED` à la CLI** ; `.env.example` gagne ce nom. |
| — | **Contenu de l'étape 1 confirmé** tel qu'écrit. La validation des corps (EC 6) utilise **zod** et porte sur les routes qui survivent à l'étape 2a (trajets, passagers, véhicules, paramètres), pas sur `admins` ni `services`. |

### 2.3. Connexion par le portail (2026-10-28)

Source : **prompt guidé P-01 du portail, contrat portail v1.**

| # | Décision | Par qui |
|---|---|---|
| G9 | **D1 tranchée : la connexion se fait par le portail** (prompt guidé P-01 du portail, contrat portail v1). Plus de méthode de connexion propre : un fournisseur OIDC « portail » remplace le fournisseur de développement ; l'identité devient le `sub` du portail ; le rôle vient du portail à chaque connexion ; `admins`, `authorized_services` et `/admin/users` disparaissent ; la recherche de collègues passe par l'annuaire du portail. | propriétaire (portail G9) |

**Décisions du portail, recopiées telles quelles : décision du propriétaire, à ne pas rediscuter.** Leurs renvois
internes (« piège 1 », « D13 », « règle 4 ») désignent le plan et le `CLAUDE.md` du portail, pas ce document.

| # | Source | Décision |
|---|---|---|
| G10 | portail G1 | **Le portail est le fournisseur d'identité OIDC des applications** (connexion par redirections). Chaque application reste un projet Vercel séparé : ses variables, sa base, et la possibilité de la retirer. Écarté : un serveur unique pour tout ; un cookie partagé sur un domaine commun, impossible en `*.vercel.app` (piège 1) et qui obligerait toutes les applications à partager le même format de session. |
| G11 | portail G2 | **Le portail est la seule source des accès** : une grille personne × application × rôle. Les échanges vont dans un seul sens : la connexion OIDC (le portail transmet l'identité et le rôle) et l'annuaire en lecture (l'application consulte le portail). Chaque application déclare la liste de ses rôles, mais leur sens reste dans l'application (ses gardes). Écarté : la synchronisation des rôles dans les deux sens (conflits, boucles, écarts silencieux) ; les écrans de comptes et les listes blanches dans les applications. |
| G12 | portail G3 | **Seul le super-admin gère les accès.** Écarté : une délégation par application. |
| G13 | portail G4 | **Seules les adresses `@em-normandie.fr` sont acceptées**, sans exception. |
| G14 | portail G5 | **Une application peut être restreinte** : pour qui n'y a pas accès, elle n'apparaît pas sur le portail, et le portail refuse de l'y connecter. |
| G15 | portail G6 | **Un accès retiré prend effet à la prochaine connexion à l'application.** Écarté : une notification immédiate du portail vers l'application. Conséquence : les sessions des applications restent courtes (8 h ; MPPlike passe de 400 jours à 8 h, piège 8). |
| G16 | portail G7 | **L'agent du portail lit les autres applications et n'y écrit jamais.** Il rédige des prompts guidés pour leurs agents (`prompts/README.md`). Pour le retour, le propriétaire annonce « P-xx fait » ; l'agent du portail vérifie lui-même, en lecture seule (journal, cases et commit de l'application), puis consigne. |
| G17 | portail G9 | **appVoiture et les futures applications se connectent directement par le portail**, sans méthode de connexion propre. |
| G18 | portail D5 | **Comme appVC** : adresse et mot de passe choisi à la première connexion, sans e-mail ni preuve de possession. **Risque résiduel accepté** : qui connaît l'adresse d'un invité peut choisir le mot de passe avant lui. En plus, **le super-admin peut changer l'adresse** d'une personne ; `sub` ne change pas. |
| G19 | portail D6 | **Mode « ouverte » par application** : tout compte actif y entre avec le rôle par défaut ; un rôle de la grille l'emporte. |
| G20 | portail D10 | **Adresses de retour exactes seulement** : la production, l'adresse fixe d'**une** branche de recette, et un client `dev` limité à `localhost`. Les autres Preview n'ont pas de connexion. |
| G21 | portail D14 | **Adresse de production : `https://portail-admission.vercel.app`**, d'où `PORTAIL_ISSUER` = `https://portail-admission.vercel.app/api/auth` dans toutes les applications. Libre le 2026-10-28, c'est le nom du projet (D13) : Vercel l'attribue seul, sans domaine à ajouter ni redirection. Elle ne change plus : la changer oblige à reconfigurer chaque application. |
| G22 | portail D26 | **L'annuaire s'ouvre client par client**, au choix du super-admin, quel que soit l'environnement, `dev` compris ; fermé par défaut, et sa fermeture prend effet aussitôt. Risque accepté : le secret d'un client `dev`, sur le poste, lit les noms et adresses des personnes qui ont accès, tant que l'annuaire reste ouvert. |
| G23 | portail D27 | **Une première connexion lancée depuis une application finit sur l'accueil du portail** : la demande de l'application se perd, la tuile la ramène (connexion silencieuse). Rien à coder dans l'application. |
| G24 | portail D28 | **Une application pas encore en ligne se branche d'abord avec son seul client `dev`**, restreinte, contre le portail de production ; le client de production est obligatoire avant sa mise en ligne, pas avant. |

### 2.4. Questions du P-01, tranchées le 2026-10-28

Toutes par le propriétaire, recommandation retenue.

| # | Question | Réponse |
|---|---|---|
| D8 | Rôles et déclaration au portail | Deux rôles, `USER` (« Utilisateur ») et `ADMIN` (« Administrateur »), écrits ainsi dans le code. Identifiant `resavroom`, nom « ResaVroom », adresse d'accueil `http://localhost:3002/` jusqu'à la mise en ligne. Description retenue par le portail : « Réservation des véhicules de service et covoiturage entre les campus. » |
| D9 | Mode au branchement, puis à la mise en ligne | **Restreinte** tant que l'application n'est pas en ligne (G24). Le choix entre restreinte et ouverte avec `USER` par défaut se pose au début de l'étape 4 (D16). |
| D10 | Identité : où le `sub` et l'adresse se rencontrent, et ce que devient `entraId` | Une **table locale des personnes** (`sub` unique, adresse unique, nom, rôle, heure de dernière connexion) : elle porte le rapprochement du contrat (§3.2 : par `sub`, puis par l'adresse, puis création ; refus d'une adresse liée à un autre `sub`) et le rôle relu en base (règle 9 de `CLAUDE.md`). Les colonnes `*_entra_id` portent désormais le `sub` et sont **renommées `*_sub`** dans la même migration ; `admins` et `authorized_services` sont supprimées. |
| D11 | Bibliothèque | **Garder NextAuth v4.** Ses écarts au contrat (piège 11) se règlent par sa configuration et ses rappels, et les tests d'abord les prouvent. |
| D12 | Port fixe sur le poste | **3002**, écrit dans le script `dev` (`next dev -p 3002`), distinct de 3000 (le portail en local). Cookies NextAuth **renommés** avec un préfixe propre à ResaVroom. Adresse de retour du client `dev` : `http://localhost:3002/api/auth/callback/portail` ; adresse après déconnexion : `http://localhost:3002/login`. |
| D13 | Ordre | Le branchement vient **après l'étape 1** : il touche la garde de connexion, qui se teste d'abord. |
| D14 | Restes laissés au choix de ResaVroom (P-01 §4.1) | Retirer à l'étape 2a la route de débogage `/api/auth/check-admin` et la dépendance `@azure/msal-node`. |

### 2.5. Tranchées au début de l'étape 2a (2026-10-28)

Toutes par le propriétaire, recommandation retenue. Base relue avant (SELECT sur `wispy-shadow-66847588`) :
`admins` 1 ligne (`TO_BE_CONFIGURED`, du seed), `authorized_services` 0, `trips` 0, `passengers` 0, `audit_logs` 0.

| # | Question | Réponse |
|---|---|---|
| D17 | La suppression de `admins` et `authorized_services` (D10) contre la règle 8 (pas de `DROP`) | **Exception accordée**, pour ces deux tables seulement, dans la migration écrite à la main de l'étape 2a (son application reste soumise à l'accord du propriétaire). |
| D18 | Sort de `ADMIN_PROMOTED`, `ADMIN_REVOKED`, `SERVICE_ADDED`, `SERVICE_REMOVED` dans `AuditAction` | **Retirées** (journal vide, rien n'est perdu) : le type est recréé, avec la nouvelle valeur `SIGNIN_REFUSED` (connexion refusée, contrat §3.2). Le `DROP TYPE` de l'ancien type entre dans l'exception de D17. |
| D19 | Nom et forme de la table des personnes | Modèle **`Person`**, table **`people`** : `sub` unique et facultatif (pour l'étape « par l'adresse » du rapprochement), `email` unique, `name`, `role`, `last_login_at`, dates de création et de mise à jour. Pas de clé étrangère depuis les trajets, passagers et audit (copies, piège 6). |
| D20 | Rôle : énumération ou texte | **Énumération Prisma `Role` (`USER`, `ADMIN`).** Un rôle inconnu refuse la connexion (vers `/unauthorized`, consigné). |
| D21 | Admin `TO_BE_CONFIGURED` et données des comptes simulés | **Rien à reprendre** : l'admin du seed disparaît avec `admins`, le seed n'en crée plus, aucun trajet n'existe. Le premier administrateur est la personne qui reçoit `ADMIN` du portail. |
| D22 | Où faire le rapprochement du contrat §3.2 | **Rappel `signIn`** : rapprochement, écriture en base, refus consigné et renvoyé vers `/unauthorized`. **Rappel `jwt`** : pose `sub`, rôle (affichage), heure de connexion et `id_token` à la connexion, refuse le jeton 8 h après ; il ne lit pas la base. *Écart au texte du prompt de l'étape (« rappel jwt »)* : NextAuth v4 ne laisse que `signIn` choisir la page d'un refus. |
| D23 | Déconnexion par le portail | **Route serveur `POST /api/auth/logout`**, appelée par un formulaire : lit l'`id_token` dans le cookie, efface la session, renvoie (303) vers `end_session_endpoint` de la découverte avec `id_token_hint`, `client_id`, `post_logout_redirect_uri` ; vers `/login` sans session ou si le portail ne répond pas. |

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

1. **`tests/admin_delegation.ts` détruisait des données** (`prisma.trip.deleteMany()` sur la base réelle). Retiré
   à l'étape 1 ; ne jamais le restaurer. Les tests (`npm test`) ne touchent aucune base (D2).
2. **Prisma 7 change les conventions.** Le schéma n'a plus `url` : l'URL est dans `prisma.config.ts` ; le
   générateur est `prisma-client` avec `output` obligatoire (`src/generated/prisma/`) ; `PrismaNeon` reçoit un
   objet `{ connectionString }`, pas un `Pool` ; `"type": "module"` dans `package.json`. (Ancien
   `docs/errors/errors.md`.)
3. **Le proxy doit vivre dans `src/`, au niveau de `app/`.** `middleware.ts` était à la racine : Next l'ignorait,
   et aucune page n'a jamais été redirigée vers `/login` avant l'étape 1 (seules les gardes serveur
   protégeaient). Depuis l'étape 1 : `src/proxy.ts` (D4). Next n'accepte pas un réexport
   (`export { default } from …`) : la fonction doit être écrite dans le fichier (`export default withAuth(…)`),
   sinon erreur E903 au build. `tests/proxy.test.ts` garde ces trois points. Lire `node_modules/next/dist/docs/`
   avant de toucher à Next (AGENTS.md).
4. **Port 5432 bloqué sur le réseau de l'entreprise.** Le runtime passe par WebSocket (443) ; les commandes
   `prisma migrate` ouvrent du TCP direct et échouent sur ce réseau (migration initiale jouée via un partage de
   connexion mobile).
5. **`README.md` était en Windows-1252**, et son contenu abîmé par des échappements de PowerShell (`` `b ``,
   `` `n `` : émojis en `??`, blocs de code en `` `ash ``). Converti en UTF-8 par le propriétaire puis réécrit à la
   fin de l'étape 1 (2026-10-28). Leçon : ne jamais écrire un fichier par une chaîne PowerShell entre guillemets
   doubles ; utiliser l'outil d'écriture.
6. **Les identités sont des copies, pas des liens.** `driverSub`, `userSub` (ex-`driverEntraId`, `userEntraId`),
   e-mails et noms sont recopiés dans les trajets, passagers et journaux : changer de méthode d'authentification
   (G8) change le sens de ces identifiants. Réglé à l'étape 2a (D10) : renommés `*_sub`, ils portent le `sub` du
   portail ; aucune clé étrangère vers `people`.
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
11. **NextAuth v4 ne suit pas le contrat du portail sans réglage** (revérifié le 2026-10-28 dans
    `node_modules/next-auth` 4.24.14 et `openid-client` 5.7.1) :
    - `checks` vaut `["state"]` par défaut (`core/lib/providers.js`, l. 62) : il faut `["pkce", "state", "nonce"]`
      (PKCE en S256). `idToken` est déduit vrai dès que `wellKnown` vise `openid-configuration` (l. 61) ;
    - le client s'authentifie en `client_secret_basic` par défaut, mais `openid-client` passe en
      `client_secret_post` si la découverte n'annonce pas `client_secret_basic`. La découverte du portail
      l'annonce en premier (constaté par l'agent du portail le 2026-10-28) : pas de bascule attendue, mais le
      fixer dans `client` reste une précaution ;
    - en stratégie `jwt`, chaque lecture de la session repousse l'expiration (`core/routes/session.js`,
      `newExpires`) : `maxAge` seul donne une session glissante. Garder l'heure de connexion dans le jeton et
      refuser la session 8 h après ;
    - `signOut()` n'appelle pas `end_session_endpoint` : garder l'`id_token` reçu à la connexion et y envoyer
      le navigateur soi-même ;
    - le retour se fait sur `/api/auth/callback/<id>` ; avec `pages.error = "/login"`, une erreur OIDC revient
      sur `/login?error=…` : la page ne relance jamais le flux d'elle-même (boucle) ;
    - les cookies `next-auth.*` valent pour tous les ports de `localhost`, et appVC utilise les mêmes noms : les
      renommer (D12).

    Réglé à l'étape 2a (architecture §2.1), chaque point prouvé par `tests/auth.test.ts`, `tests/proxy.test.ts`
    ou `tests/logout.test.ts`. Deux suites : `withAuth` (proxy) lit le cookie par son nom, qu'il faut lui passer,
    et ne connaît pas l'heure de connexion, qu'il faut vérifier dans son rappel `authorized` ; seul le rappel
    `signIn` peut renvoyer un refus vers une page choisie (D22).
12. **La CLI Prisma ne lisait pas `.env.local`** (`import "dotenv/config"` charge `.env` seul) : une migration
    aurait visé l'ancienne base restée dans `.env`. Réglé à l'étape 1 (D15) : `prisma.config.ts` charge
    `.env.local` puis `.env` et lit `DATABASE_URL_UNPOOLED`. Avant toute migration, vérifier quand même la cible
    par son nom d'hôte (mémo §2).
13. **Vercel Hobby et dépôt privé** : seuls les commits dont l'auteur est le propriétaire de l'équipe Vercel se
    déploient (piège 5 du portail). Les commits de ce dépôt sont signés « PAREDE Antonin » (`user.name` n'est
    pas défini dans Git : le nom vient du compte Windows) ; ceux du portail et d'appVC, « emnormandie76 ». À
    régler avant l'étape 4.
14. **Types de routes périmés après le retrait d'une route** (étape 2a) : `.next/types` et `.next/dev/types`
    (écrits par `next dev` ou `next build`) citent encore les routes retirées, et `npx tsc --noEmit` échoue
    (TS2307). `npx next typegen` régénère `.next/types` ; `.next/dev/types` se régénère au `next dev` suivant
    ou s'efface (cache ignoré par Git).

---

## 5. Étapes

> Les étapes 1, 3 et 4 sont des **ébauches proposées le 2026-10-26**, à confirmer par le propriétaire avant de
> commencer. Les étapes 2a et 2b viennent du prompt guidé P-01 du portail (2026-10-28) ; elles remplacent
> l'ancienne étape 2 « Authentification de production ». Ordre : 1, 2a, 2b, 3, 4 (D13).

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
Commit `1436416`.

### Étape 1 — Gardes serveur et tests ✅ (2026-10-28)

**Tranchées en début d'étape :** D2, D3, D4, D15 (§2.2 bis), et le contenu de l'étape. **Tranchée avant :** D7.

- [x] Projet Neon neuf (D7) : créé par le propriétaire, qui a posé `DATABASE_URL` dans `.env.local` ; nom et
      identifiant consignés (D7, mémo, `CLAUDE.md`) le 2026-10-28.
- [x] D15 : `prisma.config.ts` charge `.env.local` puis `.env` et lit `DATABASE_URL_UNPOOLED` ; cible vérifiée
      (nom d'hôte seulement). Puis, avec l'accord du propriétaire, en partage de connexion :
      `npx prisma migrate deploy` et `npx prisma db seed` sur `wispy-shadow-66847588` ; tables et comptes
      vérifiés par le MCP Neon (lecture).
- [x] Cadre de tests : Vitest 4.1 (`vitest.config.ts`, `npm test`), client Prisma simulé (D2) ;
      `tests/admin_delegation.ts` retiré.
- [x] Tests d'abord, vus en échec (26 en échec, 79 au vert), puis correctifs : cas limites 1, 2, 3 ; capacité à
      la création.
- [x] Tests des règles de `permission-checker.ts` et de la forme de `findPersonConflict` / `findVehicleConflict`.
- [x] Table de référence des droits par route (`tests/helpers/access-policy.ts`) lue par un test contre le code,
      reprise dans l'architecture §4.
- [x] Traces de débogage retirées (cas limite 9) ; corps JSON validés par zod (cas limite 6, sauf limitation de
      débit).
- [x] `middleware.ts` converti en `src/proxy.ts` (D4), avec redirection des pages seulement (choix du
      propriétaire) ; essai réel : pages → 307 vers `/login`, API → 401.
- [x] Validation du propriétaire (2026-10-28), après la réécriture du `README.md`.

Vérifications de fin d'étape : `npm test` 146 tests verts (7 fichiers) ; `npx tsc --noEmit` 0 erreur ;
`npm run lint` 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs à l'étape.

Écarts au plan : tests rangés dans `tests/` (dossier existant) et non `test/` ; Vitest 4.1 et non 5 (Vitest 5
exige `@types/node` 22 ou plus) ; le proxy vit dans `src/` et exclut `/api` (découverte, voir journal) ; la
capacité est aussi contrôlée à la création d'un trajet (même défaut que le cas limite 1) ; `README.md` converti en
UTF-8 par le propriétaire puis réécrit en fin d'étape (prévu à l'étape 3, avancé à sa demande).

**Docs :** architecture §1, §2, §4, §5, §7, §8, §9 ; `edgecase.md` (1, 2, 3, 6, 9, 10, 11) ; mémo §0, §1, §2,
§5 ; CLAUDE.md (commandes, Neon).

### Étape 2a — Connexion par le portail, sur le poste (G9, G24) ✅ (2026-10-28)

**Source :** prompt guidé P-01 du portail, contrat portail v1 (copie figée au §3 du prompt ; source vivante
`../portail/docs/architecture/contrat-apps.md`). **Tranchées :** D8 à D14 ; en début d'étape, D17 à D23 (§2.5).

**Préparation — étape 0 du P-01 (2026-10-28, sans code)**

- [x] Point de départ vérifié et consigné (journal).
- [x] Relevé du §4 du P-01 revérifié, écarts notés ci-dessous.
- [x] D1 tranchée (G9), décisions du portail recopiées (G10 à G24), questions du §6 posées et consignées
      (D8 à D14).
- [x] Étapes 2a et 2b écrites, avec leurs cases.
- [x] Compte rendu au propriétaire avec les éléments du §8 du P-01.
- [x] Validation du propriétaire (2026-10-28) ; commit à sa demande, le même jour.

Écarts au relevé du P-01 (§4), le 2026-10-28, sur `1436416` :

1. `src/lib/auth.ts` : le rappel `jwt` lit `admins` directement (`prisma.admin.findUnique`), pas par
   `isAdmin` ; `requireAuth()` et `requireAdmin()` (l. 152-170) ne sont appelées nulle part.
2. `isAdmin` est aussi appelée hors de `api-helpers.ts` : huit appels dans six fichiers (`admin/layout.tsx`,
   `admin/settings/actions.ts`, `api/auth/check-admin`, `POST /api/trips`, `api/trips/[id]` trois fois,
   `api/trips/[id]/passengers/[passengerId]`). Tous changent de source de rôle.
3. `/unauthorized` n'est la cible d'aucune redirection aujourd'hui : la page est orpheline.
4. `/admin/users` a une entrée de menu dans `src/app/admin/layout.tsx` (« Utilisateurs & Services ») ;
   `DELETE /api/admin/services/[id]` écrit l'audit `SERVICE_REMOVED` ; l'énumération `AuditAction` garde
   `ADMIN_PROMOTED`, `ADMIN_REVOKED`, `SERVICE_ADDED`, `SERVICE_REMOVED`.
5. `POST /api/trips` : un admin fixe `driverEntraId`, mais aussi `driverEmail` et `driverDisplayName`, recopiés
   du corps de la requête sans contrôle.
6. NextAuth : `idToken` est déjà déduit vrai avec `wellKnown` ; `openid-client` peut basculer en
   `client_secret_post` (piège 11). Les autres points du §4.4 sont confirmés. *Levé par le portail le
   2026-10-28 : sa découverte annonce `client_secret_basic` en premier.*
7. `.env.example` : `NEXTAUTH_URL` vaut `http://localhost:3000` (3002 selon D12). `package.json` :
   `@prisma/adapter-pg` n'est utilisée nulle part non plus. `Passenger` a aussi un index sur `userEntraId`.
8. `entraId` : 31 fichiers hors client généré (« une trentaine » : conforme).
9. Base non relue : aucun projet Neon touché (D7). Le nombre de comptes réels à importer est 0 par
   construction (la seule connexion possible est celle des trois comptes simulés en `@entreprise.fr`) ;
   l'ancienne base `neon-cyclamen-river` n'est pas reprise.

**Branchement**

- [x] Le propriétaire déclare ResaVroom dans le portail, avec l'agent du portail (D8, D9, D12) : restreinte,
      rôles `USER` et `ADMIN`, client `dev`. Il pose ensuite `PORTAIL_ISSUER`, `PORTAIL_CLIENT_ID`,
      `PORTAIL_CLIENT_SECRET` et `NEXTAUTH_URL` (`http://localhost:3002`) dans `.env.local`. L'agent ne les
      demande pas et ne les lit pas. *Fait le 2026-10-28 (action du propriétaire, sans code), selon le suivi
      de l'agent du portail : annuaire fermé, grille vide.*
- [x] Tests d'abord, vus en échec : rapprochement par `sub`, puis par l'adresse, puis création ; refus d'une
      adresse liée à un autre `sub`, consigné ; rôle recopié à chaque connexion ; garde administrateur qui suit
      le rôle relu en base ; session refusée 8 h après la connexion, même relue entre-temps.
      (`tests/auth.test.ts` : 22 en échec contre l'ancien `auth.ts` ; `tests/logout.test.ts` : ne se chargeait
      pas, route absente ; `tests/proxy.test.ts` : 2 en échec ; table des droits : 13 en échec.)
- [x] Fournisseur OIDC `portail` (piège 11) : découverte sur `PORTAIL_ISSUER`, PKCE S256, `state`, `nonce`,
      `client_secret_basic`, scopes `openid profile email`, sans `offline_access`.
- [x] Table des personnes et colonnes `*_sub` (D10, D19, D20) : migration `20261028160000_portail_identity`
      rédigée à la main, appliquée le 2026-10-28 avec l'accord du propriétaire (partage de connexion, cible
      vérifiée par son nom d'hôte, base et schéma identiques ensuite, contrôle par le MCP Neon) ; `admins` et
      `authorized_services` supprimées (D17) ; valeurs d'audit `ADMIN_*` et `SERVICE_*` retirées,
      `SIGNIN_REFUSED` ajoutée (D18).
- [x] Session de 8 h fixes depuis la connexion ; cookies renommés (D12) ; déconnexion par
      `end_session_endpoint` avec `id_token_hint`, `client_id` et `post_logout_redirect_uri` (D23) ; `/login` avec
      un bouton « Se connecter avec le portail » et, en cas d'`error`, un message neutre avec un lien vers le
      portail, sans relancer le flux ; `/unauthorized` pour le refus d'une adresse réattribuée (et d'un rôle
      inconnu, D20).
- [x] Script `dev` sur le port 3002 (D12).
- [x] Retraits : fournisseur de développement et `DEV_USERS` de `auth.ts` (cas limite 5) ; `admins`,
      `authorized_services` et leurs routes ; `/admin/users` et son entrée de menu ; le compteur
      d'administrateurs de `/admin` ; l'admin `TO_BE_CONFIGURED` du seed (D21) ; `/api/auth/check-admin` et
      `@azure/msal-node` (D14) ; les variables `AZURE_AD_*` de `.env.example`, remplacées par les trois
      `PORTAIL_*` (noms seulement). La simulation de `/api/users/search` reste jusqu'à l'étape 2b.
- [x] Essai sur le poste contre le portail de production, avec l'agent du portail, **le propriétaire se
      connectant lui-même** (aucun compte de test). Dans l'ordre : refus (personne n'est dans la grille,
      c'est attendu) ; l'agent du portail lui donne un rôle, puis connexion ; retrait d'accès (refus à la
      connexion suivante) ; déconnexion. *Fait le 2026-10-28, les quatre temps conformes (journal).*
- [x] Validation du propriétaire (2026-10-28), après le commit `25a24c0`.

Vérifications de fin d'étape : `npm test` 169 tests verts (9 fichiers) ; `npx tsc --noEmit` 0 erreur ;
`npm run lint` 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs à l'étape 1 (aucun nouveau).

Écarts au plan : rapprochement dans le rappel `signIn` et non `jwt` (D22) ; route `POST /api/auth/logout`
ajoutée (D23) ; deux modules nouveaux, `src/lib/auth-session.ts` (8 h, cookies, sans Prisma, pour le proxy) et
`src/lib/portail.ts` (adresses du portail) ; `requireAuth()` et `requireAdmin()` de `auth.ts`, appelées nulle
part (écart 1 du relevé), retirées plutôt que renommées ; `/unauthorized` masque la barre de navigation ;
cas limites 12 et 13 ajoutés ; `README.md` mis à jour (il décrivait la connexion de développement).

**Docs :** architecture §1, §2, §3, §4, §5, §7, §8, §9 ; mémo §0, §1, §2, §3, §5 ; `edgecase.md` (EC 4, 5, 10, 11,
12, 13) ; `.env.example` ; CLAUDE.md ; `README.md`.

### Étape 2b — Recherche par l'annuaire du portail

- [x] Le propriétaire fait ouvrir l'annuaire sur le client `dev` par le super-admin du portail (G22). *Ouvert
      le 2026-10-28 à 16 h 18, selon l'agent du portail ; à refermer après l'essai de 2b (prévenir le
      propriétaire).*
- [ ] Tests d'abord contre une imitation qui suit le §3.7 du contrat (aucun réseau, règle 7) : jeton
      `client_credentials` et `scope=directory` gardé jusqu'à `expires_in` (une heure), `q` d'au moins deux
      caractères, 400 `unauthorized_client`, 401, 429.
- [ ] `/api/users/search` appelle l'annuaire côté serveur, avec le client de son environnement, et rend `sub`,
      `name`, `email` ; `UserSearchAutocomplete`, `StepConfirm` et `AdminEditTripModal` passent sur `sub`.
- [ ] L'identité d'une autre personne (conducteur choisi par un admin, passager ajouté) ne se recopie plus du
      corps de la requête sans contrôle (écart 5 ci-dessus) : à trancher en début d'étape.
- [ ] Passagers à la création d'un trajet choisis dans l'annuaire, avec leur `sub` (cas limite 11 : aujourd'hui
      saisis en texte libre, sans identifiant, donc refusés).
- [ ] Essai sur le poste, annuaire ouvert sur le client `dev`, puis refermé par le super-admin : **à la fin de
      l'essai, prévenir le propriétaire** pour qu'il le fasse refermer.

**Docs :** architecture §4 ; mémo §1, §3.

### Étape 3 — Polish (ébauche, phase 11 du SAD)

**À trancher en début d'étape :** D5.

- [ ] Corriger les erreurs ESLint ; `npm run lint` sans erreur.
- [ ] États de chargement, états vides, pages d'erreur ; responsive (375, 768, 1280 px).
- [ ] `npm run build` sans erreur. (`README.md` : converti et réécrit à l'étape 1.)

**Docs :** architecture §3, §6, §9 ; README.

### Étape 4 — Mise en ligne et notifications (ébauche)

**À trancher en début d'étape :** D6, D16.

- [ ] Créer le projet d'hébergement et poser les variables (le propriétaire pose les valeurs, l'agent guide).
      La base `resavroom` vient de l'intégration Neon de Vercel : la relier au projet Vercel de ResaVroom, et à
      lui seul (jamais à `app-vc` ni à `les-petits-pronos-de-la-promo`).
- [ ] Auteur des commits déployables sur Vercel Hobby (piège 13).
- [ ] Avant la mise en ligne, avec le propriétaire et l'agent du portail : client `production` de ResaVroom
      (adresses exactes de production), adresse d'accueil définitive, annuaire sur ce client si besoin, mode au
      lancement (D16) ; `PORTAIL_*` de production posées par le propriétaire sur Vercel.
- [ ] Écrire la procédure de livraison et la vérification en ligne (mémo §4) ; CI.
- [ ] Notifications mail si D6 les conserve.

**Docs :** mémo d'exploitation, architecture §1 et §9, CLAUDE.md.

---

## 6. Hors périmètre

- Microsoft Entra ID et Graph (G8).
- Nouvelles fonctionnalités métier non demandées (nouveaux types de trajet, autres campus).
- Les projets `app-vc` et `les-petits-pronos-de-la-promo` de Vercel ; les projets Neon `vc-bdd` et
  `neon-bisque-pillar` (pas à ResaVroom) et l'ancienne base `neon-cyclamen-river` (D7).
- Le portail : son dépôt (`../portail`, `emnormandie76/portail-admission`), ses projets Vercel et Neon
  (`portail-admission`), son contrat (lecture seule). Hors du contrat : la déconnexion par canal arrière.
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
| 2026-10-28 | 0 | **Étape 0 validée** par le propriétaire, au début de la session du prompt guidé P-01 du portail. Retrait accordé et fait : les quatre anciens documents de pilotage, `message-IT.md`, `fix_eslint.sh` ; index et architecture §9 mis à jour. `npx tsc --noEmit` : 0 erreur ; `npm run lint` : 18 problèmes (15 erreurs, 3 avertissements), inchangé. Étape commitée seule, à la demande du propriétaire : `1436416`. | Conversion du `README.md` (Windows-1252) toujours en attente (étape 3). |
| 2026-10-28 | 2a (étape 0 du P-01) | **Départ du branchement vérifié.** `dev-claude` sur `1436416`, arbre propre ; `npx tsc --noEmit` : 0 erreur ; `npm run lint` : 18 problèmes (15 erreurs, 3 avertissements) ; aucun test. Le prompt guidé lu sur disque (`../portail/docs/prompts/P-01-appVoiture-connexion-portail.md`) est identique au texte collé par le propriétaire. | Le P-01 décrivait l'étape 0 « mise en production » comme non commitée : elle l'est désormais (`1436416`). |
| 2026-10-28 | 2a (étape 0 du P-01) | **Relevé du §4 du P-01 revérifié** : conforme sur l'essentiel ; neuf écarts, listés à l'étape 2a (§5). Aucun ne change le plan du portail ; l'écart 5 (identité d'un autre conducteur recopiée du corps) devient une case de l'étape 2b. | Base non relue (D7) : comptes réels à importer = 0 par construction. |
| 2026-10-28 | 2a (étape 0 du P-01) | **D7 tranchée par le propriétaire** : la base actuelle est le projet `neon-cyclamen-river` du compte Anton1P (inconnu du MCP Neon relevé le 2026-10-26) ; le propriétaire crée un projet neuf sur le compte emnormandie76 et pose la nouvelle `DATABASE_URL` dans `.env.local`. Consigné en D7 et dans le mémo. | **Surprise** : la CLI Prisma ne lit que `.env` (piège 12) ; ouverte en D15. Nom et identifiant du projet neuf à consigner ; migration et seed sur accord. |
| 2026-10-28 | 2a (étape 0 du P-01) | **Chantier écrit.** D1 tranchée → G9 ; décisions du portail recopiées en G10 à G24 ; questions du §6 tranchées en D8 à D14 (toutes les recommandations retenues, y compris le retrait de `check-admin` et `@azure/msal-node`, laissé au choix de ResaVroom par le P-01) ; D16 ouverte (mode à la mise en ligne). Pièges 11 à 13 ajoutés. Étapes écrites : l'ancienne étape 2 devient 2a (connexion) et « l'étape suivante » du P-01 devient 2b (annuaire), pour garder les numéros 3 et 4 auxquels le P-01 renvoie. Aucun code. | En attente de validation ; rien n'est commité pour ce chantier. |
| 2026-10-28 | 2a (étape 0 du P-01) | **Étape 0 du P-01 validée** par le propriétaire, qui diffère le commit. L'agent l'a guidé pour créer le projet Neon neuf (D7). | Commit à la demande du propriétaire ; nom et identifiant du projet neuf à consigner ; le propriétaire annonce « P-01 fait » à l'agent du portail. Prochaine étape : 1. |
| 2026-10-28 | 1 (D7) | **Projet neuf vérifié par le MCP Neon**, en lecture seule (`list_projects`, `list_organizations`, `list_branches`, `get_database_tables`) : `resavroom` (`wispy-shadow-66847588`), `aws-eu-central-1`, Postgres 18, branche `main`, aucune table (Neon Auth non activée, comme conseillé). Consigné en D7, dans le mémo et `CLAUDE.md`. | **Écart à D7** : créé par l'intégration Neon de Vercel, pas dans la console Neon ; l'organisation Neon est « Vercel: EM-Normandie », gérée par Vercel, et contient aussi `portail-admission`, `vc-bdd` et `neon-bisque-pillar` (jamais touchés). `.env.local` non lu (règle) : contenu de `DATABASE_URL` déclaré par le propriétaire. |
| 2026-10-28 | 1 (D7, D15) | Le propriétaire déclare `.env.local` : `DATABASE_URL` = adresse pooled, `DATABASE_URL_UNPOOLED` = adresse directe, comme les pose l'intégration Vercel. Lecture de `.env.local` autorisée par le propriétaire mais pas faite : inutile. Gardé tel quel ; recommandation de D15 ajustée (la CLI lira `DATABASE_URL_UNPOOLED`). | Le conseil précédent de l'agent (directe dans `DATABASE_URL`) est abandonné. |
| 2026-10-28 | 2a (étape 0 du P-01) | **Commit** de l'étape 0 du P-01, avec D7 et l'ajustement de D15, à la demande du propriétaire, pour que l'agent du portail le vérifie (G16). Aucun code. | Commit local sur `dev-claude`, non poussé. Le propriétaire annonce « P-01 fait ». Prochaine étape : 1, sur son feu vert. |
| 2026-10-28 | 2a (suivi du P-01) | **Suivi de l'agent du portail** (information, pas un nouveau prompt ; contrat portail v1 inchangé) : étape 0 du P-01 (`b31bd91`) vérifiée conforme, sans écart bloquant ; écart 6 levé (la découverte annonce `client_secret_basic` en premier) ; portail en production au commit `45b3763` (annuaire ouvrable client par client). **ResaVroom déclarée** : `resavroom`, « ResaVroom », accueil `http://localhost:3002/`, restreinte, rôles `USER` et `ADMIN`, client `dev` seul (retour `…/api/auth/callback/portail`, déconnexion `…/login`), annuaire fermé, grille vide. Le propriétaire a posé `PORTAIL_ISSUER`, `PORTAIL_CLIENT_ID`, `PORTAIL_CLIENT_SECRET` et `NEXTAUTH_URL` (`http://localhost:3002`) dans `.env.local` (non lu). Première case du branchement cochée ; déroulé de l'essai de fin de 2a précisé ; rendez-vous avec le portail ajoutés au §0. | Description retenue par le portail, différente de la proposition : consignée en D8. `NEXTAUTH_URL` vaut déjà `http://localhost:3002` alors que `npm run dev` écoute 3000 : lancer `npm run dev -- -p 3002` jusqu'à l'étape 2a. |
| 2026-10-28 | 1 | **Début d'étape.** Décisions du propriétaire (toutes recommandations retenues) : D2 Vitest et Prisma simulé, D3 corriger EC 1 à 3 (le 2 selon le SAD, sans question : la règle y est écrite), D4 renommage à la main, D15 `.env.local` + `DATABASE_URL_UNPOOLED`, contenu de l'étape confirmé avec zod pour EC 6. | — |
| 2026-10-28 | 1 | **D15 et base.** `prisma.config.ts` modifié ; cible vérifiée par son seul nom d'hôte (`ep-young-silence-ba28ysji`, proxy `c-8`, propre à `resavroom` parmi les quatre projets de l'organisation). Accord du propriétaire, partage de connexion : `migrate deploy` (1 migration) puis `db seed` ; MCP (lecture) : 9 tables, 3 campus, 3 véhicules, 1 paramètre, 1 admin, 0 trajet. | Prisma propose la 8.0 (rc) : ignoré. |
| 2026-10-28 | 1 | **Tests d'abord.** Vitest 4.1.12 (Vitest 5 refusé par npm : il exige `@types/node` 22+, le projet est en 20 ; monter `@types/node` dépassait l'étape), zod 4.6.7. Sept fichiers de tests ; avant correctifs : 26 en échec, 79 au vert (les règles pures et la table des droits décrivaient déjà le code). Correctifs : `addPassenger` (droits, `canJoinAsPassenger`, transaction `Serializable`), `removePassenger` (SAD), `updateDepartureTime` (conflits, `Serializable`), `createTrip` (places), `findVehicleConflict` (exclusion d'un trajet), schémas zod et `parseJsonBody`, cinq routes d'écriture, deux traces de débogage. Trois tests corrigés après coup parce qu'ils étaient faux (heures calculées à des instants différents ; condition de conflit trop large), pas affaiblis. | **Surprise** : `StepConfirm` envoie les passagers sans identifiant ; la création avec passagers échouait déjà en 500 (nouveau cas limite 11, case en 2b). Doublon de plaque de véhicule → 500 (cas limite 10 étendu). |
| 2026-10-28 | 1 | **Proxy (D4).** Après le renommage, l'essai réel montre `/dashboard` en 200 sans session ; même résultat avec l'ancien `middleware.ts` : **la redirection n'a jamais fonctionné**, le fichier était à la racine alors que `app/` est dans `src/`. Déplacé dans `src/proxy.ts` ; Next signale alors que le réexport n'est pas reconnu (E903 au build) : fonction écrite avec `withAuth`. Question au propriétaire : pages seulement, `/api` exclue. Test `tests/proxy.test.ts` vu en échec puis vert ; essai réel : pages → 307 vers `/login`, `/api/trips` → 401. | Le serveur de développement survivait à l'arrêt de sa tâche : processus arrêté à la main, après vérification de sa ligne de commande. |
| 2026-10-28 | 1 | **Fin d'étape.** `npm test` 146 verts ; `tsc` 0 erreur ; `lint` 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs (l'erreur en moins venait du script retiré). Docs : architecture, cas limites, mémo, CLAUDE.md, ce plan. | `README.md` non mis à jour (piège 5). Rien n'est commité. En attente de validation. |
| 2026-10-28 | 1 | **README et validation.** Le propriétaire convertit `README.md` en UTF-8 ; son contenu était abîmé par des échappements de PowerShell et décrivait Entra ID, une liste blanche et le port 3000 : réécrit sur l'état réel (connexion de développement puis portail, port 3002, tests, limites connues). Piège 5 clos. **Étape 1 validée** par le propriétaire et commitée à sa demande. | Prochaine étape : 2a, sur son feu vert. |
| 2026-10-28 | 2a | **Départ vérifié.** `dev-claude` sur `5a74171`, arbre propre ; `npm test` 146 verts (7 fichiers) ; `npx tsc --noEmit` 0 erreur ; `npm run lint` 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs. Lus : plan, architecture, mémo, cas limites, contrat portail v1 et P-01 (lecture seule), NextAuth 4.24.14 (`core/lib/providers.js`, `core/lib/oauth/*`, `core/routes/callback.js`, `session.js`, `signout.js`, `core/lib/cookie.js`, `next/middleware.js`, `jwt/index.js`), guides Next `route.md` et `cookies.md`. Piège 11 revérifié : conforme. Base relue en SELECT (§2.5). | Session sur Opus 5.5. |
| 2026-10-28 | 2a | **Décisions de début d'étape** : D17 à D23 (§2.5), toutes les recommandations retenues. | D22 s'écarte du texte du prompt de l'étape (rapprochement dans `signIn`, pas dans `jwt`), pour pouvoir renvoyer le refus vers `/unauthorized`. |
| 2026-10-28 | 2a | **Tests d'abord, vus en échec.** Nouveaux : `tests/auth.test.ts` (25 tests), `tests/logout.test.ts` (5), 3 tests ajoutés à `tests/proxy.test.ts` ; table des droits mise à jour ; client Prisma simulé avec `person`. Contre l'ancien code : 22 en échec dans `auth.test.ts` (3 déjà vrais), `logout.test.ts` ne se chargeait pas (route absente), 2 en échec pour le proxy, 13 pour la table des droits. | Le test « 8 h » du proxy passait déjà, pour une mauvaise raison (l'ancien proxy ne lisait pas le cookie renommé) : il ne prouve quelque chose qu'avec le test « lit le cookie renommé », vu en échec. |
| 2026-10-28 | 2a | **Code.** Schéma (`Person`, `Role`, `*Sub`, `AuditAction`), migration écrite à la main, comparée hors ligne au SQL que Prisma propose (`migrate diff --from-schema … --to-schema`) : mêmes noms d'index, mais `RENAME` au lieu de supprimer puis recréer les colonnes. Renommage `entraId` → `sub` dans 29 fichiers (piège 6) ; `person-service.ts`, `auth-session.ts`, `portail.ts`, `auth.ts` réécrit, route `logout`, proxy, `/login`, `/unauthorized`, Navbar, menu et compteurs admin, seed, recherche simulée, `.env.example`, script `dev`, `@azure/msal-node` désinstallée. 169 tests verts. | **Surprise** (piège 14) : `tsc` citait les routes retirées par les types périmés de `.next/` ; `next typegen` et effacement de `.next/dev/types` (cache). |
| 2026-10-28 | 2a | **Migration appliquée**, accord du propriétaire, en partage de connexion : cible vérifiée par son seul nom d'hôte (`ep-young-silence-ba28ysji`) ; `npx prisma migrate deploy` ; `prisma migrate diff --from-config-datasource --to-schema` → migration vide ; MCP Neon (lecture) : 8 tables dont `people`, sans `admins` ni `authorized_services`, énumérations conformes, 2 migrations terminées. | — |
| 2026-10-28 | 2a | **Contrôle du serveur** (`npm run dev`, `fetch` de Node avec `redirect: "manual"`, sans connexion) : `/login` 200 avec le bouton, message neutre sur `?error=`, `/dashboard` → 307 `/login`, `/api/trips` → 401, fournisseur `portail` avec retour `…/api/auth/callback/portail`, demande de connexion → autorisation du portail de production avec `response_type=code`, `scope=openid profile email`, PKCE S256, `state`, `nonce` ; cookies `resavroom.*` ; déconnexion sans session → 303 `/login`. | Avertissement `DEP0169` (`url.parse`) d'`openid-client`, sans effet. |
| 2026-10-28 | 2a | **Essai réel** avec le propriétaire, connecté lui-même, et l'agent du portail par son intermédiaire : (1) grille vide → refus du portail, aucun retour sur ResaVroom, base vide ; (2) rôle `ADMIN` donné → connexion, tableau de bord, `/admin` ouvert ; `people` : une personne, `sub` du portail, adresse en minuscules `@em-normandie.fr`, rôle `ADMIN`, heure de connexion ; aucun audit ; (3) accès retiré → nouvelle connexion refusée par le portail, aucun retour ; (4) déconnexion → portail sans confirmation, retour sur `/login`, `/dashboard` renvoie vers `/login`. Serveur arrêté par son port après vérification de sa ligne de commande. | Après le temps 3, `people.role` reste `ADMIN` jusqu'à la connexion suivante : voulu par le contrat (cas limite 13). *Corrigé le 2026-10-28 d'après l'agent du portail : l'agent avait écrit ici « le propriétaire n'est plus dans la grille », ce qui était faux ; son accès lui a été rendu à 15 h 56, avec le rôle `ADMIN`, juste après l'essai.* |
| 2026-10-28 | 2a | **Fin d'étape.** `npm test` 169 verts (9 fichiers) ; `tsc` 0 erreur ; `lint` 17 problèmes, tous antérieurs. Docs : architecture (§1 à §5, §7 à §9, « contrat portail v1 »), mémo (§0 à §3, §5), cas limites (4, 5, 10, 11, nouveaux 12 et 13), `.env.example`, `CLAUDE.md`, `README.md`, ce plan (D17 à D23, piège 14). Compte rendu pour l'agent du portail préparé (rendez-vous de fin de 2a). | Rien n'est commité. En attente de validation. |
| 2026-10-28 | 2a | **Commit et push** sur `dev-claude` (`origin`), à la demande du propriétaire. | Case « Validation du propriétaire » laissée ouverte : à cocher sur sa validation explicite. |
| 2026-10-28 | 2a (suivi du portail) | **Message de l'agent du portail**, transmis par le propriétaire (information, pas un nouveau prompt) : le propriétaire est dans la grille de `resavroom` avec le rôle `ADMIN` depuis 15 h 56 (accès rendu juste après l'essai) ; **l'annuaire est ouvert sur le client `dev`** depuis 16 h 18 et renverra une personne ; il sera refermé après l'essai de 2b. Journal, mémo §3 et `CLAUDE.md` corrigés ; première case de l'étape 2b cochée. | Rien vérifié côté portail (aucun appel, règle du portail). **À la fin de l'essai de 2b : prévenir le propriétaire**, pour qu'il fasse refermer l'annuaire. Annuaire ouvert : risque accepté par le portail (G22), le secret du client `dev` du poste lit les noms et adresses des personnes qui ont accès. |
| 2026-10-28 | 2a | **Étape 2a validée** par le propriétaire. Prompt de départ de l'étape 2b rédigé pour un agent neuf (remis au propriétaire, hors du dépôt). | Corrections de docs de ce jour (journal, mémo §3, `CLAUDE.md`, validation) non commitées au moment de la validation. Prochaine étape : 2b. |
