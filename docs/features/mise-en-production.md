# Chantier — Mise en production de ResaVroom

> **Statut au 2026-10-28 :** étape 0 faite et validée (commit `1436416`). **D1 tranchée** : la connexion se fait
> par le **portail admission** (G9 ; prompt guidé P-01 du portail, contrat portail v1). L'étape 0 de ce
> branchement (préparation, sans code) est faite, validée et commitée (2026-10-28). **D7 tranchée** :
> projet Neon neuf `resavroom`, migré et seedé. **Étape 1 faite et validée le 2026-10-28.** **Étape 2a faite et validée le
> 2026-10-28** (connexion par le portail, essai réel conforme ; commit `25a24c0`). **Étape 2b faite et validée le
> 2026-10-28** (recherche par l'annuaire, écart 5, cas limite 11 ; essai réel conforme, annuaire refermé).
> **Étape 3 faite et validée le 2026-10-29** (polish : ESLint à 0, états et pages d'erreur, responsive, build
> vert ; essai conforme). **Étape 4 faite et validée le 2026-10-29** : ResaVroom est en ligne sur
> <https://em-drive.vercel.app> (D6, D16, D37 à D51). **Chantier terminé.** Suite hors chantier : le renommage de
> l'application en « EM Drive » (D50), confié à un autre agent.
> Ordre des étapes : 1, 2a, 2b, 3, 4 (D13). Le détail de chaque étape est au §5, son histoire au journal (§9).
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
  `portail-admission`) ; demander ou lire `PORTAIL_CLIENT_SECRET` ; créer un compte de test dans le portail ;
  travailler dans l'administration du portail, même dans la session du propriétaire (G25) : un réglage du portail
  à changer (annuaire, grille, client) se signale au propriétaire, qui le fait ou le confie à l'agent du portail.
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
| G25 | portail D29 (2026-10-28, après l'étape 2b) | **L'agent d'une application ne travaille jamais dans l'administration du portail**, même dans la session du propriétaire. Si un réglage du portail doit changer (annuaire, grille, client), il prévient le propriétaire, qui le fait lui-même ou le confie à l'agent du portail. Pour la mise en ligne (étape 4), le client `production`, l'adresse d'accueil définitive et le mode (D16) passent donc par lui. |

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

### 2.6. Tranchées au début de l'étape 2b (2026-10-28)

Toutes par le propriétaire, recommandation retenue. Source : contrat portail v1 §7 (copie figée au §3.7 du P-01).

| # | Question | Réponse |
|---|---|---|
| D24 | Écart 5 : d'où le serveur tire-t-il l'identité d'une autre personne (conducteur choisi par un admin, à la création ou en modification ; passagers à la création ; passager ajouté par le conducteur), alors que l'annuaire ne cherche pas par `sub` ? | **Revérifier dans l'annuaire.** L'écran n'envoie que le `sub` et l'adresse ; le serveur interroge l'annuaire avec `q` = cette adresse, garde l'entrée au `sub` identique et recopie le nom et l'adresse rendus par le portail ; introuvable → 400. L'appelant lui-même vient de sa session ; un conducteur inchangé (PATCH de la modale admin) garde ses valeurs en base, sans appel. Annuaire fermé ou en panne → 503 pour ces écritures. Écarté : un jeton de sélection signé (un mécanisme de plus ; un retrait d'accès ignoré pendant sa vie). |
| D25 | Ce que rend `/api/users/search` quand l'annuaire ne répond pas (fermé, 401 après un jeton neuf, 429, panne, délai) | **Erreur explicite** : 503 `DIRECTORY_UNAVAILABLE` (fermé, 401 répété, panne, délai de 5 s, réponse illisible) ou 429 `DIRECTORY_RATE_LIMITED`, avec un message en français que la liste de suggestions affiche ; une ligne de journal serveur avec le seul motif, jamais le jeton, le secret, un nom ou une adresse. Écarté : une liste vide silencieuse. |
| D26 | Forme de la réponse de la recherche | **`[{ sub, name, email }]`, sans le rôle** (le contrat demande de ne garder que le nécessaire, et le rôle dirait à tout utilisateur qui est administrateur). Les écrans passent de `displayName` à `name`. |
| D27 | Choix des passagers dans `StepConfirm` (cas limite 11) | **Par la recherche de l'annuaire**, le conducteur (l'appelant, ou celui que l'admin choisit) et les personnes déjà ajoutées **masqués** des suggestions ; un passager choisi ensuite comme conducteur est retiré de la liste, avec un message. L'écran envoie `{ userSub, userEmail }` par passager (D24). Le serveur refuse quand même en 400 un passager égal au conducteur ou en double. |
| D28 | Garantir que le module qui détient `PORTAIL_CLIENT_SECRET` n'est jamais importé par un composant client | **`import "server-only"`, sans paquet** : Next 16 le résout lui-même (installation facultative selon sa doc, types fournis par `next`) ; module à part, `src/lib/portail-directory.ts` ; Vitest reçoit un alias vers le module vide de Next. Écarté : un test des importations, sans marqueur. |

### 2.7. Tranchées au début de l'étape 3 (2026-10-28)

Toutes par le propriétaire, recommandation retenue.

| # | Question | Réponse |
|---|---|---|
| D5 | ESLint : corriger maintenant ? Que faire des `eslint-disable` qui couvrent un fichier entier ? | **Zéro problème, sans commentaire qui cache.** Les 19 `eslint-disable` de fichier et les 4 de ligne (hors `src/generated/`, qui garde les siens) sont retirés ; chaque `any` devient un vrai type, les variables mortes disparaissent ; `eslint.config.mjs` inchangé. Relevé au départ : 17 problèmes visibles ; sans les commentaires (`--no-inline-config`), 73 hors code généré (47 erreurs, 26 avertissements). Écarté : corriger les seules erreurs visibles. |
| D30 | Contenu de l'étape | **Ébauche précisée** : ESLint (D5) ; pages Next en français (D33) et états de chargement, vides et d'erreur homogènes dans les écrans ; responsive à 375, 768 et 1280 px ; build vert, avec `/admin` rendue dynamique explicitement (`connection()`) et le build lancé avec une `DATABASE_URL` factice dans son seul processus (`process.env` l'emporte sur `.env.local`), pour qu'il ne puisse pas lire la base partagée ; plus D31 et D32. Écarté : l'ébauche stricte. |
| D31 | Mentions de mails qui n'existent pas (D6) | **Retirées maintenant** (`StepConfirm`, `/admin/trips` deux fois), remplacées par des phrases vraies ; l'étape 4 en remettra si D6 garde les mails. Écarté : les laisser jusqu'à D6. |
| D32 | Dettes qui entrent dans l'étape | **Cas 10** (D34). **Cas 8** : une modale où l'on tape un mot remplace `window.confirm`, et le nettoyage des trajets filtre sur leur fin, plus sur leur date de création (défaut relevé au départ : un trajet futur réservé il y a plus d'un mois aurait été supprimé). **« Mes trajets à venir »** filtré côté serveur (le tableau de bord prenait les 5 prochains trajets de tout le monde, puis gardait ceux de l'appelant : faux « aucun trajet » possible). **Outillage** : `NEON_PROJET_ID` et `NEON_API_KEY` nommées dans `.env.example` (piège 8), `@prisma/adapter-pg` désinstallée, `src/app/page.module.css` (inutilisée) retirée, type de retour de `requireAuthSession` en union explicite (comportement inchangé). Restent : cas 12 (écran et écritures en base), `DEP0169` (dans `openid-client`). |
| D33 | Pages d'erreur, 404 et chargement de Next | **À la racine** : `error.tsx` (sous la mise en page racine, la barre de navigation reste), `global-error.tsx`, `not-found.tsx` et `loading.tsx` dans `src/app/` ; un composant commun pour les états de chargement, vides et d'erreur des écrans. Écarté : un `error.tsx` et un `loading.tsx` par segment. |
| D34 | Code de réponse du cas 10 (plaque déjà prise) | **409 `LICENSE_PLATE_TAKEN`**, comme les autres conflits, avec un message en français que l'écran affiche. Écarté : 400 `VALIDATION_ERROR`. |
| D35 | Métriques Neon de `/admin/settings`, chargées dès l'ouverture (appel à quota, règle 7) | **Au clic seulement** : la page s'ouvre sans appel, un bouton lance le chargement. Écarté : le chargement à l'ouverture. |
| D36 | *Posée en cours d'étape.* Le projet n'a pas Tailwind, mais 56 classes de style Tailwind (`flex`, `gap-4`, `mb-6`, `text-2xl`, `text-muted`, `spinner`…) sont écrites dans les composants et définies nulle part : elles n'ont aucun effet | **Définir celles qui sont employées** dans une section « utilitaires » de `globals.css`, aux valeurs de Tailwind et avec les jetons du projet ; les classes à valeur arbitraire (`bg-[var(--…)]`, `min-h-[50vh]`, `text-[var(--…)]`) deviennent des styles en ligne. Écartés : les remplacer partout (diff bien plus large), installer Tailwind (une dépendance et un outil de build de plus). |

### 2.8. Tranchées au début de l'étape 4 (2026-10-29)

Toutes par le propriétaire, recommandation retenue. Relevé avant les questions (lecture seule) : compte Vercel de
l'utilisateur `emnormandie76`, offre **Hobby** (une compilation à la fois ; retour arrière limité au déploiement de
production précédent) ; projets visibles : `app-vc`, `les-petits-pronos-de-la-promo`, `portail-admission` (jamais
touchés) ; le MCP Vercel n'a pas la portée de l'équipe (`get_team` : 403). Commits du dépôt rattachés au compte
GitHub `Anton1P`. `main` (code d'avril, fournisseur de développement) est un ancêtre de `dev-claude`. Neon : offre
gratuite, 10 branches au plus, base à Francfort.

| # | Question | Réponse |
|---|---|---|
| D37 | Contenu de l'étape | **L'ébauche, plus la sécurité d'un service exposé** : projet Vercel et variables, auteur des commits, client de production, procédure de livraison, de vérification et de retour arrière, CI ; en-têtes et CSP (D43), limitation de débit (D44), cas 7 (D45). Écartés : l'ébauche seule ; la mise en ligne seule. |
| D6 | Notifications mail | **Aucun mail au lancement.** Envoyer depuis `@em-normandie.fr` exige des enregistrements DNS (SPF, DKIM) posés par la DSI ; `MAIL_SENDER_ADDRESS` sort de `.env.example` ; les mails restent une évolution hors chantier. Écartés : Resend, SMTP Microsoft 365, Brevo. |
| D16 | Mode d'accès au portail à la mise en ligne | **Restreinte** : seules les personnes de la grille entrent. Écarté : ouverte avec `USER` par défaut. |
| D38 | Branche de production | **`main`, avancée par le propriétaire** en avance rapide (`git push origin dev-claude:main`), avant l'import du projet : l'agent ne touche jamais `main`. Une fusion par l'interface de GitHub créerait un commit au nom d'`Anton1P` (piège 13). Les push sur `dev-claude` donnent des Preview sans connexion (G20) ; pas de branche de recette. Écartés : `dev-claude` en production ; une recette avec son client. |
| D39 | Auteur des commits (piège 13) | **Identité du dépôt**, comme le portail : `user.name` `emnormandie76`, `user.email` `335444819+emnormandie76@users.noreply.github.com`, en configuration locale de ce seul dépôt. Écartés : déployer par la CLI ; passer en Pro. |
| D40 | Base de production | **Branche Neon `dev` pour le poste** (enfant de `main`, créée sur accord ; le propriétaire y pointe `.env.local`) ; la production garde `main`. Une migration se joue ensuite sur les deux branches. Écarté : la même branche pour le poste et la production. |
| D41 | Adresse et création du projet | **`https://resavroom.vercel.app`**, projet `resavroom` **importé par le propriétaire** dans le tableau de bord (aucune écriture par le MCP) ; base reliée depuis l'onglet Storage, pour Production seulement. Écartés : création par le MCP ; un domaine de l'école. |
| D42 | Intégration continue | **GitHub Actions minimale** sur les push de `dev-claude` et `main` : `npm ci`, tests, lint, build avec une `DATABASE_URL` factice, `tsc` ; aucun secret. Écarté : Vercel seul. |
| D43 | En-têtes et CSP | **En-têtes de sécurité et CSP sans nonce** dans `next.config.ts`, `form-action` ouvert au portail (contrat §2). Écartés : CSP stricte à nonce (toutes les pages dynamiques, proxy à réécrire) ; en-têtes sans CSP. |
| D44 | Limitation de débit (cas 6) | **En mémoire, par personne et par route, sur les trois routes qui appellent un service extérieur** (ORS, BAN, annuaire) : 429 `RATE_LIMITED`. Limite assumée : chaque instance compte de son côté. Écartés : pare-feu Vercel ; Redis ; rien. |
| D45 | Cas 7 (noms et adresses visibles de tout connecté) | **Risque accepté** par le propriétaire : le covoiturage demande de joindre conducteur et passagers, et le mode restreint (D16) limite la lecture aux collègues de la grille. Écarté : masquer les adresses. |
| D46 | Région des fonctions | **`fra1` (Francfort)**, à côté de la base, données traitées dans l'UE, fixée dans `vercel.json`. Écarté : `iad1` par défaut. |
| D47 | Données de la base de production | **Gardées** : trajet d'essai annulé et ses deux lignes d'audit ; le propriétaire transforme les trois véhicules de démonstration en vraie flotte dans `/admin/vehicles`, en production. Aucune écriture de l'agent. Écartés : effacer la démonstration ; la laisser telle quelle. |
| D48 | Annuaire sur le client de production | **Ouvert dès la mise en ligne** (par le super-admin, G22) ; celui du client `dev` reste fermé. Écarté : fermé au lancement. |
| D49 | Métriques Neon en production | **Pas de clé Neon sur Vercel** (une clé d'organisation ouvrirait aussi le portail) ; le bouton dit que les métriques ne sont pas configurées. Écarté : une clé limitée au projet. |
| D50 | *Posée en cours d'étape*, après que le propriétaire a créé le projet Vercel sous le nom **`em-drive`** (sans déploiement) et renommé le dépôt GitHub **`emnormandie76/EM-Drive`** : l'application s'appellera « EM Drive », renommage complet confié plus tard à un autre agent. Quand écrire le compte rendu du portail ? | **Maintenant, avec `https://em-drive.vercel.app`**, qui **remplace l'adresse de D41** (`NEXTAUTH_URL` et les trois adresses du client de production) ; dans le portail, l'identifiant `resavroom` et le nom « ResaVroom » restent jusqu'au renommage. Écarté : après l'étape 4 (l'essai en ligne n'aurait couvert ni la connexion, ni l'administration, ni la déconnexion). |
| D51 | *Posée en cours d'étape* : le dépôt est **public** (API publique de GitHub, `visibility: public`), alors que le plan le supposait privé | **Voulu, il reste public.** Aucun secret dans tout l'historique (vérifié : ni adresse PostgreSQL avec mot de passe, ni clé, ni fichier `.env` suivi) ; les documents ne doivent jamais en contenir. Conséquences : la règle Hobby du piège 13 ne vise que les dépôts privés (D39 reste en place) ; les minutes d'Actions ne sont plus à quota. L'adresse `origin` du poste passe à `https://github.com/emnormandie76/EM-Drive.git` (accord du propriétaire). |

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
8. **`NEON_PROJET_ID` s'écrit avec « PROJET »** (faute figée dans `actions.ts`). Depuis l'étape 3, elle et
   `NEON_API_KEY` sont nommées dans `.env.example`, avec cette remarque ; le nom n'a pas changé (renommer obligerait
   le propriétaire à changer `.env.local`).
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
    pas défini dans Git : le nom vient du compte Windows) ; ceux du portail et d'appVC, « emnormandie76 ». Réglé
    à l'étape 4 (D39) : identité `emnormandie76` dans la configuration locale du dépôt. Depuis D51, le dépôt est
    public et la règle ne le vise plus ; l'identité reste, au cas où il redeviendrait privé.
14. **Types de routes périmés après le retrait d'une route** (étape 2a) : `.next/types` et `.next/dev/types`
    (écrits par `next dev` ou `next build`) citent encore les routes retirées, et `npx tsc --noEmit` échoue
    (TS2307). `npx next typegen` régénère `.next/types` ; `.next/dev/types` se régénère au `next dev` suivant
    ou s'efface (cache ignoré par Git).
15. **Dans le Chrome du propriétaire, ne jamais viser un bouton par son seul type** (étape 3). La barre de
    navigation porte un formulaire `POST /api/auth/logout` dont le bouton `type="submit"` existe dans le DOM même
    masqué (sous 1024 px) : `querySelector('button[type=submit]')` le trouve en premier. Un script de l'essai l'a
    cliqué et a déconnecté le propriétaire de ResaVroom (et du portail, par la fin de session). Viser une classe
    ou un texte dans le conteneur de l'écran (`.wizard-content .search-submit-btn`). Autres constats de l'essai :
    une fenêtre agrandie ne se redimensionne pas (simuler les largeurs dans un `iframe` de même origine, où les
    `@media` suivent la largeur du cadre) ; une capture d'écran peut prendre plus de 10 s.
16. **Une variable vide n'est pas une variable absente** (étape 4). Next ne remplace pas par `.env.local` une
    variable déjà posée, même vide (`@next/env`) : c'est ce qui permet de simuler une Preview sans base en vidant
    les variables dans le seul processus du build. Mais NextAuth lit `NEXTAUTH_URL ?? VERCEL_URL` : une
    `NEXTAUTH_URL` vide n'est pas remplacée, et le pré-rendu de `/trips/new` échoue (`Invalid URL`). Sur Vercel, ne
    jamais poser une variable vide ; pour imiter une Preview sur le poste, donner à `NEXTAUTH_URL` une adresse de
    Preview plutôt que la vider.

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

### Étape 2b — Recherche par l'annuaire du portail ✅ (2026-10-28)

**Source :** contrat portail v1 §7 (copie figée au §3.7 du P-01). **Tranchées en début d'étape :** D24 à D28 (§2.6).

- [x] Le propriétaire fait ouvrir l'annuaire sur le client `dev` par le super-admin du portail (G22). *Ouvert
      le 2026-10-28 à 16 h 18, selon l'agent du portail ; refermé à 16 h 59 après l'essai (dernière case).*
- [x] Tests d'abord contre une imitation qui suit le §3.7 du contrat (aucun réseau, règle 7) : jeton
      `client_credentials` et `scope=directory` gardé jusqu'à `expires_in` (une heure), `q` d'au moins deux
      caractères, 400 `unauthorized_client`, 401, 429. (`tests/helpers/portail-fake.ts`,
      `tests/portail-directory.test.ts`, `tests/directory-routes.test.ts`, ajouts aux tests des schémas et du
      service : 45 en échec contre l'ancien code, dont les 24 du module absent.)
- [x] `/api/users/search` appelle l'annuaire côté serveur, avec le client de son environnement, et rend `sub`,
      `name`, `email` (D26) ; `UserSearchAutocomplete`, `StepConfirm` et `AdminEditTripModal` passent sur `sub`
      et `name`. Module `src/lib/portail-directory.ts`, `server-only` (D28) ; erreurs 503 et 429 (D25).
- [x] L'identité d'une autre personne (conducteur choisi par un admin, passager ajouté) ne se recopie plus du
      corps de la requête sans contrôle (écart 5 ci-dessus) : relue dans l'annuaire (D24), dans les trois routes.
- [x] Passagers à la création d'un trajet choisis dans l'annuaire, avec leur `sub` (cas limite 11) ; conducteur
      et doublons masqués et refusés (D27).
- [x] Essai sur le poste, annuaire ouvert sur le client `dev`, puis refermé : (1) recherche, (2) un admin choisit
      le conducteur dans l'annuaire, (3) écart 5 et passager égal au conducteur refusés, puis fermeture et
      comportement « annuaire fermé ». *Fait le 2026-10-28, conforme (journal) ; passager de bout en bout non
      essayé en réel (une seule personne dans la grille, choix du propriétaire).*
- [x] Validation du propriétaire (2026-10-28) ; commit à sa demande, le même jour.

Vérifications de fin d'étape : `npm test` 219 tests verts (11 fichiers) ; `npx tsc --noEmit` 0 erreur ;
`npm run lint` 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs à l'étape 1 (aucun nouveau). Aucune
migration.

Écarts au plan : `updateTripInfo` refuse aussi un nouveau conducteur qui est passager du trajet, et la modale
admin ne propose pas les passagers comme conducteur (même règle que « passager égal au conducteur », relevée en
écrivant l'écart 5) ; `createTrip` refuse un passager en double (sinon 500) ; l'annuaire a été refermé par
l'agent, dans le Chrome du propriétaire et à sa demande, et non par le super-admin lui-même ; le temps 3 de
l'essai a été joué par l'agent dans la session du propriétaire (Claude in Chrome), à sa demande.

**Docs :** architecture §1, §2.1 (et §2.1 bis, nouveau), §2.4, §3, §4, §4.1, §7, §8, §9 ; mémo §0, §1, §3, §5 ;
`edgecase.md` (5, 7, 11) ; `CLAUDE.md` ; `README.md`.

### Étape 3 — Polish (phase 11 du SAD)

**Tranchées en début d'étape (2026-10-28) :** D5, D30 à D35 (§2.7). Contenu : l'ébauche du 2026-10-26, précisée.

- [x] ESLint (D5) : `eslint-disable` retirés hors `src/generated/`, `any` remplacés par de vrais types, variables
      mortes supprimées ; `npm run lint` à 0 problème ; `eslint.config.mjs` inchangé.
- [x] Pages Next à la racine (D33) : `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`, en français.
- [x] États de chargement, vides et d'erreur homogènes dans les écrans (composant commun) ; une erreur de l'API
      ne s'affiche plus comme une liste vide.
- [x] Responsive à 375, 768 et 1280 px : tableau de bord, trajets, nouveau trajet, détail, calendrier, administration.
- [x] Utilitaires CSS employés définis dans `globals.css` (D36, posée en cours d'étape).
- [x] Mentions de mails retirées (D31).
- [x] Cas 10 (D34) : plaque déjà prise → 409 `LICENSE_PLATE_TAKEN`, tests d'abord vus en échec.
- [x] Cas 8 (D32) : nettoyage filtré sur la fin du trajet, statut validé, tests d'abord vus en échec ; modale de
      confirmation où l'on tape un mot.
- [x] « Mes trajets à venir » (D32) : filtre côté serveur, tests d'abord vus en échec.
- [x] Métriques Neon au clic (D35).
- [x] Outillage (D32) : `.env.example` (piège 8), `@prisma/adapter-pg`, `page.module.css`, type de retour de
      `requireAuthSession`.
- [x] `npm run build` sans erreur (D30 : `/admin` dynamique, `DATABASE_URL` factice dans le processus du build).
- [x] Essai avec le propriétaire, connecté lui-même (agent dans son Chrome, à sa demande) : écrans principaux aux
      trois largeurs, avec leurs états ; message « annuaire indisponible » de la recherche (annuaire fermé) ; build.
- [x] Validation du propriétaire (2026-10-29).

Résultat : `npm test` 242 verts (15 fichiers) ; `tsc` 0 erreur ; `npm run lint` 0 problème ; `npm run build` sans
erreur. Aucune migration, aucune écriture en base ; une dépendance retirée (`@prisma/adapter-pg`), aucune ajoutée.

Ajouts en cours d'étape, au-delà des cases (défauts trouvés en polissant, tous dans le périmètre « états,
responsive, polish ») : filtre du journal d'audit qui n'envoyait pas le bon paramètre (`entity` au lieu de
`entityType`) et options périmées (administrateurs, services) ; campus du formulaire de véhicule tirés des véhicules
(flotte vide : aucun campus) ; jetons de couleur employés mais non définis ; `/login` et `/unauthorized` enfermées
dans le conteneur de 1200 px ; `/trips/new` qui n'importait pas sa feuille ; grilles de cartes qui débordaient à
375 px ; barre de bureau qui débordait entre 769 et ~950 px (menu mobile jusqu'à 1023) ; `.admin-container` à
`100vw` (barre horizontale sous Windows) ; bouton « Réserver » désactivé mais cliquable dans son lien ; lien
« Dashboard » en anglais ; libellés accessibles des boutons d'icônes ; message français pour une coupure réseau.

**Docs :** architecture §3, §4, §6, §7, §8, §9 ; mémo §0, §1, §5 ; cas limites 8 et 10 ; `CLAUDE.md` ; README ;
ce plan (§2.7, pièges 8 et 15).

### Étape 4 — Mise en ligne ✅ (2026-10-29)

**Tranchées en début d'étape (2026-10-29) :** D6, D16, D37 à D49 (§2.8). Contenu : l'ébauche du 2026-10-26, plus
la sécurité d'un service exposé (D37) ; pas de notifications (D6).

- [x] Auteur des commits (D39) : identité `emnormandie76` dans la configuration locale du dépôt.
- [x] En-têtes de sécurité et CSP (D43), tests d'abord, vus en échec.
- [x] Limitation de débit des trois routes à quota (D44, cas 6), tests d'abord, vus en échec.
- [x] Région `fra1` (D46) dans `vercel.json` ; CI GitHub Actions (D42).
- [x] Métriques Neon « non configurées » sans clé (D49) ; `MAIL_SENDER_ADDRESS` retirée (D6) ; cas 7 consigné
      comme risque accepté (D45).
- [x] Branche Neon `dev` pour le poste (D40), créée sur accord ; `.env.local` repointé par le propriétaire.
- [x] Compte rendu pour l'agent du portail (rendez-vous « avant l'étape 4 ») : client `production` (adresses
      exactes), adresse d'accueil définitive, mode restreinte (D16), annuaire ouvert sur ce client (D48). Réglages
      faits par le propriétaire ou l'agent du portail, jamais par l'agent de ResaVroom (G25).
- [x] Le propriétaire avance `main` (D38), crée le projet Vercel (`em-drive`, D41, D50), pose les variables de
      production (liste exacte fournie par l'agent) et relie la base `resavroom` à ce seul projet, pour Production
      seulement.
- [x] Déploiement de production `READY` ; essai en ligne avec le propriétaire, connecté lui-même (sept temps,
      tous conformes ; le 6 sans objet, D6).
- [x] Procédure de livraison, de vérification en ligne et de retour arrière (mémo §4).
- [x] Validation du propriétaire (2026-10-29).

Résultat : `npm test` 273 verts (19 fichiers) ; `tsc` 0 erreur ; `npm run lint` 0 problème ; `npm run build` sans
erreur (aussi sans base ni portail, comme une Preview) ; CI verte sur `dev-claude` et `main` (trois exécutions) ;
déploiement de production `READY` (`dpl_2kYTrEtQrJE4eJf9eer6Wo79mWrT`, `fra1`) ; Preview `READY` et fermée. Aucune migration ; une branche Neon créée (`dev`) ;
aucune écriture de l'agent en base ; aucune dépendance ajoutée.

Écarts au plan : deux commits au lieu d'un (le code avant la mise en ligne, les docs après l'essai) ; projet nommé
`em-drive` par le propriétaire et dépôt renommé `EM-Drive` et public (D50, D51), d'où une adresse de production
autre que celle de D41 ; premier déploiement sans `NEXTAUTH_SECRET` (`error=Configuration`), corrigé par le
propriétaire ; portée de l'équipe Vercel accordée au MCP en cours d'essai (journaux) ; pas de SELECT après le
temps 2 (choix du propriétaire) ; `ORS_API_KEY` non posée en production (facultative) ; piège 16 ajouté.

**Docs :** mémo d'exploitation (§0, §1, §1.1, §2, §3, §4, §5), architecture §1, §2.1, §4, §7, §8, §8.1, §9, cas
limites 6 et 7, ce plan (§2.8, pièges 13 et 16, §6), CLAUDE.md, README.

---

## 6. Hors périmètre

- Microsoft Entra ID et Graph (G8).
- Nouvelles fonctionnalités métier non demandées (nouveaux types de trajet, autres campus).
- Le renommage de l'application en « EM Drive » (nom, identifiant du portail, cookies, textes), confié plus tard
  à un autre agent sur ordre du propriétaire (D50).
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
| 2026-10-28 | 2b | **Départ vérifié.** `dev-claude` sur `25a24c0` ; arbre non propre : les corrections de docs du jour (validation de la 2a, journal, mémo §3, `CLAUDE.md`), signalées au propriétaire, puis commitées à part à sa demande (`0e02221`, sans push). `npm test` 169 verts (9 fichiers) ; `npx tsc --noEmit` 0 erreur ; `npm run lint` 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs. Lus : ce plan, l'architecture, le mémo, les cas limites, le contrat portail v1 §7 et le P-01 §3.7 ; guides Next `route.md`, `05-server-and-client-components.md` (« server-only »), `data-security.md`. Pour information, en lecture seule, le code de l'annuaire du portail : filtre `ILIKE` sur le nom ou l'adresse, secrets de 48 caractères alphanumériques, 120 requêtes par minute. | Session sur Opus 5.5. |
| 2026-10-28 | 2b | **Décisions de début d'étape** : D24 à D28 (§2.6), toutes les recommandations retenues. | — |
| 2026-10-28 | 2b | **Tests d'abord, vus en échec.** Imitation du portail (`tests/helpers/portail-fake.ts` : découverte, jeton vérifié en `client_secret_basic`, annuaire filtré comme celui du portail, pannes réglables) ; `tests/portail-directory.test.ts` (24) ; `tests/directory-routes.test.ts` (21) ; 3 tests ajoutés aux schémas, 2 au service. Contre l'ancien code : 45 en échec (24 : module absent ; 17 routes ; 2 schémas ; 2 service), 4 au vert (comportements à garder : 401, moins de deux caractères, conducteur non admin, création sans annuaire). Un test qui passait pour une mauvaise raison (refus du schéma, pas de l'annuaire) a été resserré sur le code `PERSON_NOT_IN_DIRECTORY`. Secret fictif : un deux-points et l'exemple de l'annexe B de la RFC 6749. | — |
| 2026-10-28 | 2b | **Code.** `src/lib/portail-directory.ts` (`server-only`), trois erreurs métier (503, 429, 400), route de recherche, `resolveChosenPerson` dans `POST /api/trips`, `PATCH /api/trips/[id]` et `POST /api/trips/[id]/passengers`, schémas (le nom n'est plus lu), `createTrip` (doublon), `updateTripInfo` (nouveau conducteur passager), `UserSearchAutocomplete`, `StepConfirm`, `AdminEditTripModal`, alias Vitest. 219 tests verts ; `tsc` 0 erreur ; lint inchangé. | `tsc` : les routes ont un type de retour qui admet `undefined` (union de `requireAuthSession`), déjà contourné à l'étape 1 ; le nouveau test enveloppe les routes. |
| 2026-10-28 | 2b | **Contrôle du serveur** (`npm run dev`, sans connexion) : la route compile avec `server-only` sous Turbopack ; `/api/users/search` → 401 sans appel au portail ; `/trips/new` → 307 `/login`. | — |
| 2026-10-28 | 2b | **Essai réel**, le propriétaire connecté lui-même : (1) recherche : côté passagers, le propriétaire (conducteur) n'est pas proposé ; côté conducteur (admin, « pour vous » décoché), il apparaît avec son adresse ; journal : une recherche en 200 (416 ms, jeton compris), aucune erreur ; (2) accord du propriétaire, il se choisit comme conducteur et confirme : 201 ; base (SELECT) : un trajet `SCHEDULED`, conducteur = sa ligne de `people` (même `sub`, adresse, nom), aucun passager, audit `TRIP_CREATED` ; (3) à sa demande, l'agent joue dans sa session (Claude in Chrome, `fetch` depuis la page) trois créations forgées : conducteur au `sub` inventé avec son adresse → 400 `PERSON_NOT_IN_DIRECTORY` ; passager égal au conducteur → 400 `VALIDATION_ERROR` ; passager au `sub` inventé → 400 `PERSON_NOT_IN_DIRECTORY` ; base inchangée (1 trajet, 0 passager, 1 audit). Choix du propriétaire : pas de passager de bout en bout (une seule personne dans la grille) ; trajet d'essai laissé en place. | Au temps 1, la seconde recherche (même texte) est venue du cache du navigateur (SWR), sans requête. Le choix « soi-même comme conducteur » passe par la session, pas par l'annuaire : la vérification par l'annuaire n'a été vue en réel qu'au temps 3. Le message d'erreur affiché par la liste (D25) n'a pas été regardé à l'écran en réel (vérifié par l'API). |
| 2026-10-28 | 2b | **Annuaire refermé** à 16 h 59, à la demande du propriétaire, par l'agent dans le Chrome du propriétaire (administration du portail, fiche ResaVroom, client « Dev (poste) », « Fermer l'annuaire » ; la page affiche ensuite « Annuaire : fermé »). Rien d'autre touché dans le portail ; aucun MCP sur ses ressources. Vérifié aussitôt depuis la session du propriétaire : deux recherches → 503 `DIRECTORY_UNAVAILABLE` ; journal du serveur : `[ANNUAIRE] Indisponible : annuaire fermé sur ce client (unauthorized_client).`, sans autre donnée. Serveur arrêté par son port après vérification de sa ligne de commande ; onglet du portail fermé. | **Écart** : le plan voulait le super-admin, puis un avertissement au propriétaire ; le propriétaire (connecté au portail avec le menu d'administration) a demandé à l'agent de le faire. À signaler à l'agent du portail (compte rendu). |
| 2026-10-28 | 2b | **Fin d'étape.** `npm test` 219 verts (11 fichiers) ; `tsc` 0 erreur ; `lint` 17 problèmes, tous antérieurs. Aucune migration, aucune dépendance. Docs : architecture (§1, §2.1, §2.1 bis nouveau, §2.4, §3, §4, §4.1, §7, §8, §9, « contrat portail v1 »), mémo (§0, §1, §3, §5), cas limites (5, 7, 11), `CLAUDE.md`, `README.md`, ce plan (§2.6, étape 2b). Compte rendu pour l'agent du portail préparé. | Rien n'est commité (le commit `0e02221` ne porte que les docs de la 2a). En attente de validation. |
| 2026-10-28 | 2b | **Étape 2b validée** par le propriétaire, et commitée à sa demande sur `dev-claude` (sans push). | Prochaine étape : 3, sur son feu vert. Le compte rendu pour l'agent du portail est remis au propriétaire. |
| 2026-10-28 | 2b (suivi du portail) | **Message de l'agent du portail**, transmis par le propriétaire : étape 2b (`aa655a0`) vérifiée en lecture seule, conforme au contrat portail v1 §7. **Nouvelle règle du portail D29**, recopiée en G25 : l'agent d'une application ne travaille jamais dans l'administration du portail, même dans la session du propriétaire. Consignée au §0, au §2.3, à l'étape 4, dans `CLAUDE.md` et le mémo §3. Prompt de départ de l'étape 3 rédigé pour un agent neuf (remis au propriétaire, hors du dépôt). | La fermeture de l'annuaire par l'agent, le 2026-10-28 à 16 h 59, serait contraire à G25 : ne pas recommencer. Ces docs ne sont pas commitées. |
| 2026-10-28 | 3 | **Départ vérifié.** `dev-claude` sur `aa655a0`, deux commits d'avance sur `origin/dev-claude` (`0e02221`, `aa655a0`) ; arbre non propre, comme prévu par le propriétaire : les docs G25 du suivi ci-dessus (`CLAUDE.md`, ce plan, mémo §3), signalées au propriétaire. `npm test` 219 verts (11 fichiers) ; `npx tsc --noEmit` 0 erreur ; `npm run lint` 17 problèmes (14 erreurs, 3 avertissements), tous antérieurs. Lus : ce plan, l'architecture, le mémo, les cas limites ; guides Next `loading.md`, `error.md`, `not-found.md`, `production-checklist.md`, `connection.md`, `environment-variables.md` (ordre de chargement), `route.md`. Relevé : 19 `eslint-disable` de fichier et 4 de ligne hors code généré ; sans eux, 73 problèmes (47 erreurs, 26 avertissements) ; aucune page `error`, `not-found` ni `loading`. | Session sur Opus 5.5. **Défauts relevés en lisant le code** : « Mes trajets à venir » calculé sur les 5 prochains trajets de tout le monde ; nettoyage des trajets filtré sur leur date de création (un trajet futur réservé il y a plus d'un mois serait supprimé) ; `/admin/settings` appelle l'API Neon dès l'ouverture (règle 7). |
| 2026-10-28 | 3 | **Décisions de début d'étape** : D5, D30 à D35 (§2.7), toutes les recommandations retenues ; les quatre dettes proposées entrent dans l'étape. | Restent hors de l'étape : cas 12, `DEP0169`. |
| 2026-10-28 | 3 | **Tests d'abord, vus en échec.** `tests/vehicle-routes.test.ts` (cas 10), `tests/database-cleanup.test.ts` (cas 8 : le filtre reçu par `deleteMany` est évalué sur des trajets types), `tests/trips-list.test.ts` (`mine=true`) ; client Prisma simulé complété (`findMany`, `count`, `deleteMany`). Contre l'ancien code : 9 en échec (500 au lieu de 409 ; trajets futurs visés ; aller-retour jugé sur l'aller ; statut inconnu accepté ; aucun filtre « les miens »), 9 au vert (comportements à garder). Code : `LicensePlateTakenError`, `isUniqueConstraintError` (P2002, vérifié dans le runtime Prisma : l'adaptateur Neon convertit le 23505), `cleanupDatabase` réécrite, `mine` dans `GET /api/trips`, unions explicites dans `api-helpers.ts`. 237 verts. | Aucune garde modifiée ; le type des gardes seul a changé. |
| 2026-10-28 → 29 | 3 | **ESLint et écrans.** 19 `eslint-disable` de fichier et 4 de ligne retirés ; vrais types (`Prisma.TripWhereInput`, `AuditAction`, `AdminTrip`, `TripDetailData`, `SuggestedTrip`, `NeonMetrics`…). `PageState`, `fetch-json`, pages `error`/`global-error`/`not-found`/`loading`, `connection()` dans `/admin`, mentions de mails, `DatabaseControls` (métriques au clic, modale `SUPPRIMER`), responsive. **Surprise**, d'où **D36** (question posée en cours d'étape, recommandation retenue) : 56 classes de style Tailwind employées et définies nulle part. Autres défauts trouvés en polissant, corrigés (liste à l'étape 3, §5). `npm run lint` 0 problème, 0 aussi avec `--no-inline-config`. | Relevés, **non corrigés** (hors du contenu) : `destinationCampusId` jamais envoyé à `/api/vehicles/availability` (suggestions non filtrées par destination) ; `vehicleId` du bouton « Réserver » ignoré par l'assistant ; « Modifier l'heure » désactivé sans fonction. Consignés au mémo §5 et au README. |
| 2026-10-29 | 3 | **Build** avec `DATABASE_URL` factice dans son seul processus (D30) : sans erreur ; toutes les routes `/admin` et `/api` dynamiques, seules des pages client sans base pré-rendues ; `tsc` relancé après (piège 14) : 0 erreur. | Jamais rejoué depuis le début du chantier : il passait sans correctif propre au build. |
| 2026-10-29 | 3 | **Base relue** (SELECT, `wispy-shadow-66847588`) avant l'essai : 1 personne, 1 trajet, 0 passager, 2 lignes d'audit, 3 véhicules. Le trajet d'essai de la 2b est **annulé** (`TRIP_FORCE_DELETED` le 2026-10-28 à 16 h 56, quatre minutes après sa création, trois avant la fermeture de l'annuaire). Signalé au propriétaire ; rien touché. | **Écart au journal de la 2b**, qui dit le trajet laissé en place et « 1 audit ». Mémo §0 corrigé. |
| 2026-10-29 | 3 | **Essai**, à la demande du propriétaire, par l'agent dans son Chrome (Claude in Chrome), sur `localhost:3002` seulement ; le propriétaire s'est connecté lui-même. Fenêtre agrandie, non redimensionnable : largeurs simulées dans un `iframe` de même origine. (1) Tableau de bord à 375, 768 et 1280 px, sans débordement ; états vide (« Aucun trajet à venir »), chargement (appels `/api` ralentis dans le cadre) et erreur (coupés : « Le serveur ne répond pas… », puis « Réessayer ») ; (2) onze écrans (trajets, nouveau trajet, détail, trajet et page inconnus, calendrier, cinq pages admin) aux trois largeurs : aucun débordement ; 404 et « Trajet introuvable » en français ; métriques Neon non chargées à l'ouverture ; (3) assistant à 375 px jusqu'à l'étape 2, l'appel d'itinéraire coupé dans la page (aucun appel à OpenRouteService), passager « an » → « La recherche de collègues est indisponible : l'annuaire du portail ne répond pas. Réessayez plus tard. » ; journal du serveur : `[ANNUAIRE] Indisponible : annuaire fermé sur ce client (unauthorized_client).`, 503, aucun `POST /api/trips`. Onglet fermé ; serveur arrêté par son port après vérification de sa ligne de commande. Contrôles finaux : 242 tests verts (15 fichiers), `tsc` 0, lint 0, build sans erreur. | **Incident** : un script de l'agent a cliqué le premier `button[type=submit]` du cadre, qui était le bouton (masqué) de déconnexion de la barre : le propriétaire a été déconnecté de ResaVroom et, par la fin de session, probablement du portail. Aucune donnée touchée, rien dans l'administration du portail. Le propriétaire s'est reconnecté lui-même. Piège 15 ajouté. Ajouté pendant l'essai : message français pour une coupure réseau (`fetch-json`, test vu en échec), `/login` pleine fenêtre. | Fin d'étape : en attente de validation. |
| 2026-10-29 | 3 | **Étape 3 validée** par le propriétaire, commitée et poussée à sa demande sur `dev-claude` (`origin`), avec les docs G25 du suivi du portail restées non commitées depuis le 2026-10-28 (même fichiers) ; le push emporte aussi `0e02221` et `aa655a0`. Prompt de départ de l'étape 4 rédigé pour un agent neuf (remis au propriétaire, hors du dépôt). | Prochaine et dernière étape : 4. |
| 2026-10-29 | 4 | **Départ vérifié.** `dev-claude` sur `f758905`, égal à `origin/dev-claude`, arbre propre ; `npm test` 242 verts (15 fichiers) ; `npx tsc --noEmit` 0 erreur ; `npm run lint` 0 problème ; `npm run build` (`DATABASE_URL` factice) sans erreur, puis `tsc` 0. Base relue (SELECT) : 1 personne `ADMIN`, 1 trajet annulé, 0 passager, 2 lignes d'audit, 3 véhicules, 3 campus, `buffer_minutes=30`, 2 migrations. Aucun écart au point de départ attendu. Lus : ce plan, l'architecture, le mémo, les cas limites, le contrat portail v1 ; guides Next `deploying-to-platforms.md`, `environment-variables.md`, `production-checklist.md`, `content-security-policy.md`, `headers.md`. | Session sur Opus 5.5. **Relevés** (MCP en lecture) : offre Vercel **Hobby** du compte `emnormandie76` ; le MCP voit aussi `portail-admission` (pas seulement `app-vc` et les petits pronos) et n'a pas la portée de l'équipe (`get_team` 403) ; commits rattachés sur GitHub à `Anton1P` ; `main` porte le code d'avril (fournisseur de développement, cas 5) : un import du projet le déploierait aussitôt ; `https://resavroom.vercel.app` répond `DEPLOYMENT_NOT_FOUND` (nom libre en apparence) ; base à Francfort, fonctions Vercel à Washington par défaut. Les conditions de Vercel réservent Hobby à un usage personnel non commercial : signalé au propriétaire, à qui le jugement revient. |
| 2026-10-29 | 4 | **Décisions de début d'étape** : D6, D16, D37 à D49 (§2.8), toutes les recommandations retenues ; étape 4 réécrite (§5). | D48 et D49 posées après les trois premières séries, en préparant le compte rendu du portail et la liste des variables. |
| 2026-10-29 | 4 | **Identité du dépôt** (D39) : `git config --local` `user.name` `emnormandie76`, `user.email` `335444819+emnormandie76@users.noreply.github.com` (relevée dans le journal Git du portail, en lecture). **Tests d'abord, vus en échec** : `tests/security-headers.test.ts` (8), `tests/rate-limit.test.ts` (14), `tests/deployment-config.test.ts` (5), `tests/neon-metrics.test.ts` (4) ; contre l'ancien code, 24 en échec (aucun en-tête ; 200 au lieu de 429 ; `vercel.json`, workflow absents ; `MAIL_SENDER_ADDRESS` lue nulle part ; erreur au lieu de « non configuré »), 7 au vert (comportements à garder : 401 sans session, requêtes non comptées, non-admin refusé). Un test qui passait pour une mauvaise raison (« la réponse 429 ne dit rien de la personne », sans 429) a été resserré. **Code** : `next.config.ts` (en-têtes, CSP, `poweredByHeader`), `src/lib/rate-limit.ts` et trois routes, `vercel.json`, `.github/workflows/ci.yml`, `getNeonMetrics` et `DatabaseControls`, `.env.example`. 273 tests verts (19 fichiers), `tsc` 0, lint 0. | — |
| 2026-10-29 | 4 | **Builds.** Build normal (`DATABASE_URL` factice) sans erreur, puis `tsc` 0. Build « façon Preview » (base, portail et `NEXTAUTH_SECRET` vidés dans le seul processus) : **échec** au pré-rendu de `/trips/new`, `Invalid URL` sur une chaîne vide ; cause : NextAuth lit `NEXTAUTH_URL ?? VERCEL_URL`, et une `NEXTAUTH_URL` vide n'est pas remplacée (sur Vercel, elle est absente et `VERCEL_URL` existe). Relancé avec une `NEXTAUTH_URL` d'adresse de Preview : sans erreur. `next start` (3002, `DATABASE_URL` factice) : en-têtes et CSP servis sur `/login` et `/api/trips`, `form-action` avec l'origine du portail, pas de `X-Powered-By` ; `/dashboard` → 307 `/login` ; `/api/trips` → 401 ; un seul fournisseur. Serveur arrêté par son port après vérification de sa ligne de commande. | **Surprise** : piège 16 ajouté (une variable vide n'est pas absente). La CSP n'a pas encore été vue dans un navigateur connecté (essai en ligne, ou sur le poste une fois la branche `dev` en place). |
| 2026-10-29 | 4 | **Branche Neon `dev`** (D40), accord du propriétaire : `create_branch` (MCP Neon) dans `wispy-shadow-66847588`, enfant de `main` ; `dev` = `br-rapid-butterfly-bawwyftk`, point d'accès `ep-morning-water-bae4q8e2` ; relue en SELECT : mêmes comptes que `main`. Compte rendu pour l'agent du portail rédigé (hors du dépôt). Accord du propriétaire pour un commit et un push du code avant l'essai en ligne (la production déploie `main`, avancée sur `dev-claude`). | `.env.local` à repointer par le propriétaire. **Écart** : l'étape aura deux commits (le code avant la mise en ligne, les docs après l'essai), au lieu d'un. |
| 2026-10-29 | 4 | **Commit `e75a5d0`** (code de l'étape, auteur `emnormandie76 <335444819+emnormandie76@users.noreply.github.com>`), **poussé** sur `origin/dev-claude` à la demande du propriétaire (`f758905..e75a5d0`). GitHub rattache le commit au compte `emnormandie76` (D39 tenue). Le push lance la première exécution de la CI (n° 1, `40847504836`). Guide des actions du propriétaire remis : poste sur `dev`, avance de `main`, import du projet, portail, variables, base, redéploiement. | Le push a duré plus de deux minutes (attente d'identification de Git, probablement). Résultat de la CI à relever. |
| 2026-10-29 | 4 | **CI n° 1 verte** (49 s). **Projet Vercel créé par le propriétaire, sans déploiement**, sous le nom **`em-drive`** (`prj_0k8AbhtL2khvOn9YKfoB4a3AhWdn`) : Next.js, Node 24.x, aucun domaine encore, authentification Vercel active (`all_except_custom_domains`) ; le MCP ne montre pas le dépôt relié (à vérifier par le propriétaire). `https://em-drive.vercel.app` : `DEPLOYMENT_NOT_FOUND` (nom libre en apparence). Le dépôt GitHub est **renommé `EM-Drive`** (l'ancien nom redirige) et **public**. Historique Git parcouru (valeurs masquées) : aucun secret. Décisions **D50** (adresse `em-drive.vercel.app`, compte rendu du portail réécrit maintenant) et **D51** (dépôt public voulu ; `origin` mis à jour). Le propriétaire est guidé pour repointer `.env.local` sur la branche `dev` (deux adresses : pooled et directe). | `get_project` avec `teamId` répond 403 (portée de l'équipe), mais sans `teamId` il répond. Renommage de l'application (« EM Drive ») hors de l'étape : identifiant `resavroom`, cookies `resavroom.*`, textes et docs gardent l'ancien nom. |
| 2026-10-29 | 4 | **`.env.local` repointé par le propriétaire** ; vérifié à sa demande par un script qui n'affiche que les noms d'hôte, les identifiants non secrets et « posée / absente » : `DATABASE_URL` → `ep-morning-water-bae4q8e2-pooler` (branche `dev`, pooled), `DATABASE_URL_UNPOOLED` → `ep-morning-water-bae4q8e2` (branche `dev`, directe), base `neondb`, `sslmode=require` ; `NEXTAUTH_URL` = `http://localhost:3002` ; secrets posés ; aucune variable vide. | **Erreur relevée** : `NEON_PROJET_ID` avait reçu l'identifiant du point d'accès (`ep-morning-water-bae4q8e2`) au lieu de celui du projet (`wispy-shadow-66847588`) ; sans effet sur la base, mais les métriques de `/admin/settings` échoueraient. Signalé au propriétaire. |
| 2026-10-29 | 4 | **Portail** (message de son agent, transmis par le propriétaire) : client `production` créé (retour `https://em-drive.vercel.app/api/auth/callback/portail`, déconnexion `https://em-drive.vercel.app/login`), identifiant et secret posés par le propriétaire sur Vercel (`em-drive`, Production) ; accueil `https://em-drive.vercel.app/` ; annuaire ouvert sur le client `production`, fermé sur `dev` ; mode restreinte, grille et client `dev` inchangés ; pas de recette ; identifiant `resavroom` et nom « ResaVroom » gardés. Le propriétaire a corrigé `NEON_PROJET_ID` (non revérifié). **Le propriétaire a avancé `main`** sur `e75a5d0` (CI n° 2 sur `main` verte). **Deux déploiements de production `READY`** (le second, `dpl_7xGinjwteLTAjzeSmZjWwiK43dGc`, par *Redeploy*) : région `fra1`, alias `em-drive.vercel.app`, seul domaine du projet. Contrôle sans session : en-têtes et CSP servis, `/login` 200 (production publique malgré l'authentification Vercel) ; **mais** `/dashboard` → 307 `/api/auth/error?error=Configuration`, `/api/auth/providers` et `/api/trips` → 500. | **Défaut** : la réponse « Configuration » du proxy (`withAuth`) est celle de NextAuth v4 quand `NEXTAUTH_SECRET` manque à l'exécution ; signalé au propriétaire (nom exact, environnement Production, puis *Redeploy*). Journaux d'exécution refusés au MCP (403 : portée de l'équipe `em-normandie1` ; `get_runtime_logs` et `get_runtime_errors` exigent `teamId`). |
| 2026-10-29 | 4 | **Portée de l'équipe accordée au MCP Vercel** par le propriétaire (lien de consentement `authorize_team_access`, à sa demande ; lectures seulement, règles de `CLAUDE.md` inchangées). `get_runtime_errors` : `[next-auth][error][NO_SECRET]` 40 fois (9 h 32 à 9 h 54 UTC) sur `/middleware`, `/api/auth/[...nextauth]`, `/api/trips`, et une erreur « problem with the server configuration » qui en découle ; traces techniques seulement, sans donnée personnelle ni secret. Diagnostic confirmé : `NEXTAUTH_SECRET` absente de l'environnement Production à l'exécution. | En attente : variable corrigée et *Redeploy* par le propriétaire. |
| 2026-10-29 | 4 | **`NEXTAUTH_SECRET` posée par le propriétaire, redéployé** : `dpl_AeNr9yJNKxE2a36A8ndwGmyjzRA9` `READY` (production, `main` `e75a5d0`). Contrôle sans session (mémo §4.2) : `/login` 200 avec en-têtes et CSP ; `/dashboard` → 307 `/login` ; `/api/trips` → 401 ; un seul fournisseur, `callbackUrl` `https://em-drive.vercel.app/api/auth/callback/portail` ; cookies `__Host-resavroom.csrf-token`, `__Secure-resavroom.callback-url`, `.state`, `.pkce.code_verifier`, `.nonce`, tous `Secure`, `HttpOnly`, `SameSite` (noms seuls lus) ; demande de connexion vers `…/api/auth/oauth2/authorize` du portail, `response_type=code`, `scope=openid profile email`, retour exact, PKCE S256, `state`, `nonce`, `client_id` présents (valeurs non affichées). Erreurs d'exécution : les `NO_SECRET` restantes viennent toutes de l'ancien déploiement. Base de production (SELECT, `main`) : 1 personne `ADMIN`, 1 trajet, 0 passager, 2 lignes d'audit, 3 véhicules. | Prêt pour l'essai en ligne. |
| 2026-10-29 | 4 | **Essai en ligne, temps 1** (choix du propriétaire : retrait temporaire de son accès dans la grille, par lui ou l'agent du portail ; l'agent de ResaVroom n'y touche pas) : connexion tentée sur `https://em-drive.vercel.app` → refus affiché par le portail, aucun retour sur `em-drive` ; accès `ADMIN` rendu ensuite. **Validé par le propriétaire.** Base de production (SELECT) inchangée : 1 personne (dernière connexion 2026-10-29 8 h 17 UTC, sur le poste), 2 lignes d'audit, la dernière du 2026-10-28. Journaux du déploiement : seulement l'avertissement `DEP0169` d'`openid-client` (dette connue). | Les journaux indiquent `region=cdg1` pour l'entrée de la requête ; le déploiement s'exécute en `fra1` (`get_deployment`). |
| 2026-10-29 | 4 | **Essai en ligne, temps 2** : le propriétaire, connecté lui-même en `ADMIN`, a parcouru le tableau de bord, créé un trajet pour lui, ouvert son détail et l'administration, puis supprimé son trajet d'essai dans l'application. **Validé par le propriétaire.** À sa demande, la base n'est pas relue après ce temps. `ORS_API_KEY` n'est pas posée en production : la durée vient de l'estimation de secours (vol d'oiseau × 1,3, 70 km/h), et l'autocomplétion des communes passe par l'API Adresse, publique et sans clé (`BAN_API_URL` a une valeur par défaut). | **Écart à l'essai prévu** : pas de SELECT après le temps 2 (choix du propriétaire). `ORS_API_KEY` laissée au choix du propriétaire (facultative). |
| 2026-10-29 | 4 | **Essai en ligne, temps 3** : cookies `__Secure-resavroom.session-token` (`Secure`, `HttpOnly`) et `__Host-resavroom.csrf-token`, aucun `next-auth.*` (noms seuls regardés) ; `/api/auth/session` : `expires` 8 h après la connexion, inchangé au rechargement. **Conforme**, selon le propriétaire. Base de production (SELECT) : rôle `ADMIN`, connexion du temps 2 à 10 h 08 UTC (fin de session attendue 18 h 08 UTC), 1 personne, 2 trajets, 4 lignes d'audit (trajet d'essai du temps 2 et sa suppression). Journaux : seul l'avertissement `DEP0169`. | — |
| 2026-10-29 | 4 | **Essai en ligne, temps 4** : déconnexion depuis la barre → passage par le portail sans confirmation → retour sur `https://em-drive.vercel.app/login` ; `/dashboard` renvoie ensuite vers `/login`. **Validé par le propriétaire.** Journaux : aucune erreur `[AUTH]` (l'adresse de fin de session a été lue dans la découverte). Base de production (SELECT) inchangée : 1 personne, 2 trajets, 0 passager, 4 lignes d'audit, aucun `SIGNIN_REFUSED`. **Temps 6** (notifications) : sans objet, D6. **Temps 7** (journaux, fenêtre de 50 min, la rétention Hobby étant d'une heure) : sur le déploiement en ligne `dpl_AeNr9…`, une seule ligne de niveau erreur, l'avertissement `DEP0169` (dette connue), et quatre avertissements « ORS API key not configured » (attendus sans clé) ; aucune adresse `@em-normandie.fr` ni « token » dans les journaux ; les 24 autres erreurs viennent toutes de l'ancien déploiement sans `NEXTAUTH_SECRET`. | Reste le temps 5 (une Preview n'a pas de connexion) : aucune Preview n'existe encore ; elle naîtra du prochain push sur `dev-claude`. |
| 2026-10-29 | 4 | **Commit `430a64e`** (docs de fin d'étape, auteur `emnormandie76`), poussé sur `dev-claude` à la demande du propriétaire ; CI n° 3 verte. **Essai en ligne, temps 5** : Preview `dpl_J1Wo9AuP94BH2RfATJWrvCmhTLMG` (`dev-claude`, `fra1`), compilée sans aucune variable, `READY`. Sans session, ses deux adresses (`em-drive-5g88kw7ee-…` et l'adresse fixe `em-drive-git-dev-claude-em-normandie1.vercel.app`) renvoient toutes les routes (`/login`, `/dashboard`, `/api/auth/providers`, `/api/auth/signin/portail`, `/api/trips`) vers la connexion de Vercel (302 `vercel.com/sso-api`) : authentification Vercel des Preview. Le propriétaire, passé par son compte Vercel : « Se connecter avec le portail » ne mène à aucune session. **Conforme.** Journaux de la Preview : `NO_SECRET` seulement (attendu, aucune variable en Preview), sans donnée personnelle. **Déploiement en ligne** : `dpl_2kYTrEtQrJE4eJf9eer6Wo79mWrT` (*Redeploy* du propriétaire vers 10 h 19 UTC, `main` `e75a5d0`, `fra1`, alias `em-drive.vercel.app`) ; seul journal : `DEP0169` ; contrôle sans session refait : en-têtes, 307, 401, fournisseur et adresse de retour conformes. **Les sept temps de l'essai sont faits** (temps 6 sans objet). | Le *Redeploy* de 10 h 19 n'a pas été annoncé à l'agent (après le temps 2) ; relevé en lisant les déploiements. |
| 2026-10-29 | 4 | **Fin d'étape.** `npm test` 273 verts (19 fichiers) ; `tsc` 0 ; lint 0 ; build sans erreur (code inchangé depuis `e75a5d0` ; la CI l'a rejoué sur `430a64e`). Docs : plan, architecture, mémo, cas limites, `CLAUDE.md`, `README.md` (commit `430a64e`), puis ce journal, la case de l'essai et le déploiement en ligne (non commités). Compte rendu au propriétaire. | En attente de validation ; à la validation, le chantier est terminé, et le propriétaire annonce « étape 4 faite » au portail. |
| 2026-10-29 | 4 | **Étape 4 validée** par le propriétaire : **chantier « mise en production » terminé.** Prompt de départ du renommage en « EM Drive » rédigé pour un agent neuf (Sonnet, choix du propriétaire ; remis au propriétaire, hors du dépôt). | Le journal de fin d'étape et la validation ne sont pas commités. Le propriétaire annonce « étape 4 faite » au portail. |
