# ResaVroom

Application web interne de réservation des véhicules de service et de covoiturage entre les campus du Havre,
de Caen et de Paris.

> **État au 2026-10-28** : en développement, non déployée. La connexion passe encore par un fournisseur de
> développement (comptes simulés) ; elle passera par le **portail admission** de l'équipe (OIDC) à l'étape 2a du
> chantier de mise en production. Suivi du chantier :
> [docs/features/mise-en-production.md](docs/features/mise-en-production.md).

## Fonctionnalités

### Tableau de bord

- État de la flotte (disponible, en trajet, en maintenance) et position de chaque véhicule par campus.
- Prochains trajets, rafraîchis toutes les 30 secondes.

### Réservation et covoiturage

- Recherche d'un véhicule libre, ou d'un trajet existant à rejoindre comme passager.
- Trois types de trajet : aller simple entre campus, aller-retour entre campus, aller-retour vers une adresse
  libre.
- Adresses par l'API BAN (api-adresse.data.gouv.fr), durées par OpenRouteService (estimation à vol d'oiseau
  sans clé).
- Contrôles côté serveur : pas de double réservation d'un véhicule, pas de chevauchement pour le conducteur ni
  pour les passagers (avec un temps de battement réglable), places du véhicule, règles d'inscription et de
  retrait des passagers.

### Administration

- Flotte : ajout, modification, mise en maintenance des véhicules.
- Trajets : modification complète et annulation.
- Paramètres : temps de battement entre deux réservations.
- Journal d'audit des actions sensibles ; métriques et nettoyage de la base.
- Administrateurs et liste des services (`/admin/users`) : ces écrans disparaîtront avec le portail, qui
  gérera seul les accès et les rôles.

## Pile technique

- [Next.js 16.2](https://nextjs.org/) (App Router, Turbopack), React 19, TypeScript strict
- PostgreSQL chez [Neon](https://neon.tech/), [Prisma 7.7](https://www.prisma.io/) (adaptateur Neon, WebSocket)
- [NextAuth.js](https://next-auth.js.org/) v4 (sessions JWT)
- [zod](https://zod.dev/) pour la validation des requêtes, [Vitest](https://vitest.dev/) pour les tests
- SWR, date-fns, Sonner, Lucide

## Démarrer en local

### Prérequis

- Node.js 20 ou plus.
- Les adresses de connexion à la base Neon de ResaVroom (projet `resavroom`) : à demander au propriétaire du
  projet.
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
- `PORTAIL_ISSUER`, `PORTAIL_CLIENT_ID` et `PORTAIL_CLIENT_SECRET` : le client `dev` du portail, pour la
  connexion par le portail (étape 2a ; ces noms entreront dans `.env.example` à cette étape).

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
npm run dev -- -p 3002
```

Ouvrez <http://localhost:3002>. Le port 3002 est celui que le portail connaît pour ResaVroom ; il deviendra le
port par défaut du script `dev` à l'étape 2a. La page de connexion propose les comptes de développement.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement (ajouter `-- -p 3002`, voir plus haut) |
| `npm test` | tests Vitest, sans réseau ni base de données |
| `npx tsc --noEmit` | contrôle des types |
| `npm run lint` | ESLint |
| `npm run build` | build de production |
| `npm run start` | serveur de production, après le build |
| `npx prisma studio` | interface sur la base (accord du propriétaire) |

## Limites connues

- Créer un trajet avec passagers depuis l'assistant ne fonctionne pas encore (cas limite 11, prévu à
  l'étape 2b) ; les passagers peuvent rejoindre le trajet une fois créé.
- La recherche de collègues est simulée (comptes de développement) jusqu'à l'étape 2b.
- Les autres cas limites et leur état : [docs/edgecase.md](docs/edgecase.md).

## Documentation

- [docs/README.md](docs/README.md) : l'index.
- [docs/features/mise-en-production.md](docs/features/mise-en-production.md) : le plan, les décisions et le
  journal.
- [docs/architecture/mise-en-production.md](docs/architecture/mise-en-production.md) : ce que fait le code.
- [CLAUDE.md](CLAUDE.md) : les règles de travail des agents sur ce dépôt.

Dépôt : `github.com/emnormandie76/EMN-resaVroom`. Branche de travail : `dev-claude` ; `main` n'est pas modifiée
directement.
