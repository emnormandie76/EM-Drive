# EM Drive

Application web interne de réservation des véhicules de service et de covoiturage entre les campus du Havre,
de Caen et de Paris.

> **En ligne depuis le 2026-10-29 : <https://em-drive.vercel.app>.** La connexion passe par le **portail
> admission** de l'équipe (OIDC) ; seules les personnes à qui le super-admin du portail a donné un rôle y entrent.
> Suivi du chantier de mise en production : [docs/features/mise-en-production.md](docs/features/mise-en-production.md).

## Fonctionnalités

### Tableau de bord

- État de la flotte (disponible, en trajet, en maintenance) et position de chaque véhicule par campus.
- Vos cinq prochains trajets, comme conducteur ou passager, rafraîchis toutes les 30 secondes.
- Écrans utilisables sur téléphone, tablette et ordinateur (vérifiés à 375, 768 et 1280 px).

### Réservation et covoiturage

- Recherche d'un véhicule libre, ou d'un trajet existant à rejoindre comme passager.
- Passagers (et, pour un administrateur, le conducteur) choisis dans l'annuaire du portail admission : seules
  les personnes qui ont accès à EM Drive y figurent.
- Trois types de trajet : aller simple entre campus, aller-retour entre campus, aller-retour vers une adresse
  libre.
- Adresses par l'API BAN (api-adresse.data.gouv.fr, sans clé), durées par OpenRouteService (estimation à vol
  d'oiseau sans clé).
- Contrôles côté serveur : pas de double réservation d'un véhicule, pas de chevauchement pour le conducteur ni
  pour les passagers (avec un temps de battement réglable), places du véhicule, règles d'inscription et de
  retrait des passagers.

### Administration

- Flotte : ajout, modification, mise en maintenance des véhicules.
- Trajets : modification complète et annulation.
- Paramètres : temps de battement entre deux réservations.
- Journal d'audit des actions sensibles ; métriques de la base Neon (chargées à la demande) et nettoyage des
  trajets terminés ou des journaux de plus d'un mois, confirmé en tapant `SUPPRIMER`.
- Les accès et les rôles (`USER`, `ADMIN`) se gèrent dans le portail admission, pas dans EM Drive.

### Connexion

- Par le portail admission, avec son adresse `@em-normandie.fr` : bouton « Se connecter avec le portail ».
- EM Drive est restreinte : seules les personnes à qui le super-admin du portail a donné un rôle y entrent.
- Une session dure 8 h depuis la connexion ; la déconnexion ferme aussi la session du portail.

## En ligne

- Adresse : <https://em-drive.vercel.app> (Vercel, projet `em-drive`, région Francfort). Base : Neon, projet
  `resavroom`, branche `main` ; le poste de développement travaille sur la branche `dev`.
- Chaque push sur `dev-claude` lance l'intégration continue (tests, lint, build, types) et une Preview, sans
  connexion. La production se met à jour quand le propriétaire avance `main` sur `dev-claude`.
- Livrer une version, la vérifier en ligne, revenir en arrière :
  [docs/memory/memory-exploitation.md](docs/memory/memory-exploitation.md) (§4). Variables de production : §1.1.

## Pile technique

- [Next.js 16.2](https://nextjs.org/) (App Router, Turbopack), React 19, TypeScript strict
- PostgreSQL chez [Neon](https://neon.tech/), [Prisma 7.7](https://www.prisma.io/) (adaptateur Neon, WebSocket)
- [NextAuth.js](https://next-auth.js.org/) v4 (sessions JWT)
- [zod](https://zod.dev/) pour la validation des requêtes, [Vitest](https://vitest.dev/) pour les tests
- SWR, date-fns, Sonner, Lucide

## Démarrer en local

### Prérequis

- Node.js 24 (celui de la CI et de Vercel ; 20 ou plus fonctionne).
- Les adresses de connexion à la branche **`dev`** de la base Neon d'EM Drive (projet Neon `resavroom`), jamais
  celles de `main`, qui sert la production : à demander au propriétaire du projet.
- L'identifiant et le secret du client `dev` d'EM Drive dans le portail, et un rôle dans la grille d'EM Drive : à demander au propriétaire, qui voit avec le super-admin du portail.
- Facultatif : une clé [OpenRouteService](https://openrouteservice.org/).

### Installation

```bash
npm install
cp .env.example .env.local
```

Renseignez `.env.local`. Le rôle de chaque variable est décrit dans
[docs/memory/memory-exploitation.md](docs/memory/memory-exploitation.md) (§1) :

- `DATABASE_URL` (connexion pooled) et `DATABASE_URL_UNPOOLED` (connexion directe, pour les migrations) ;
- `NEXTAUTH_URL` (`http://localhost:3002`) et `NEXTAUTH_SECRET` (une chaîne longue et aléatoire) ;
- `ORS_API_KEY` (facultative) ;
- `PORTAIL_ISSUER` (`https://portail-admission.vercel.app/api/auth`), `PORTAIL_CLIENT_ID` et
  `PORTAIL_CLIENT_SECRET` : le client `dev` du portail.

Ne committez jamais `.env` ni `.env.local`.

### Base de données

La base de développement est déjà migrée et remplie (3 campus, 3 véhicules). Sur une base neuve :

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

- Le CLI Prisma lit `.env.local` puis `.env` (`prisma.config.ts`) et migre par `DATABASE_URL_UNPOOLED`.
- La migration ouvre une connexion directe sur le port 5432, fermé sur le réseau de l'entreprise : passer par un
  autre réseau (partage de connexion). Le seed et l'application passent par le port 443.
- Sur la base partagée, migration, seed et Prisma Studio se font avec l'accord du propriétaire du projet.

### Lancer

```bash
npm run dev
```

Ouvrez <http://localhost:3002>. Le port 3002 est fixé dans le script `dev` : c'est celui que le portail connaît
pour EM Drive (ses adresses de retour sont exactes, port compris). La page de connexion renvoie vers le portail.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement, sur le port 3002 |
| `npm test` | tests Vitest, sans réseau ni base de données |
| `npx tsc --noEmit` | contrôle des types |
| `npm run lint` | ESLint (0 problème attendu) |
| `npm run build` | build de production ; sur le poste, lancez-le avec une `DATABASE_URL` factice (voir l'architecture §9) pour qu'il ne puisse pas lire la base partagée |
| `npm run start` | serveur de production, après le build |
| `npx prisma studio` | interface sur la base (accord du propriétaire) |

## Limites connues

- La recherche de collègues passe par l'annuaire du portail, que le super-admin ouvre client par client.
  **Sur le poste, il est fermé** (refermé le 2026-10-28 après l'essai de l'étape 2b) : la recherche affiche
  « La recherche de collègues est indisponible… », et l'on ne peut ni ajouter de passager à la création d'un
  trajet ni choisir un autre conducteur. Créer un trajet pour soi, sans passager, marche toujours ; les
  passagers peuvent rejoindre le trajet une fois créé.
- Aucun mail n'est envoyé (décision du 2026-10-29) ; l'interface n'en promet pas.
- En production, l'annuaire est ouvert ; sur le poste, il reste fermé (ci-dessus).
- Les noms et adresses des conducteurs et passagers sont visibles de toute personne connectée : c'est voulu pour
  le covoiturage (risque accepté).
- Les recherches de communes, d'itinéraires et de collègues sont limitées par personne (au-delà : « Trop de
  requêtes… », réessayer une minute plus tard).
- Les covoiturages suggérés pendant une réservation ne sont pas filtrés par destination, et le bouton
  « Réserver » d'une carte de véhicule ne présélectionne pas ce véhicule. « Modifier l'heure » d'un trajet n'est
  pas encore disponible.
- Le nettoyage de la base est définitif.
- Les autres cas limites et leur état : [docs/edgecase.md](docs/edgecase.md).

## Documentation

- [docs/README.md](docs/README.md) : l'index.
- [docs/features/mise-en-production.md](docs/features/mise-en-production.md) : le plan, les décisions et le
  journal.
- [docs/architecture/mise-en-production.md](docs/architecture/mise-en-production.md) : ce que fait le code.
- [CLAUDE.md](CLAUDE.md) : les règles de travail des agents sur ce dépôt.

Dépôt (public) : `github.com/emnormandie76/EM-Drive` (ex-`EMN-resaVroom`). Branche de travail : `dev-claude` ;
`main` est la branche de production, que seul le propriétaire avance. Ne jamais committer de secret.
