// src/lib/portail-directory.ts — Annuaire du portail admission (contrat portail v1 §7), côté serveur seulement
// Jeton client_credentials (scope directory) gardé en mémoire jusqu'à son terme ; recherche des personnes qui ont
// accès à ResaVroom ; identité d'une personne choisie par un écran (D24). Ce module lit le secret du client : il
// ne doit jamais atteindre le navigateur (D28).

import "server-only";
import { z } from "zod";
import { portalDiscoveryUrl, portalHomeUrl, portalIssuer } from "./portail";
import {
  BusinessError,
  DirectoryRateLimitedError,
  DirectoryUnavailableError,
  UnknownPersonError,
  ValidationError,
} from "./utils/errors";

/** Une personne, réduite à ce dont ResaVroom a besoin (D26 : sans le rôle). */
export interface PersonIdentity {
  sub: string;
  name: string;
  email: string;
}

/** Une personne désignée par un écran : le sub et l'adresse de la personne choisie dans la recherche. */
export interface ChosenPerson {
  sub: string;
  email?: string;
}

/** Le portail refuse un q d'un seul caractère (contrat §7). */
const MIN_QUERY_LENGTH = 2;
const TIMEOUT_MS = 5000;
/** Le jeton se renouvelle une minute avant son terme, pour ne pas en présenter un qui expire en route. */
const TOKEN_MARGIN_MS = 60_000;

// Jeton gardé en mémoire du serveur (une heure, contrat §7), et demande en cours partagée
let cachedToken: { value: string; expiresAt: number } | null = null;
let pendingToken: Promise<string> | null = null;

const directoryResponse = z.object({
  people: z.array(z.object({ sub: z.string().min(1), email: z.string().min(1), name: z.string().nullish() })),
});

/** Consigne le motif d'un échec : jamais le jeton, le secret, un nom ni une adresse (cas limite 9). */
function unavailable(reason: string): DirectoryUnavailableError {
  console.error(`[ANNUAIRE] Indisponible : ${reason}.`);
  return new DirectoryUnavailableError();
}

function rateLimited(): DirectoryRateLimitedError {
  console.warn("[ANNUAIRE] Trop de requêtes (429).");
  return new DirectoryRateLimitedError();
}

/** RFC 6749 §2.3.1 : identifiant et secret sont encodés en application/x-www-form-urlencoded avant base64. */
function formEncode(value: string): string {
  return new URLSearchParams({ v: value }).toString().slice("v=".length);
}

function basicAuthorization(): string {
  const credentials = `${formEncode(process.env.PORTAIL_CLIENT_ID ?? "")}:${formEncode(process.env.PORTAIL_CLIENT_SECRET ?? "")}`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}

/** token_endpoint, lu dans la découverte ; refusé hors de l'origine de l'émetteur, où le secret n'a pas à aller. */
async function tokenEndpoint(): Promise<string> {
  const response = await fetch(portalDiscoveryUrl(), { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw unavailable(`découverte, HTTP ${response.status}`);
  const { token_endpoint: endpoint } = (await response.json()) as { token_endpoint?: unknown };
  if (typeof endpoint !== "string") throw unavailable("token_endpoint absent de la découverte");
  if (new URL(endpoint).origin !== new URL(portalIssuer()).origin) throw unavailable("token_endpoint hors de l'émetteur");
  return endpoint;
}

async function requestToken(): Promise<string> {
  const response = await fetch(await tokenEndpoint(), {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "directory" }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };

  if (response.status === 400 && body.error === "unauthorized_client") throw unavailable("annuaire fermé sur ce client (unauthorized_client)");
  if (response.status === 429) throw rateLimited();
  if (!response.ok) throw unavailable(`jeton refusé, HTTP ${response.status}`);
  if (typeof body.access_token !== "string") throw unavailable("jeton absent de la réponse");

  // Sans durée lisible, le jeton ne sert qu'une fois
  const lifetimeSeconds = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 0;
  cachedToken = { value: body.access_token, expiresAt: Date.now() + lifetimeSeconds * 1000 };
  return body.access_token;
}

/** Le jeton en cours, s'il vaut encore au-delà de la marge ; sinon un neuf, une seule demande à la fois. */
async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_MARGIN_MS) return cachedToken.value;
  pendingToken ??= requestToken().finally(() => {
    pendingToken = null;
  });
  return pendingToken;
}

/** Jette un jeton refusé par l'annuaire, sauf s'il a déjà été remplacé. */
function discardToken(token: string) {
  if (cachedToken?.value === token) cachedToken = null;
}

/** L'adresse de l'annuaire, déduite de l'origine de l'émetteur (contrat §7). */
function directoryUrl(q: string): string {
  const home = portalHomeUrl();
  if (!home) throw unavailable("PORTAIL_ISSUER absente ou invalide");
  const url = new URL("/api/directory", home);
  url.searchParams.set("q", q);
  return url.toString();
}

function callDirectory(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Les personnes qui ont accès à ResaVroom et dont le nom ou l'adresse contient `query` (deux caractères au
 * moins, sinon aucune, sans appel). Lève DirectoryUnavailableError (503) ou DirectoryRateLimitedError (429).
 */
export async function searchDirectory(query: string): Promise<PersonIdentity[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  try {
    const url = directoryUrl(q);
    let token = await accessToken();
    let response = await callDirectory(url, token);
    if (response.status === 401) {
      // Jeton refusé (annuaire refermé puis rouvert depuis son émission, par exemple) : un seul nouvel essai
      discardToken(token);
      token = await accessToken();
      response = await callDirectory(url, token);
      if (response.status === 401) throw unavailable("annuaire, HTTP 401 avec un jeton neuf");
    }
    if (response.status === 429) throw rateLimited();
    if (!response.ok) throw unavailable(`annuaire, HTTP ${response.status}`);

    const parsed = directoryResponse.safeParse(await response.json());
    if (!parsed.success) throw unavailable("réponse de l'annuaire d'une autre forme");
    return parsed.data.people.map(({ sub, email, name }) => ({ sub, name: name || email, email }));
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    // Le nom de l'erreur seulement : le message d'une analyse JSON cite le corps reçu (noms, adresses)
    throw unavailable(error instanceof Error ? error.name : "erreur inconnue");
  }
}

/**
 * L'identité d'une personne choisie par un écran (D24, écart 5), jamais recopiée du corps de la requête.
 * L'appelant vient de sa session. Une autre personne est cherchée dans l'annuaire par son adresse (il ne
 * cherche pas par sub), puis retenue si son sub est le même : son nom et son adresse sont ceux du portail.
 * Absente de l'annuaire : UnknownPersonError (400).
 */
export async function resolveChosenPerson(choice: ChosenPerson, caller: PersonIdentity): Promise<PersonIdentity> {
  if (choice.sub === caller.sub) return caller;
  if (!choice.email) throw new ValidationError("L'adresse de la personne choisie est requise.");

  const person = (await searchDirectory(choice.email)).find((entry) => entry.sub === choice.sub);
  if (!person) throw new UnknownPersonError();
  return person;
}
