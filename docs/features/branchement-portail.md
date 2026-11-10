# Chantier — Branchement au portail : la nouvelle adresse de l'Espace Admission (P-05)

> **Statut au 2026-11-10 :** **étapes 0, 1 et 2 faites et validées ; livraison de l'étape 1 en cours (avance de `main`).**
> Historique : étape 0 faite, sans code, et validée. Le portail s'affiche
> désormais « Espace Admission ». Il a basculé sur `https://espace-admission.vercel.app` le 2026-11-10 à 10 h 13
> (G32). Le propriétaire a redéployé la production d'EM Drive avec la nouvelle `PORTAIL_ISSUER` et changé
> `.env.local`. **Bascule constatée** le même jour : CSP sur la nouvelle origine, connexion, déconnexion et annuaire
> conformes. Restent les textes et les documents (étape 1, qui clôt aussi l'étape 2). Décisions : G26 à G32 (portail), D74 à
> D76 (EM Drive). Branche de travail : `dev-claude`.
> **Source :** prompt guidé P-05 du portail, contrat v1 précisée le 2026-11-10
> (`../portail/docs/prompts/P-05-appVoiture-adresse-espace-admission.md`, en lecture seule ; le chemin part de la
> racine du dépôt).
> Ce chantier est distinct de « indisponibilités et corrections », dont l'étape 3 attend sa validation et sa
> livraison. Cette étape 3 passe d'abord (D74), et chaque chantier a ses propres commits. Ce fichier accueille les
> chantiers venus du portail après la mise en production. Les décisions du branchement d'origine (G9 à G25, P-01)
> restent dans [mise-en-production.md](mise-en-production.md) §2.3.

---

## 0. Mode d'emploi pour un agent

- **À lire** : `CLAUDE.md` ; ce plan en entier ; le P-05 (lecture seule) ; le plan
  [mise-en-production](mise-en-production.md) §0, §2.3 (G9 à G25) et §4 (pièges 9, 11, 15 et 16) ;
  [`architecture/mise-en-production.md`](../architecture/mise-en-production.md) §2.1 (connexion) et §8.1
  (en-têtes) ; [`memory/memory-exploitation.md`](../memory/memory-exploitation.md) §1, §1.1, §3 et §4.
- **Mêmes règles que les autres chantiers** : une étape par session, puis un compte rendu et l'attente de la
  validation explicite du propriétaire. Pas de commit ni de push sans sa demande. Un test qui échoue ne
  s'affaiblit pas : quand une règle change, l'attendu du test change avec elle, et le journal le dit.
- **Ne pas mêler les chantiers** (D74). L'étape 3 des indisponibilités modifie des fichiers sans les commiter :
  `CLAUDE.md`, `README.md`, l'architecture, le mémo et son propre plan. Ce chantier ne touche ces fichiers qu'une
  fois cette étape commitée.
- **Le portail n'est pas à nous** (G25 ; D29 du portail). Interdits : travailler dans son administration, appeler
  un MCP sur ses ressources (dépôt `emnormandie76/portail-admission`, projets Vercel et Neon `portail-admission`),
  écrire dans `../portail`. Les valeurs des variables sont posées par le propriétaire : l'agent ne les demande pas
  et ne les lit pas.
- **Les noms techniques ne changent pas** (G27, G31) : l'`id` du fournisseur `portail`, l'adresse de retour
  `/api/auth/callback/portail`, les variables `PORTAIL_*`, l'identifiant `resavroom`, les modules
  `src/lib/portail*.ts` et les cookies `resavroom.*`.

---

## 1. Pourquoi

Le portail s'affiche désormais « Espace Admission » (G26). Il a changé d'adresse : `https://espace-admission.vercel.app`
remplace `https://portail-admission.vercel.app` (G28). L'ancienne adresse renvoie vers la nouvelle : en 307
d'abord, puis en 308 dès le 2026-11-17 (G29). L'émetteur devient `https://espace-admission.vercel.app/api/auth`.

Pour EM Drive, aucun code de connexion ne change : la découverte, le lien vers le portail, la déconnexion et
l'annuaire se déduisent tous de `PORTAIL_ISSUER`. Trois choses en découlent pourtant :

- la CSP (`form-action`) se calcule au build depuis `PORTAIL_ISSUER` (`next.config.ts`). Il fallait donc un
  nouveau build après la bascule : le propriétaire l'a fait le 2026-11-10 ;
- les textes visibles disent « le portail » et « le portail admission ». Ils diront « l'Espace Admission » (G31) ;
- les documents, `.env.example` et un test écrivent encore l'ancienne adresse.

---

## 2. Décisions

### 2.1. Décisions du portail, recopiées telles quelles

**Décisions du propriétaire, à ne pas rediscuter.** Source : prompt guidé P-05 du portail, contrat v1 précisée le
2026-11-10. Leurs renvois internes (« D14 », « D53 », « temps 2 ») désignent le plan du portail, pas ce document.
G28 remplace G21 (portail D14), marquée « remplacée » dans [mise-en-production.md](mise-en-production.md) §2.3.

| # | Source | Décision |
|---|---|---|
| G26 | portail D52 | **Nom affiché : « Espace Admission »**, avec la majuscule d'« Admission », le nom du service. Il remplace « Portail admission ». |
| G27 | portail D53 | **L'interface ne dit plus « portail »** : ses phrases disent « l'Espace Admission ». Les noms techniques gardent « portail » : cookies, identifiant du fournisseur chez les applications (`/api/auth/callback/portail`), variables du contrat (`PORTAIL_ISSUER`…). La documentation garde « le portail » pour parler du projet. |
| G28 | portail D55 | **Nouvelle adresse : `https://espace-admission.vercel.app`**, d'où l'émetteur `https://espace-admission.vercel.app/api/auth`. Bascule coordonnée de l'Espace Admission et des trois applications (`BETTER_AUTH_URL` et `PORTAIL_ISSUER` posées par le propriétaire), à une date qu'il fixe. Elle remplace D14. |
| G29 | portail D56 | **L'ancienne adresse redirigera vers la nouvelle** (au temps 2) : favoris, liens des guides et anciens courriels continuent de marcher. Elle ne dispense pas de la bascule des applications : l'émetteur change. |
| G30 | portail D59 | **La nouvelle adresse est réservée dès le 2026-11-10** et renvoie vers l'ancienne (307) jusqu'à la bascule : les applications peuvent déjà l'écrire. |
| G31 | portail D60 | **Les textes visibles des applications disent « l'Espace Admission »**, comme D53 ; les noms techniques gardent « portail » (fournisseur `portail`, `/api/auth/callback/portail`, variables `PORTAIL_*`). Chaque agent en mesure l'ampleur chez lui. |
| G32 | portail D62 | **« La bascule tout de suite, le 2026-11-10 au matin, avant les retours de P-05 à P-07 ; les textes et documents des applications suivent par leurs prompts. »** Faite à 10 h 13 (mise à jour du P-05 de 10 h 30). |

### 2.2. Questions du P-05, tranchées le 2026-11-10

Toutes tranchées par le propriétaire, qui a retenu chaque fois la recommandation.

| # | Question | Réponse |
|---|---|---|
| D74 | La première question du §6 du P-05 (« livrer les textes avant la bascule, ou avec elle ? ») est **sans objet** depuis la bascule (G32). Elle est reformulée : dans quel ordre livrer par rapport à l'étape 3 des indisponibilités ? Cette étape attend sa validation, n'est pas commitée et modifie les mêmes documents. | **L'étape 3 des indisponibilités d'abord**, livrée jusqu'à sa migration. L'étape 1 de ce chantier vient ensuite, avec son commit et sa livraison à part (P-05 §5). Les textes disent « le portail » quelques jours de plus, mais rien n'est cassé. Option écartée : une seule avance de `main` pour les deux. |
| D75 | Seconde question du §6 du P-05 : le `name` du fournisseur (`"Portail admission"`, `src/lib/auth.ts`) passe-t-il à « Espace Admission » ? Il ne s'affiche sur aucun écran (`pages.signIn` et `pages.error` renvoient vers `/login`), mais la route publique `/api/auth/providers` le renvoie. | **Oui, « Espace Admission »** : c'est un nom affiché, pas un nom technique (G26). L'`id` `portail` et l'adresse de retour ne changent pas. Option écartée : le laisser. |
| D76 | *Question ajoutée.* Quelle valeur d'essai pour `tests/security-headers.test.ts`, qui utilise l'ancienne adresse ? | **L'adresse neutre `https://portail.test`**, déjà utilisée par `tests/auth.test.ts`, `tests/logout.test.ts` et l'imitation du portail : le test ne dépend plus de l'adresse réelle. Option écartée : la nouvelle adresse réelle. |

---

## 3. Le contrat v1, précisée le 2026-11-10 : ce qui change

La copie figée est au §3 du P-05 ; le reste de la copie figée du P-01 tient toujours. En bref, depuis la bascule du
2026-11-10 à 10 h 13 :

- **Adresse du portail** (affiché « Espace Admission ») : `https://espace-admission.vercel.app`. L'ancienne
  adresse y renvoie (307 la première semaine, puis 308).
- **Émetteur** (`PORTAIL_ISSUER`) : `https://espace-admission.vercel.app/api/auth`. Il se compare exactement,
  sans barre finale, et vaut la même chose partout, poste compris. Le code le lit dans la variable, jamais en dur.
- **Annuaire** : `GET https://espace-admission.vercel.app/api/directory?q=<texte>` (l'origine de l'émetteur).
- **Déconnexion d'une session ouverte avant la bascule** : son `id_token_hint` porte l'ancien émetteur et ne vaut
  plus. Le navigateur arrive alors sur la page de confirmation du portail s'il y a une session, sinon sur sa page
  d'erreur « Logout error » (en anglais, sans retour). Cela dure 8 h au plus, donc jusqu'au 2026-11-10 vers
  18 h 13. La session d'EM Drive est déjà fermée : rien à coder.
- `PORTAIL_CLIENT_ID` et `PORTAIL_CLIENT_SECRET` ne changent pas. Les clients `production` et `dev` restent tels
  quels, avec leurs adresses de retour, puisque le domaine d'EM Drive ne change pas.

---

## 4. Point de départ (relevé du 2026-11-10)

**Chantier en cours.** L'étape 3 de « indisponibilités et corrections » est faite, en attente de validation et de
livraison (le code d'abord, la migration ensuite). Elle n'est pas commitée : 19 fichiers modifiés (schéma, client
généré, `vehicle-service.ts`, `request-schemas.ts`, trois fichiers de test, `CLAUDE.md`, `README.md`,
architecture, mémo, son plan) et deux ajouts (la migration `20261102180000_drop_vehicle_status` et
`tests/vehicle-status-removed.test.ts`). Ce chantier n'y touche pas (D74).

**Dépôt.** `dev-claude` est sur `fabe4d7`, égal à `origin/dev-claude` ; `origin/main` est sur `e3a8894`.
Vérifications sur l'arbre ci-dessus : `npm test` 467 tests verts (27 fichiers, lancé par PowerShell : piège 6),
`npx tsc --noEmit` 0 erreur, `npm run lint` 0 problème. Le build n'a pas été rejoué : aucun code n'a été touché.

**Production**, relevée en lecture seule (MCP Vercel et requêtes publiques sans session, le 2026-11-10 à
11 h 01) :

- déploiement servi : `dpl_67fnM1ZXJZpLFPuax1BxYLacwjd6`, `main` `e3a8894`, `READY`, créé le 2026-11-10 à 10 h 10
  par `emnormandie76`. C'est le redéploiement du propriétaire avec la nouvelle `PORTAIL_ISSUER` ;
- `GET /login` : 200, CSP avec **`form-action 'self' https://espace-admission.vercel.app`** ;
- `GET /api/auth/providers` : un seul fournisseur, `portail`, avec `"name":"Portail admission"` (D75) et le retour
  `https://em-drive.vercel.app/api/auth/callback/portail` ;
- découverte de `https://espace-admission.vercel.app/api/auth` : 200, `issuer` vaut
  `https://espace-admission.vercel.app/api/auth`. L'ancienne adresse répond 307 ;
- candidat de retour arrière : `dpl_AuQS27nsLP5yA7VSF6oXK4RV4t5A`. Même commit, mais **construit avant la
  bascule**, avec l'ancienne valeur (piège 1).

**Variables.** D'après le P-05 (mise à jour de 10 h 30), le propriétaire a posé `PORTAIL_ISSUER` en Production sur
`em-drive`. Dans `.env.local` (client `dev`), l'agent ne la sait pas encore changée (il ne lit jamais ce fichier).

**Le relevé du P-05 (§4), revérifié**, est exact pour tout ce qu'il cite. Il manque toutefois ceci :

1. `src/lib/utils/errors.ts` (l. 193 et 207) : deux messages visibles, que la liste de suggestions affiche (D25),
   disent « l'annuaire du portail ». Ils ne figurent pas au relevé et suivent G31.
2. `.env.example` (l. 7 et 9) : un commentaire dit « portail admission », et la valeur d'exemple de
   `PORTAIL_ISSUER` est l'ancien émetteur. Absents du relevé. Cette valeur est publique, ce n'est pas un secret :
   elle devient le nouvel émetteur.
3. Aucun test ne lit les textes visibles (Vitest tourne sans DOM). La case « tests qui les vérifient » de
   l'étape 1 n'a donc aucun test à changer. Un texte ne protège rien : il n'appelle pas de test écrit d'abord.
4. `src/lib/auth.ts` (l. 33) : le `name` ne s'affiche sur aucun écran, mais `/api/auth/providers` le renvoie
   (D75).
5. Documents : plus de lignes que le relevé n'en cite. `CLAUDE.md` l. 5 et 168 ; `README.md` l. 22, 42, 46 (le
   texte du bouton) et 90 ; architecture l. 18 et 26 ; mémo l. 15, 37, 53, 109 et 193 ; plan mise-en-production :
   G21, désormais marquée « remplacée ». Le reste de ce plan (statut, §1, journal) appartient à l'histoire et ne
   change pas. Les noms des projets du portail (`portail-admission` chez Vercel, Neon et GitHub) ne changent pas
   non plus à ce jour : `CLAUDE.md` l. 138, 152 et 170 et le mémo l. 12 et 111 les gardent.
6. Commentaires du code : en tête de `auth.ts`, `login/page.tsx`, `portail.ts` et `portail-directory.ts`, ils
   disent « portail admission » ; celui de `PortalSignInButton.tsx` cite le texte du bouton. Ils parlent du projet
   (G27) et peuvent rester. L'étape 1 aligne au moins celui qui cite le bouton.
7. `next.config.ts` : la fonction `portalOrigin` occupe les lignes 3 à 13 (et non 4 à 9). Rien à changer dans le
   code.

---

## 5. Pièges connus

1. **Retour arrière de Vercel après la bascule.** Les variables d'un déploiement sont fixées quand il est
   construit. Tout déploiement construit avant le 2026-11-10 à 10 h 10 garde donc l'ancienne `PORTAIL_ISSUER` :
   c'est le cas du candidat actuel, `dpl_AuQS27nsLP5yA7VSF6oXK4RV4t5A`. La découverte de l'ancienne adresse mène
   désormais à la nouvelle origine. Or le code refuse une adresse hors de l'émetteur (`portail.ts` l. 35 pour
   `end_session_endpoint`, `portail-directory.ts` l. 71 pour `token_endpoint`). Résultat sur un tel déploiement :
   plus de déconnexion par le portail (seulement locale), un annuaire en 503, et une connexion que le contrat ne
   garantit plus (§3). Revenir en arrière veut donc dire redéployer, pas reprendre un ancien déploiement. À écrire
   au mémo §4.3 (étape 1), à côté de l'avertissement de l'étape 3 des indisponibilités. *Depuis la livraison de
   cette étape 3 (2026-11-10, `dpl_7u9jQTMin3wneKnkBz6dsRrVr99P`), le candidat est
   `dpl_67fnM1ZXJZpLFPuax1BxYLacwjd6` : construit après la bascule, il lit encore `vehicles.status`, retirée de la
   base, et casse donc l'application. Aucun retour arrière n'est utilisable ; corriger en avant.*
2. **Le poste garde l'ancienne valeur** tant que le propriétaire n'a pas changé `.env.local`. Les effets sont ceux
   du piège 1 : déconnexion locale seulement (l'annuaire du client `dev`, lui, est fermé de toute façon : 503) et
   connexion non garantie. Une fois la valeur changée, redémarrer `npm run dev` : la CSP se calcule au démarrage.
3. **Sessions ouvertes avant la bascule** (contrat §8, §3 ci-dessus) : leur déconnexion mène à la page de
   confirmation du portail ou à sa page « Logout error », jusqu'au 2026-11-10 vers 18 h 13. C'est attendu.
4. **Ne pas mêler les chantiers** (D74) : voir le §0.
5. **Pas de remplacement aveugle de « portail ».** Ne changent pas : l'identifiant du fournisseur, l'adresse de
   retour, les variables, les modules, les noms des projets du portail (`portail-admission`), ni « le portail »
   quand les docs parlent du projet (G27).
6. **`npm test` sous Bash échoue** sur les 27 fichiers (« Vitest failed to find the runner »). Le dossier courant y
   est `c:/…` en minuscule, et Vitest charge alors ses modules deux fois. Par PowerShell (`C:\…`), les 467 tests
   passent. `tsc` et `lint` marchent sous les deux shells.

---

## 6. Étapes

### Étape 0 — Préparation, sans code (2026-11-10)

- [x] Point de départ vérifié et consigné (§4), le chantier en cours d'abord.
- [x] Relevé du §4 du P-05 revérifié, écarts notés (§4).
- [x] Décisions du portail recopiées (G26 à G32) et G21 marquée « remplacée » ; questions du §6 tranchées (D74 à
  D76).
- [x] Étapes écrites, avec leurs cases ; ligne ajoutée à l'index [`docs/README.md`](../README.md).
- [x] `CLAUDE.md` (« Phase en cours ») : ajouter la ligne du chantier **après le commit de l'étape 3 des
  indisponibilités**, car le fichier porte ses changements non commités (D74). *Ajoutée après `be604b4`.*
- [x] Compte rendu au propriétaire avec les éléments du §8 du P-05.
- [x] Validation du propriétaire (2026-11-10) ; commit à part, à sa demande.

### Étape 1 — Les textes et les documents

Elle vient après la livraison de l'étape 3 des indisponibilités (D74).

- [x] **Textes visibles** (G31). Libellés proposés, repris tels quels (2026-11-10) :
  - `src/app/(auth)/login/PortalSignInButton.tsx` : « Redirection vers le portail... » → « Redirection vers
    l'Espace Admission... » ; « Se connecter avec le portail » → « Se connecter avec l'Espace Admission » ;
  - `src/app/(auth)/login/page.tsx` : « … ou passer par le portail. » → « … ou passer par l'Espace Admission. » ;
    « Ouvrir le portail » → « Ouvrir l'Espace Admission » ;
  - `src/app/(auth)/unauthorized/page.tsx` : « Contactez l'administrateur du portail. » → « Contactez
    l'administrateur de l'Espace Admission. » ; « Retour au portail » → « Retour à l'Espace Admission » ;
  - `src/app/admin/page.tsx` : « … se gèrent dans le portail admission. » → « … se gèrent dans l'Espace
    Admission. » ;
  - `src/lib/utils/errors.ts` : « l'annuaire du portail ne répond pas » → « l'annuaire de l'Espace Admission ne
    répond pas » ; « Trop de recherches dans l'annuaire du portail » → « Trop de recherches dans l'annuaire de
    l'Espace Admission ».
- [x] `name` du fournisseur : « Espace Admission » (D75). L'`id` `portail` ne change pas.
- [x] Commentaires d'en-tête alignés quand ils citent l'ancien nom ou le texte du bouton (G27 : « le portail »
  reste pour parler du projet). *Cinq en-têtes : `PortalSignInButton.tsx`, `login/page.tsx`, `auth.ts`,
  `portail.ts`, `portail-directory.ts`.*
- [x] `tests/security-headers.test.ts` : valeur d'essai `https://portail.test` (D76). Il doit rester vert sans
  autre changement. *Vert, inchangé par ailleurs.*
- [x] `.env.example` : le commentaire, et la valeur d'exemple de `PORTAIL_ISSUER`, qui devient le nouvel émetteur.
- [x] **Documents** : écrire « depuis la bascule du 2026-11-10 » partout où ils décrivent la production. Fichiers :
  `CLAUDE.md`, `README.md`, architecture, et mémo (§0, §1, §1.1, §3, le contrôle de la CSP du §4.2, et le retour
  arrière du §4.3 avec le piège 1). Puis un `git grep` des anciennes formes : il ne doit plus montrer que
  l'histoire et les noms techniques.
- [x] `npm test` (par PowerShell, piège 6), `npx tsc --noEmit`, `npm run lint` ; build (`DATABASE_URL` factice)
  puis `tsc`. *467 verts (27 fichiers), 0, 0 ; build vert, puis `tsc` 0.*
- [x] Essai sur le poste, une fois `.env.local` changé (étape 2) : les textes de `/login` et de `/unauthorized`.
  *Fait par l'agent (requêtes sans session sur `localhost:3002`) : les cinq libellés présents, y compris le
  message d'erreur de `/login?error=…` ; aucun texte visible ne contient « portail » ; `/api/auth/providers` :
  `"name":"Espace Admission"`, `id` `portail` ; CSP sur la nouvelle origine.*
- [x] Validation, commit à part, livraison selon le mémo §4.1 (avance de `main` sur demande). *Validée par le
  propriétaire le 2026-11-10 ; commits puis avance de `main` à sa demande.*
- [ ] Vérification en ligne (§4.2) : textes de `/login`, `/api/auth/providers` (« Espace Admission »), CSP.

### Étape 2 — La bascule (faite par le propriétaire le 2026-11-10 ; reste à constater)

C'est l'étape 2 du P-05, réduite par sa mise à jour de 10 h 30.

- [x] Le propriétaire a posé la nouvelle valeur de `PORTAIL_ISSUER` en Production sur `em-drive` (selon le P-05 ;
  l'agent n'a jamais lu la valeur).
- [x] Le propriétaire a redéployé la production sans le cache de build : `dpl_67fnM1ZXJZpLFPuax1BxYLacwjd6`
  (`e3a8894`), `READY`, créé à 10 h 10. *Constaté à l'étape 0, en lecture seule (MCP Vercel).*
- [x] `/login` porte `form-action 'self' https://espace-admission.vercel.app`. *Relu à l'étape 0, le 2026-11-10 à
  11 h 01.*
- [x] Le propriétaire se connecte et se déconnecte lui-même, puis lance une recherche de passager : l'annuaire doit
  répondre. *Fait le 2026-11-10 sur le poste et en production : « tout est bon » (rapporté par le propriétaire).
  Journaux du poste : connexion, `/dashboard`, déconnexion 303 sans message « Déconnexion du portail impossible ».
  Production : aucun journal d'erreur ni d'avertissement (MCP Vercel, 45 min).*
- [x] Le propriétaire met la nouvelle valeur dans `.env.local`, puis redémarre `npm run dev` (piège 2). *Fait par
  le propriétaire le 2026-11-10. Constaté sans lire le fichier : `npm run dev` relancé par l'agent, `/login` sur
  `localhost:3002` porte `form-action 'self' https://espace-admission.vercel.app`.*
- [x] Documents : « depuis la bascule du 2026-11-10 » (avec l'étape 1) ; journal ; partie « après la bascule » du
  compte rendu (§8 du P-05).

---

## 7. Hors périmètre

- Le portail : son administration, son dépôt, ses projets Vercel et Neon (`portail-admission`), et son contrat
  (lecture seule). Un réglage du portail à changer se demande au propriétaire (G25).
- Les noms techniques (§0), dont `resavroom` (cookies, paquet npm, identifiant au portail : D54 à D56 du
  [renommage](renommage-em-drive.md)).
- Les valeurs des variables, qui reviennent au propriétaire.
- Le chantier « indisponibilités et corrections » (D74) et le renommage du projet Neon (D57).

---

## 8. Journal de progression

| Date | Étape | Fait | Reste / surprises |
|---|---|---|---|
| 2026-11-10 | 0 | **Départ vérifié.** Lus : `CLAUDE.md` ; le P-05 en entier, sur disque, identique au texte collé par le propriétaire (y compris la mise à jour de 10 h 30 : bascule faite) ; le plan des indisponibilités (chantier en cours, étape 3 en attente de validation et de livraison, arbre non commité) ; le plan mise-en-production (§0, §2.3, §4, journal) ; le plan du renommage. `dev-claude` sur `fabe4d7`, égal à `origin/dev-claude` ; 467 tests verts (27 fichiers), `tsc` 0, lint 0. **Production relevée en lecture seule** : `dpl_67fnM1ZXJZpLFPuax1BxYLacwjd6` (`e3a8894`, créé à 10 h 10), CSP de `/login` sur la nouvelle origine, `/api/auth/providers` encore « Portail admission », `issuer` de la nouvelle découverte conforme, ancienne adresse en 307. | **Surprises** : (1) `npm test` échoue sous Bash, à cause de la casse du lecteur (piège 6), mais passe par PowerShell ; (2) le candidat de retour arrière de Vercel a été construit avant la bascule : y revenir casserait la déconnexion et l'annuaire (piège 1). |
| 2026-11-10 | 0 | **Relevé revérifié** : 7 écarts (§4), dont deux messages visibles de `errors.ts` et `.env.example`, absents du relevé. **Chantier écrit** dans un nouveau fichier, comme chaque chantier du dépôt (le §5 du P-05 le permet). G26 à G32 recopiées, G21 marquée « remplacée ». Questions posées par questions à cocher : D74 à D76, recommandations retenues. Étapes écrites ; index `docs/README.md`. Aucun code. | **Écarts au prompt** : (1) la première question du §6, sans objet, est reformulée en D74 (ordre par rapport au chantier en cours) ; (2) la question D76 (valeur d'essai) est ajoutée ; (3) la décision D62 du portail, recopiée en G32 comme la mise à jour le demande ; (4) trois cases de l'étape 2 sont cochées sur constat, en lecture seule ; (5) `CLAUDE.md` n'est pas touché tant que l'étape 3 des indisponibilités n'est pas commitée (D74). **Rien n'est commité.** En attente de validation. |
| 2026-11-10 | 2 | **`.env.local` changé par le propriétaire** (il le signale dans le chat ; l'agent n'a pas lu le fichier). Port 3002 libre au départ ; `npm run dev` lancé par l'agent ; `GET /login` en local : 200, `form-action 'self' https://espace-admission.vercel.app`. Donc `PORTAIL_ISSUER` vise bien la nouvelle origine. `/api/auth/providers` répond encore « Portail admission » (attendu jusqu'à l'étape 1, D75). Case cochée. | Restent : la connexion et la déconnexion du propriétaire sur le poste et en production, et une recherche de passager en production (sur le poste, l'annuaire du client `dev` est fermé : 503 attendu). Serveur de développement laissé lancé pour l'essai. |
| 2026-11-10 | 2 | **Essai du propriétaire, connecté lui-même** : connexion et déconnexion sur le poste et en production, recherche de passager en production. Il répond « tout est bon ». Journaux relus par l'agent : sur le poste, `POST /api/auth/signin/portail`, retour `callback/portail`, `/dashboard`, `POST /api/auth/logout` 303, sans aucune ligne `[AUTH]` (la découverte suivie donne bien un `end_session_endpoint` sur l'émetteur) ; en production, aucun journal d'erreur ni d'avertissement sur 45 minutes (MCP Vercel). Serveur de développement arrêté par son port, après vérification de sa ligne de commande. **La bascule est constatée** : déploiement `dpl_67fnM1ZXJZpLFPuax1BxYLacwjd6`, CSP sur la nouvelle origine en production et sur le poste, connexion, déconnexion et annuaire conformes. | Reste de l'étape 2 : les documents (« depuis la bascule du 2026-11-10 »), avec l'étape 1. Restent aussi la validation de l'étape 3 des indisponibilités, puis celle de cette étape 0, et leurs commits séparés (D74). |
| 2026-11-10 | 0 | **Étape 0 validée par le propriétaire**, en même temps que l'étape 3 des indisponibilités (« je valide tout »). Ordre de D74 respecté : d'abord les deux commits de l'étape 3 (`3ae054e` pour le code, `be604b4` pour les docs), puis la ligne du chantier dans `CLAUDE.md` et ce commit à part. Aucun code. | **Prochaine étape : 1**, une fois l'étape 3 des indisponibilités livrée jusqu'à sa migration. Le propriétaire annonce « P-05 fait » à l'agent du portail une fois l'étape 1 livrée, ou dès maintenant pour l'étape 0. |
| 2026-11-10 | 1 | **Début d'étape**, sur demande du propriétaire (« fais-moi le rename »), une fois l'étape 3 des indisponibilités livrée (D74 rempli). Départ : `dev-claude` sur `79d0ec8`, arbre propre. Guide Next des pages et mises en page parcouru (règle 11) : seuls des textes changent, aucune API de Next. **Code** : textes de `PortalSignInButton.tsx`, `login/page.tsx`, `unauthorized/page.tsx`, `admin/page.tsx` et des deux messages de l'annuaire (`errors.ts`) ; `name` du fournisseur (D75) ; cinq commentaires d'en-tête ; valeur d'essai de `tests/security-headers.test.ts` (D76) ; `.env.example`. **Docs** : `CLAUDE.md`, `README.md`, architecture (§1, §2.1, table des écrans, CSP §8.1), mémo (§0, §1, §1.1, §3, §4.2, §4.3 avec le piège 1). `git grep` : il ne reste que l'ancienne adresse citée comme redirection et « le portail » pour le projet. Vérifications : 467 tests verts, `tsc` 0, lint 0, build puis `tsc` 0. Essai sur le poste : conforme (§6, étape 1). | **Aucun test d'abord** : un texte ne protège rien, et aucun test ne lisait ces textes (§4, écart 3). `/admin` et les deux messages de l'annuaire ne se voient qu'avec une session : relus dans le code, pas à l'écran. **Rien n'est commité.** Reste : validation, commit à part, livraison (avance de `main`, sur demande) et vérification en ligne. |
| 2026-11-10 | 1 | **Étape 1 validée par le propriétaire** (« je valide la partie faite, commit et push, tout sur `main` après »). Contrôles relancés avant les commits : 467 tests verts (27 fichiers), `tsc` 0, lint 0. Deux commits (code, puis docs), push de `dev-claude`, puis avance de `main` (`origin/main` était sur `15228b8`, `main` locale en retard). | Reste : vérification en ligne une fois le déploiement de `main` prêt (§4.2), puis le propriétaire annonce « P-05 fait » à l'agent du portail. |
