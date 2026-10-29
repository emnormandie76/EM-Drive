// src/lib/rate-limit.ts — Limitation de débit des routes qui appellent un service extérieur (D44, cas limite 6)
// Fenêtre fixe d'une minute, par personne (sub) et par route, dans la mémoire de l'instance : sur Vercel, chaque
// instance compte de son côté (protection partielle, assumée). Les services visés sont à quota : OpenRouteService,
// l'API Adresse (BAN) et l'annuaire du portail (120 requêtes par minute pour toutes ses applications).

import { NextResponse } from "next/server";

const WINDOW_MS = 60_000;

/** Requêtes permises par personne et par minute, route par route. */
export const RATE_LIMITS = {
  geoDirections: 20,
  geoAutocomplete: 60,
  userSearch: 30,
} as const;

export type RateLimitedRoute = keyof typeof RATE_LIMITS;

type Window = { startedAt: number; count: number };

const windows = new Map<string, Window>();

/** Au-delà de cette taille, les fenêtres échues sont oubliées (la mémoire de l'instance ne grossit pas sans fin). */
const PURGE_THRESHOLD = 10_000;

function purgeExpired(now: number) {
  for (const [key, window] of windows) {
    if (now - window.startedAt >= WINDOW_MS) windows.delete(key);
  }
}

/**
 * Compte une requête de cette personne sur cette route. Rend null si elle passe, sinon une réponse 429
 * `RATE_LIMITED` avec `Retry-After` (secondes avant la fin de la fenêtre). La réponse ne cite pas la personne.
 */
export function rateLimit(route: RateLimitedRoute, sub: string): NextResponse | null {
  const now = Date.now();
  if (windows.size > PURGE_THRESHOLD) purgeExpired(now);

  const key = `${route}:${sub}`;
  const current = windows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    windows.set(key, { startedAt: now, count: 1 });
    return null;
  }
  if (current.count < RATE_LIMITS[route]) {
    current.count += 1;
    return null;
  }

  const retryAfter = Math.max(1, Math.ceil((current.startedAt + WINDOW_MS - now) / 1000));
  return NextResponse.json(
    { error: "RATE_LIMITED", message: "Trop de requêtes en peu de temps : réessayez dans un instant." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
