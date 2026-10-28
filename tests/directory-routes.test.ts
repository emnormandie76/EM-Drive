// tests/directory-routes.test.ts — Recherche par l'annuaire et identité des autres personnes, route par route
// (contrat portail v1 §7 ; écart 5 du relevé P-01 ; D24 à D27 ; cas limite 11). Client Prisma simulé, session
// simulée, portail imité (tests/helpers/portail-fake.ts) : aucun réseau, aucune base.

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaMock } from "./helpers/prisma-mock";
import { DRIVER, hoursFromNow, makePassenger, makeTrip } from "./helpers/fixtures";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  JEAN,
  MARIE,
  PORTAL_ISSUER,
  createFakePortal,
  type FakePortalOptions,
} from "./helpers/portail-fake";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/services/audit-service", () => ({ logAudit: vi.fn() }));

/** L'appelant : conducteur des trajets de fixtures.ts. */
const ME = { sub: DRIVER, email: "moi@em-normandie.fr", name: "Moi" };

const tripParams = { params: Promise.resolve({ id: "trip-1" }) };

let db: PrismaMock;
let portal: ReturnType<typeof createFakePortal>;
let routes: {
  search: (request: NextRequest) => Promise<Response>;
  createTrip: (request: NextRequest) => Promise<Response>;
  updateTrip: (request: NextRequest, context: typeof tripParams) => Promise<Response>;
  addPassenger: (request: NextRequest, context: typeof tripParams) => Promise<Response>;
};

/** Le type des routes admet un retour vide (garde de session) : le test exige une réponse. */
async function responseOf(pending: Promise<Response | undefined>): Promise<Response> {
  const response = await pending;
  if (!response) throw new Error("La route n'a rendu aucune réponse.");
  return response;
}

/**
 * Modules neufs à chaque test (le jeton de l'annuaire est gardé en mémoire du serveur), puis session,
 * client Prisma simulé et portail imité.
 */
async function setup(options: { admin?: boolean; session?: boolean; portal?: FakePortalOptions } = {}) {
  vi.stubEnv("PORTAIL_ISSUER", PORTAL_ISSUER);
  vi.stubEnv("PORTAIL_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("PORTAIL_CLIENT_SECRET", CLIENT_SECRET);
  portal = createFakePortal(options.portal);
  vi.stubGlobal("fetch", portal.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.resetModules();

  const { resetPrismaMock } = await import("./helpers/prisma-mock");
  db = (await import("@/lib/prisma")).prisma as unknown as PrismaMock;
  resetPrismaMock(db);
  db.trip.findFirst.mockResolvedValue(null); // aucun conflit
  db.appSetting.findUnique.mockResolvedValue(null); // buffer par défaut
  db.vehicle.findUniqueOrThrow.mockResolvedValue({ id: "vehicle-1", seats: 5 });
  db.trip.create.mockImplementation(async ({ data }) => ({ id: "trip-1", ...data }));
  db.trip.update.mockImplementation(async ({ data }) => ({ id: "trip-1", ...data }));

  const auth = await import("@/lib/auth");
  vi.mocked(auth.getSession).mockResolvedValue(
    options.session === false ? null : { user: ME, expires: "2099-01-01T00:00:00.000Z" }
  );
  vi.mocked(auth.isAdmin).mockResolvedValue(options.admin ?? false);

  const search = (await import("@/app/api/users/search/route")).GET;
  const createTrip = (await import("@/app/api/trips/route")).POST;
  const updateTrip = (await import("@/app/api/trips/[id]/route")).PATCH;
  const addPassenger = (await import("@/app/api/trips/[id]/passengers/route")).POST;
  routes = {
    search: (request) => responseOf(search(request)),
    createTrip: (request) => responseOf(createTrip(request)),
    updateTrip: (request, context) => responseOf(updateTrip(request, context)),
    addPassenger: (request, context) => responseOf(addPassenger(request, context)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function jsonRequest(method: string, body: unknown) {
  return new NextRequest("http://localhost:3002/api/test", { method, body: JSON.stringify(body) });
}

function searchRequest(q: string) {
  return new NextRequest(`http://localhost:3002/api/users/search?q=${encodeURIComponent(q)}`);
}

/** Un aller simple dans 72 h, tel que l'envoie StepConfirm, sans conducteur choisi ni passager. */
function newTrip(extra: Record<string, unknown> = {}) {
  return {
    vehicleId: "vehicle-1",
    type: "ONE_WAY",
    originCampusId: "campus-1",
    destinationCampusId: "campus-2",
    departureTime: hoursFromNow(72).toISOString(),
    estimatedArrivalTime: hoursFromNow(74).toISOString(),
    ...extra,
  };
}

/** Ce que la route a écrit : le premier appel du modèle simulé. */
function written(fn: PrismaMock["trip"]["create"]) {
  return fn.mock.calls[0][0].data;
}

// ══════════════════════════════════════════════
// RECHERCHE
// ══════════════════════════════════════════════

describe("GET /api/users/search (contrat §7, D25, D26)", () => {
  it("sans session : 401, sans appel au portail", async () => {
    await setup({ session: false });
    const response = await routes.search(searchRequest("jean"));
    expect(response.status).toBe(401);
    expect(portal.fetch).not.toHaveBeenCalled();
  });

  it("moins de deux caractères : liste vide, sans appel au portail", async () => {
    await setup();
    const response = await routes.search(searchRequest("j"));
    expect(await response.json()).toEqual([]);
    expect(portal.fetch).not.toHaveBeenCalled();
  });

  it("rend les personnes de l'annuaire : sub, name, email, sans le rôle", async () => {
    await setup();
    const response = await routes.search(searchRequest("martin"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ sub: MARIE.sub, name: MARIE.name, email: MARIE.email }]);
  });

  it("annuaire fermé : 503 DIRECTORY_UNAVAILABLE, avec un message pour l'écran", async () => {
    await setup({ portal: { closed: true } });
    const response = await routes.search(searchRequest("jean"));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("DIRECTORY_UNAVAILABLE");
    expect(body.message).toEqual(expect.any(String));
  });

  it("trop de requêtes : 429 DIRECTORY_RATE_LIMITED", async () => {
    await setup({ portal: { directoryStatus: 429 } });
    const response = await routes.search(searchRequest("jean"));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "DIRECTORY_RATE_LIMITED" });
  });
});

// ══════════════════════════════════════════════
// CONDUCTEUR CHOISI PAR UN ADMIN À LA CRÉATION
// ══════════════════════════════════════════════

describe("POST /api/trips : conducteur choisi par un admin (écart 5, D24)", () => {
  it("le nom et l'adresse du conducteur viennent de l'annuaire, pas du corps", async () => {
    await setup({ admin: true });
    const body = newTrip({ driverSub: JEAN.sub, driverEmail: JEAN.email, driverDisplayName: "Nom inventé" });
    const response = await routes.createTrip(jsonRequest("POST", body));

    expect(response.status).toBe(201);
    expect(written(db.trip.create)).toMatchObject({ driverSub: JEAN.sub, driverEmail: JEAN.email, driverDisplayName: JEAN.name });
  });

  it("refuse (400) un conducteur que l'annuaire ne connaît pas sous ce sub", async () => {
    await setup({ admin: true });
    const response = await routes.createTrip(jsonRequest("POST", newTrip({ driverSub: "sub-inventé", driverEmail: JEAN.email })));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "PERSON_NOT_IN_DIRECTORY" });
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("un utilisateur non admin reste le conducteur, sans appel au portail", async () => {
    await setup();
    const body = newTrip({ driverSub: JEAN.sub, driverEmail: JEAN.email, driverDisplayName: JEAN.name });
    const response = await routes.createTrip(jsonRequest("POST", body));

    expect(response.status).toBe(201);
    expect(written(db.trip.create)).toMatchObject({ driverSub: ME.sub, driverEmail: ME.email, driverDisplayName: ME.name });
    expect(portal.fetch).not.toHaveBeenCalled();
  });

  it("sans conducteur choisi ni passager, la création ne dépend pas de l'annuaire", async () => {
    await setup({ admin: true, portal: { closed: true } });
    const response = await routes.createTrip(jsonRequest("POST", newTrip({ passengers: [] })));

    expect(response.status).toBe(201);
    expect(portal.fetch).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// PASSAGERS À LA CRÉATION
// ══════════════════════════════════════════════

describe("POST /api/trips : passagers choisis dans l'annuaire (cas limite 11, D24, D27)", () => {
  it("crée le trajet avec les passagers choisis (sub et adresse), leur nom lu dans l'annuaire", async () => {
    await setup();
    const response = await routes.createTrip(
      jsonRequest("POST", newTrip({ passengers: [{ userSub: MARIE.sub, userEmail: MARIE.email }] }))
    );

    expect(response.status).toBe(201);
    expect(written(db.trip.create).passengers.createMany.data).toEqual([
      { userSub: MARIE.sub, userEmail: MARIE.email, userDisplayName: MARIE.name, addedBy: "DRIVER" },
    ]);
  });

  it("ignore le nom et l'adresse envoyés pour un passager", async () => {
    await setup();
    const passenger = { userSub: JEAN.sub, userEmail: JEAN.email.toUpperCase(), userDisplayName: "Nom inventé" };
    await routes.createTrip(jsonRequest("POST", newTrip({ passengers: [passenger] })));

    expect(written(db.trip.create).passengers.createMany.data).toEqual([
      { userSub: JEAN.sub, userEmail: JEAN.email, userDisplayName: JEAN.name, addedBy: "DRIVER" },
    ]);
  });

  it("refuse (400) un passager absent de l'annuaire", async () => {
    await setup();
    const passenger = { userSub: "sub-inconnu", userEmail: "inconnu@em-normandie.fr" };
    const response = await routes.createTrip(jsonRequest("POST", newTrip({ passengers: [passenger] })));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "PERSON_NOT_IN_DIRECTORY" });
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("refuse (400) un passager égal au conducteur", async () => {
    await setup();
    const response = await routes.createTrip(
      jsonRequest("POST", newTrip({ passengers: [{ userSub: ME.sub, userEmail: ME.email }] }))
    );

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/conducteur/);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("refuse (400) un passager en double", async () => {
    await setup();
    const marie = { userSub: MARIE.sub, userEmail: MARIE.email };
    const response = await routes.createTrip(jsonRequest("POST", newTrip({ passengers: [marie, marie] })));

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/deux fois/);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("annuaire fermé : 503, aucun trajet créé", async () => {
    await setup({ portal: { closed: true } });
    const response = await routes.createTrip(
      jsonRequest("POST", newTrip({ passengers: [{ userSub: MARIE.sub, userEmail: MARIE.email }] }))
    );

    expect(response.status).toBe(503);
    expect(db.trip.create).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// CONDUCTEUR CHANGÉ PAR UN ADMIN
// ══════════════════════════════════════════════

describe("PATCH /api/trips/[id] : conducteur choisi par un admin (écart 5, D24)", () => {
  async function setupTrip(trip = makeTrip()) {
    await setup({ admin: true });
    db.trip.findUnique.mockResolvedValue(trip);
    db.trip.findUniqueOrThrow.mockResolvedValue(trip);
  }

  it("conducteur inchangé : rien n'est recopié du corps, sans appel au portail", async () => {
    await setupTrip();
    const body = { vehicleId: "vehicle-1", driverSub: DRIVER, driverEmail: "faux@em-normandie.fr", driverDisplayName: "Nom inventé" };
    const response = await routes.updateTrip(jsonRequest("PATCH", body), tripParams);

    expect(response.status).toBe(200);
    const data = written(db.trip.update);
    expect(data.driverEmail).toBeUndefined();
    expect(data.driverDisplayName).toBeUndefined();
    expect(portal.fetch).not.toHaveBeenCalled();
  });

  it("nouveau conducteur : nom et adresse lus dans l'annuaire", async () => {
    await setupTrip();
    const body = { vehicleId: "vehicle-1", driverSub: JEAN.sub, driverEmail: JEAN.email, driverDisplayName: "Nom inventé" };
    const response = await routes.updateTrip(jsonRequest("PATCH", body), tripParams);

    expect(response.status).toBe(200);
    expect(written(db.trip.update)).toMatchObject({ driverSub: JEAN.sub, driverEmail: JEAN.email, driverDisplayName: JEAN.name });
  });

  it("nouveau conducteur inconnu de l'annuaire : 400, rien écrit", async () => {
    await setupTrip();
    const body = { vehicleId: "vehicle-1", driverSub: "sub-inventé", driverEmail: JEAN.email };
    const response = await routes.updateTrip(jsonRequest("PATCH", body), tripParams);

    expect(response.status).toBe(400);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("nouveau conducteur déjà passager du trajet : 400, rien écrit", async () => {
    await setupTrip(makeTrip({ passengers: [makePassenger({ userSub: MARIE.sub, userEmail: MARIE.email })] }));
    const body = { vehicleId: "vehicle-1", driverSub: MARIE.sub, driverEmail: MARIE.email };
    const response = await routes.updateTrip(jsonRequest("PATCH", body), tripParams);

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/passager/);
    expect(db.trip.update).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// PASSAGER AJOUTÉ PAR LE CONDUCTEUR
// ══════════════════════════════════════════════

describe("POST /api/trips/[id]/passengers : ajout par le conducteur (écart 5, D24)", () => {
  it("le passager ajouté a le nom et l'adresse de l'annuaire", async () => {
    await setup();
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    const body = { addedBy: "DRIVER", userSub: MARIE.sub, userEmail: MARIE.email, userDisplayName: "Nom inventé" };
    const response = await routes.addPassenger(jsonRequest("POST", body), tripParams);

    expect(response.status).toBe(201);
    expect(db.passenger.create.mock.calls[0][0].data).toMatchObject({
      userSub: MARIE.sub,
      userEmail: MARIE.email,
      userDisplayName: MARIE.name,
      addedBy: "DRIVER",
    });
  });

  it("refuse (400) un passager absent de l'annuaire, sans rien écrire", async () => {
    await setup();
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    const body = { addedBy: "DRIVER", userSub: "sub-inconnu", userEmail: "inconnu@em-normandie.fr", userDisplayName: "Inconnu" };
    const response = await routes.addPassenger(jsonRequest("POST", body), tripParams);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "PERSON_NOT_IN_DIRECTORY" });
    expect(db.passenger.create).not.toHaveBeenCalled();
  });
});
