// tests/rate-limit.test.ts — Limitation de débit des routes qui appellent un service extérieur (D44, cas limite 6)
// Par personne et par route, en mémoire de l'instance : itinéraires (OpenRouteService, à quota), communes (BAN),
// annuaire du portail. Session et services simulés : aucun réseau.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/services/geo-service", () => ({ searchAddress: vi.fn(), getDirections: vi.fn() }));
vi.mock("@/lib/portail-directory", () => ({ searchDirectory: vi.fn() }));

const NOW = new Date("2026-10-29T12:00:00.000Z");
const ALICE = { sub: "sub-alice", email: "alice@em-normandie.fr", name: "Alice" };
const BOB = { sub: "sub-bob", email: "bob@em-normandie.fr", name: "Bob" };

type RouteName = "directions" | "autocomplete" | "search";

/** Les limites retenues (D44), par minute et par personne. */
const LIMITS: Record<RouteName, number> = { directions: 20, autocomplete: 60, search: 30 };

/** Une requête qui appelle le service extérieur. */
const VALID_QUERY: Record<RouteName, string> = {
  directions: "originLat=49.49&originLng=0.11&destLat=49.18&destLng=-0.37",
  autocomplete: "q=Rouen",
  search: "q=martin",
};

let handlers: Record<RouteName, (request: NextRequest) => Promise<Response | undefined>>;
let serviceCalls: Record<RouteName, () => number>;
let signedIn: typeof ALICE | null;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.resetModules(); // compteurs neufs : ils vivent dans la mémoire du module

  const auth = await import("@/lib/auth");
  signedIn = ALICE;
  vi.mocked(auth.getSession).mockImplementation(async () =>
    signedIn ? { user: signedIn, expires: "2099-01-01T00:00:00.000Z" } : null
  );

  const geo = await import("@/lib/services/geo-service");
  vi.mocked(geo.getDirections).mockResolvedValue({ durationMinutes: 75, distanceKm: 92 });
  vi.mocked(geo.searchAddress).mockResolvedValue([]);
  const directory = await import("@/lib/portail-directory");
  vi.mocked(directory.searchDirectory).mockResolvedValue([]);

  handlers = {
    directions: (await import("@/app/api/geo/directions/route")).GET,
    autocomplete: (await import("@/app/api/geo/autocomplete/route")).GET,
    search: (await import("@/app/api/users/search/route")).GET,
  };
  serviceCalls = {
    directions: () => vi.mocked(geo.getDirections).mock.calls.length,
    autocomplete: () => vi.mocked(geo.searchAddress).mock.calls.length,
    search: () => vi.mocked(directory.searchDirectory).mock.calls.length,
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const PATHS: Record<RouteName, string> = {
  directions: "/api/geo/directions",
  autocomplete: "/api/geo/autocomplete",
  search: "/api/users/search",
};

async function call(route: RouteName, query: string = VALID_QUERY[route]): Promise<Response> {
  const response = await handlers[route](new NextRequest(`http://localhost:3002${PATHS[route]}?${query}`));
  if (!response) throw new Error("La route n'a rendu aucune réponse.");
  return response;
}

/** Épuise la limite de la personne connectée sur une route ; chaque requête doit passer. */
async function exhaust(route: RouteName) {
  for (let i = 0; i < LIMITS[route]; i++) {
    expect((await call(route)).status, `requête ${i + 1} sur ${LIMITS[route]}`).toBe(200);
  }
}

const ROUTES = Object.keys(LIMITS) as RouteName[];

describe("D44 : limitation de débit, route par route", () => {
  it.each(ROUTES)("%s : la limite passe, la suivante reçoit 429 RATE_LIMITED sans appel au service", async (route) => {
    await exhaust(route);
    expect(serviceCalls[route]()).toBe(LIMITS[route]);

    const refused = await call(route);
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.message).toMatch(/^Trop de /);
    const retryAfter = Number(refused.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(serviceCalls[route]()).toBe(LIMITS[route]);
  });

  it.each(ROUTES)("%s : la réponse 429 ne dit rien de la personne", async (route) => {
    await exhaust(route);
    const refused = await call(route);
    expect(refused.status).toBe(429);
    const text = await refused.text();
    expect(text).not.toContain(ALICE.sub);
    expect(text).not.toContain(ALICE.email);
  });

  it.each(ROUTES)("%s : une minute plus tard, les requêtes repassent", async (route) => {
    await exhaust(route);
    expect((await call(route)).status).toBe(429);
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect((await call(route)).status).toBe(200);
  });
});

describe("D44 : compteurs par personne et par route", () => {
  it("une autre personne n'est pas freinée", async () => {
    await exhaust("search");
    expect((await call("search")).status).toBe(429);
    signedIn = BOB;
    expect((await call("search")).status).toBe(200);
  });

  it("chaque route a son compteur", async () => {
    await exhaust("search");
    expect((await call("search")).status).toBe(429);
    expect((await call("autocomplete")).status).toBe(200);
    expect((await call("directions")).status).toBe(200);
  });
});

describe("D44 : ce qui n'appelle pas le service n'est pas compté", () => {
  it("sans session : 401, jamais d'appel au service", async () => {
    signedIn = null;
    for (const route of ROUTES) {
      for (let i = 0; i <= LIMITS[route]; i++) expect((await call(route)).status).toBe(401);
      expect(serviceCalls[route]()).toBe(0);
    }
  });

  it("une recherche de moins de deux caractères ne compte pas", async () => {
    for (const route of ["autocomplete", "search"] as const) {
      for (let i = 0; i <= LIMITS[route]; i++) expect((await call(route, "q=a")).status).toBe(200);
      await exhaust(route);
    }
  });

  it("un itinéraire aux coordonnées invalides (400) ne compte pas", async () => {
    for (let i = 0; i <= LIMITS.directions; i++) {
      expect((await call("directions", "originLat=abc")).status).toBe(400);
    }
    await exhaust("directions");
  });
});
