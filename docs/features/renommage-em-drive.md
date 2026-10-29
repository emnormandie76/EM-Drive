# Chantier — Renommage de l'application en « EM Drive »

> **Statut au 2026-10-29 :** terminé et validé. Décisions D52 à D57 appliquées. Vérifications complètes vertes.
> Chantier distinct de « mise en production » (terminé et validé le 2026-10-29). Branche de travail : `dev-claude`.
> Source : prompt du propriétaire du 2026-10-29. Relevé de départ : 156 occurrences de « ResaVroom » ou
> « resavroom » dans 34 fichiers suivis, hors `src/generated` (git grep -i -c -E "resa ?vroom").

---

## 0. Mode d'emploi pour un agent

- Lire : CLAUDE.md ; ce plan en entier ; `architecture/mise-en-production.md` (§2.1 cookies, §3, §8.1, §9) ;
  `memory/memory-exploitation.md` (§0, §1.1, §3, §4) ; `edgecase.md` ; les guides Next.js de métadonnées
  (`node_modules/next/dist/docs/01-app/01-getting-started/14-metadata-and-og-images.md` et
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`).
- Règles CLAUDE.md inchangées : outil d'écriture (jamais PowerShell entre guillemets doubles), pas de commit ni
  push sans demande, fichiers en CRLF, ne jamais lire `.env` ni `.env.local`.
- Pas de remplacement global aveugle : chaque occurrence se juge ; voir §3 (ce qui ne se renomme pas).
- Portail : rédigez la demande, le propriétaire la transmet — jamais l'agent (G25).
- Neon : `update_project` sur accord explicite du propriétaire.

---

## 1. Décisions

### 1.1. Tranchées au début du chantier (2026-10-29)

| # | Question | Réponse |
|---|---|---|
| D52 | Graphie exacte du nom affiché | **« EM Drive »** (espace, E et D majuscules, sans tiret). Recommandation retenue. |
| D53 | Titre de l'onglet (`metadata.title` dans `layout.tsx`) | **« EM Drive — Réservation de véhicules »**. Recommandation retenue. |
| D54 | Préfixe des cookies (`COOKIE_PREFIX` dans `src/lib/auth-session.ts`) | **Garder `resavroom`** : nom technique invisible des utilisateurs, aucune déconnexion au déploiement, aucun test à modifier. Recommandation retenue. |
| D55 | Portail (identifiant et nom affiché) | **Renommer uniquement le nom affiché** sur la tuile (« ResaVroom » → « EM Drive ») ; garder l'identifiant technique `resavroom`. L'agent rédige la demande, le propriétaire la transmet. Recommandation retenue. |
| D56 | Nom du paquet npm (`package.json`, `"name"`) | **Garder `resavroom`** : nom technique interne, aucune conséquence visible. Recommandation retenue. |
| D57 | Projet Neon (actuellement nommé `resavroom`) | **Renommer en `em-drive`** via `update_project` (sur accord du propriétaire) ; l'identifiant `wispy-shadow-66847588` et les URL de connexion ne changent pas. Recommandation retenue. |

---

## 2. Point de départ (relevé du 2026-10-29)

**Vérifications préalables : toutes vertes.**

- `dev-claude` à jour avec `origin/dev-claude`, arbre propre (push du propriétaire à 11 h 44).
- `npm test` : 273 verts (19 fichiers).
- `npx tsc --noEmit` : 0 erreur.
- `npm run lint` : 0 problème.
- `npm run build` (DATABASE_URL factice) : sans erreur.
- `npx tsc --noEmit` après le build (piège 14) : 0 erreur.

**Occurrences de « ResaVroom » / « resavroom » (relevé du 2026-10-29) :**

156 occurrences dans 34 fichiers suivis (hors `src/generated`). Trois sortes :

**a) Nom affiché — à renommer :**

| Fichier | Occurrence |
|---|---|
| `src/app/layout.tsx` | `metadata.title` |
| `src/app/(auth)/login/page.tsx` | h1 |
| `src/app/(auth)/unauthorized/page.tsx` | texte |
| `src/app/dashboard/page.tsx` | « Bienvenue sur ResaVroom » |
| `src/app/global-error.tsx` | title et h1 |
| `src/components/layout/Navbar.tsx` | texte du logo |
| `src/lib/utils/errors.ts` | message de UnknownPersonError |

**b) Identifiants techniques — décidés (§1.1) :**

| Fichier | Occurrence | Décision |
|---|---|---|
| `src/lib/auth-session.ts` | `COOKIE_PREFIX = "resavroom"` | **Garder** (D54) |
| `package.json` | `"name": "resavroom"` | **Garder** (D56) |
| `package-lock.json` | `"name": "resavroom"` | **Garder** (suit D56) |
| `tests/auth.test.ts`, `tests/proxy.test.ts` | `"resavroom-dev"` (identifiant fictif de test) | **Garder** : identifiant du client fictif de test |

**c) Commentaires et docs — à mettre à jour :**

| Fichier | Action |
|---|---|
| `CLAUDE.md` | Mettre à jour le titre, la présentation, la phase en cours |
| `README.md` | Mettre à jour le nom et la présentation |
| `docs/README.md` | Mettre à jour le titre et les descriptions |
| `docs/features/mise-en-production.md` | Mettre à jour le titre et les refs au nom (le journal passé reste intact) |
| `docs/architecture/mise-en-production.md` | Mettre à jour le titre et les refs au nom |
| `docs/memory/memory-exploitation.md` | Mettre à jour le titre et les refs au nom |
| `docs/edgecase.md` | Mettre à jour les refs au nom |
| Commentaires du code source | Vérifier et mettre à jour ceux qui mentionnent « ResaVroom » comme nom affiché |

---

## 3. Ce qui ne se renomme pas

| Élément | Raison |
|---|---|
| `docs/SAD.md` et `docs/Cahier des charge.md` | Spécifications d'origine, lecture seule (règle 10) |
| Entrées passées du journal (§9 du plan mise-en-production) | L'histoire reste telle quelle |
| `src/generated/prisma/` | Code généré (règle 10) |
| `COOKIE_PREFIX = "resavroom"` dans `auth-session.ts` | Conservé (D54) |
| `"name": "resavroom"` dans `package.json` et `package-lock.json` | Conservé (D56) |
| Identifiant fictif `"resavroom-dev"` dans les tests | Identifiant du client de test, pas le nom de l'application |
| Identifiant portail `resavroom` | Conservé (D55) ; seul le nom affiché change |
| Dossier local `appVoiture` | Nom du dossier de travail, hors de la tâche |
| Branche `main`, `jules` | Règle 10 et G3 |

---

## 4. Pièges connus

1. **Pas de remplacement aveugle** : « resavroom » désigne aussi l'identifiant du portail, le préfixe des
   cookies, le nom npm, l'identifiant de test fictif et des décisions passées du journal. Chaque occurrence se juge.
2. **Fichiers en CRLF sous Windows** (piège 9 du plan mise-en-production) : écrire les fichiers avec l'outil
   d'écriture, jamais par une chaîne PowerShell entre guillemets doubles.
3. **Métadonnées Next.js** (AGENTS.md) : la propriété `title` de l'objet `metadata` exporté de `layout.tsx`
   contrôle le `<title>` de l'onglet. L'API est stable (objet statique `metadata : Metadata`).
4. **`global-error.tsx`** : ce composant rend ses propres `<html>` et `<body>` (mise en page racine en erreur) ;
   il a sa propre balise `<title>` en dur, distincte du `metadata` du layout.
5. **Cookies** : le préfixe est conservé (`resavroom`, D54) ; si un agent futur doit le changer, il doit d'abord
   modifier les attentes de `tests/auth.test.ts`, `tests/proxy.test.ts` et `tests/logout.test.ts`, voir les
   tests échouer, puis changer `auth-session.ts`, et prévenir que le déploiement déconnectera tout le monde.
6. **Portail** (G25) : ne pas travailler dans l'administration du portail. Rédiger la demande pour l'agent du
   portail, le propriétaire la transmet.

---

## 5. Cases à cocher

### a) Interface et code

- [x] `src/app/layout.tsx` : `metadata.title` → « EM Drive — Réservation de véhicules » (D53)
- [x] `src/app/(auth)/login/page.tsx` : h1 → « EM Drive »
- [x] `src/app/(auth)/unauthorized/page.tsx` : texte → « EM Drive »
- [x] `src/app/dashboard/page.tsx` : « Bienvenue sur ResaVroom » → « Bienvenue sur EM Drive »
- [x] `src/app/global-error.tsx` : title et h1 → « EM Drive »
- [x] `src/components/layout/Navbar.tsx` : texte du logo → « EM Drive »
- [x] `src/lib/utils/errors.ts` : message de UnknownPersonError → « EM Drive »

### b) Commentaires du code

- [x] Vérifier les commentaires source et mettre à jour ceux qui mentionnent « ResaVroom » comme nom affiché (`logout/route.ts`, `search/route.ts`, `globals.css`, `auth.ts`, `portail-directory.ts`, `prisma.ts`, `person-service.ts`, `CustomCalendarPicker.tsx`, `auth-session.ts`, `seed.ts`)

### c) Documentation

- [x] `CLAUDE.md` : titre, présentation, phase en cours
- [x] `README.md` : nom et présentation
- [x] `docs/README.md` : titre, descriptions
- [x] `docs/features/mise-en-production.md` : titre, statut, refs au nom (journal passé intact)
- [x] `docs/architecture/mise-en-production.md` : titre, refs au nom
- [x] `docs/memory/memory-exploitation.md` : titre, refs au nom
- [x] `docs/edgecase.md` : refs au nom
- [x] Ce plan : compléter le journal (§6)

### d) Services externes (avec accord du propriétaire)

- [ ] Neon : renommer le projet `resavroom` → `em-drive` (D57) dans la console Neon (accord confirmé)
- [ ] Portail : demande rédigée (§7) et à transmettre par le propriétaire (D55)

### e) Vérifications finales

- [x] `npm test` : 273 verts (19 fichiers)
- [x] `npx tsc --noEmit` : 0 erreur
- [x] `npm run lint` : 0 problème
- [x] `npm run build` (DATABASE_URL factice) : sans erreur ; puis `tsc` (piège 14) : 0 erreur
- [x] `git grep -i -E "resa ?vroom"` : ne montre plus que les occurrences voulues (liste au §3)

---

## 6. Journal de progression

| Date | Fait | Reste / surprises |
|---|---|---|
| 2026-10-29 | **Départ vérifié.** `dev-claude` à jour (`origin/dev-claude`), arbre propre. `npm test` 273 verts (19 fichiers) ; `npx tsc --noEmit` 0 erreur ; `npm run lint` 0 problème ; `npm run build` (DATABASE_URL factice) sans erreur ; `tsc` après build 0 erreur. Docs lus : CLAUDE.md, plan mise-en-production (§2.8, §4, §9), architecture (§2.1, §3, §8.1, §9), mémo (§0, §1.1, §3, §4), edgecase.md, guides Next métadonnées. Questions D52 à D57 posées et tranchées par le propriétaire. Plan créé. | Implémentation en attente de validation du plan par le propriétaire. |
| 2026-10-29 | **Renommage exécuté et validé.** Code et interface renommés (layout, login, unauthorized, dashboard, global-error, Navbar, errors.ts). Commentaires et libellés de tests mis à jour. Documentation vivante mise à jour (CLAUDE.md, README.md, docs/README.md, mise-en-production, architecture, memory-exploitation, edgecase). Vérifications toutes vertes : 273/273 tests OK, tsc 0 erreur, lint 0 problème, build de prod vert, tsc après build vert, git grep vérifié conforme au §3. | Demande portail rédigée (§7) à transmettre par le propriétaire ; projet Neon à renommer dans la console Neon (D57). Prêt pour commit sur demande explicite. |

---

## 7. Demande pour l'agent du portail (à transmettre par le propriétaire)

**Objet** : renommage du nom affiché de l'application ResaVroom

L'application ResaVroom (identifiant `resavroom`) change de nom affiché : « ResaVroom » → **« EM Drive »**.
Demande : mettre à jour le nom affiché sur la tuile du portail pour cette application.

L'identifiant technique `resavroom` est conservé (D55) : aucune autre modification n'est demandée pour l'instant.