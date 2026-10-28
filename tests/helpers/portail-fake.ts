// tests/helpers/portail-fake.ts — Imitation du portail pour l'annuaire (contrat portail v1 §7), sans réseau
// Remplace fetch : découverte, jeton client_credentials authentifié en client_secret_basic, annuaire filtré
// comme celui du portail (nom ou adresse contenant q, sans casse). Les pannes se règlent par options.

import { vi } from "vitest";

export const PORTAL_ISSUER = "https://portail.test/api/auth";
export const DISCOVERY_URL = `${PORTAL_ISSUER}/.well-known/openid-configuration`;
export const TOKEN_URL = `${PORTAL_ISSUER}/oauth2/token`;
export const DIRECTORY_URL = "https://portail.test/api/directory";
export const CLIENT_ID = "resavroom-dev";
/** Un secret fictif à encoder : un deux-points, puis l'exemple de la RFC 6749 (annexe B), « %&+£€ » précédé d'une espace. */
export const CLIENT_SECRET = "s3cr:t %&+£€";

export interface DirectoryEntry {
  sub: string;
  email: string;
  name: string;
  role: string;
}

export const JEAN: DirectoryEntry = { sub: "sub-jean", email: "jean.dupont@em-normandie.fr", name: "Jean Dupont", role: "USER" };
export const MARIE: DirectoryEntry = { sub: "sub-marie", email: "marie.martin@em-normandie.fr", name: "Marie Martin", role: "ADMIN" };

export interface FakePortalOptions {
  people?: DirectoryEntry[];
  /** Annuaire fermé sur ce client : la demande de jeton reçoit 400 unauthorized_client. */
  closed?: boolean;
  /** Durée de vie du jeton, en secondes (une heure par défaut). */
  expiresIn?: number;
  /** Réponse imposée à l'annuaire (429, 500…). */
  directoryStatus?: number;
  /** Corps brut rendu en 200 par l'annuaire (réponse illisible). */
  directoryRawBody?: string;
  /** L'annuaire refuse tout jeton (401). */
  rejectTokens?: boolean;
  /** Le réseau échoue. */
  down?: boolean;
  /** token_endpoint annoncé par la découverte. */
  tokenEndpoint?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function formDecode(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

/** Identifiant et secret lus dans l'en-tête Basic, décodés comme le demande la RFC 6749 §2.3.1. */
function basicCredentials(header: string | null): { id: string; secret: string } | null {
  const match = /^Basic (\S+)$/.exec(header ?? "");
  if (!match) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  return { id: formDecode(decoded.slice(0, colon)), secret: formDecode(decoded.slice(colon + 1)) };
}

export function createFakePortal(options: FakePortalOptions = {}) {
  const people = options.people ?? [JEAN, MARIE];
  const validTokens = new Set<string>();
  let issued = 0;

  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (options.down) throw new TypeError("fetch failed");
    const url = new URL(input instanceof Request ? input.url : String(input));
    const endpoint = `${url.origin}${url.pathname}`;
    const headers = new Headers(init.headers);

    if (endpoint === DISCOVERY_URL) {
      return json({ issuer: PORTAL_ISSUER, token_endpoint: options.tokenEndpoint ?? TOKEN_URL });
    }

    if (endpoint === TOKEN_URL && init.method === "POST") {
      const credentials = basicCredentials(headers.get("authorization"));
      if (credentials?.id !== CLIENT_ID || credentials.secret !== CLIENT_SECRET) {
        return json({ error: "invalid_client" }, 401);
      }
      const body = new URLSearchParams(String(init.body));
      if (body.get("grant_type") !== "client_credentials" || body.get("scope") !== "directory") {
        return json({ error: "invalid_request" }, 400);
      }
      if (options.closed) return json({ error: "unauthorized_client" }, 400);
      issued += 1;
      const token = `jeton-${issued}`;
      validTokens.add(token);
      return json({ access_token: token, token_type: "Bearer", expires_in: options.expiresIn ?? 3600, scope: "directory" });
    }

    if (endpoint === DIRECTORY_URL && (init.method ?? "GET") === "GET") {
      if (options.directoryStatus) return json({ error: "imposed" }, options.directoryStatus);
      const token = /^Bearer (\S+)$/.exec(headers.get("authorization") ?? "")?.[1];
      if (options.rejectTokens || !token || !validTokens.has(token)) return json({ error: "invalid_token" }, 401);
      if (options.directoryRawBody !== undefined) return new Response(options.directoryRawBody, { status: 200 });
      const q = url.searchParams.get("q")?.trim() || undefined;
      if (q && q.length < 2) return json({ error: "invalid_request" }, 400);
      const needle = q?.toLowerCase();
      const found = people.filter(
        (person) => !needle || person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle)
      );
      return json({ people: found });
    }

    return json({ error: "not_found" }, 404);
  });

  const callsTo = (target: string) => fetch.mock.calls.filter(([input]) => String(input).startsWith(target));

  return {
    fetch,
    /** Invalide les jetons déjà donnés (annuaire refermé puis rouvert, par exemple) : l'annuaire répondra 401. */
    revokeTokens: () => validTokens.clear(),
    tokenRequests: () => callsTo(TOKEN_URL).length,
    directoryRequests: () => callsTo(DIRECTORY_URL).length,
    discoveryRequests: () => callsTo(DISCOVERY_URL).length,
  };
}
