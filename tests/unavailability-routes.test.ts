// tests/unavailability-routes.test.ts — Routes des indisponibilités (D58, D60, D67, D68)
// Gardes admin, corps invalides (400), conflit avec des trajets (409 et sa liste), audit ; lecture du véhicule
// (le commentaire reste aux admins) ; le statut disparaît des routes véhicule (D59).

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { GET as listRoute, POST as createRoute } from "@/app/api/admin/vehicles/[id]/unavailabilities/route";
import { DELETE as deleteRoute, PATCH as updateRoute } from "@/app/api/admin/unavailabilities/[id]/route";
import { PATCH as updateVehicleRoute } from "@/app/api/admin/vehicles/[id]/route";
import { POST as createVehicleRoute } from "@/app/api/admin/vehicles/route";
import { GET as getVehicleRoute } from "@/app/api/vehicles/[id]/route";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { findManyIn } from "./helpers/where-matcher";
import { DRIVER, makeTrip, makeUnavailability } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;

const NOW = new Date("2030-01-01T00:00:00.000Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600_000);
const vehicleParams = { params: Promise.resolve({ id: "vehicle-1" }) };
const periodParams = { params: Promise.resolve({ id: "unavailability-1" }) };

const validBody = { reason: "CAR_BOOKING", startsAt: at(10).toISOString(), endsAt: at(20).toISOString(), comment: "Salon" };

function request(method: string, body?: unknown) {
  return new NextRequest("http://localhost:3002/api/admin/x", {
    method,
    ...(body !== undefined && { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

const signedInAs = (admin: boolean) => {
  vi.mocked(getSession).mockResolvedValue({
    user: { sub: DRIVER, email: "admin@em-normandie.fr", name: "Admin" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(admin);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetPrismaMock(db);
  signedInAs(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.vehicle.findUnique.mockResolvedValue({ id: "vehicle-1", seats: 5, defaultCampusId: "campus-1" });
  db.trip.findMany.mockResolvedValue([]);
  db.appSetting.findUnique.mockResolvedValue(null);
  db.vehicleUnavailability.findUnique.mockResolvedValue(makeUnavailability({ startsAt: at(10), endsAt: at(20) }));
  db.vehicleUnavailability.findMany.mockResolvedValue([]);
  db.vehicleUnavailability.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "unavailability-new",
    ...data,
  }));
  db.vehicleUnavailability.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...makeUnavailability({ startsAt: at(10), endsAt: at(20) }),
    ...data,
  }));
});

// ══════════════════════════════════════════════
// Gardes
// ══════════════════════════════════════════════

describe("gardes : administrateur seulement", () => {
  const calls: [string, () => Promise<Response>][] = [
    ["GET /api/admin/vehicles/[id]/unavailabilities", () => listRoute(request("GET"), vehicleParams)],
    ["POST /api/admin/vehicles/[id]/unavailabilities", () => createRoute(request("POST", validBody), vehicleParams)],
    ["PATCH /api/admin/unavailabilities/[id]", () => updateRoute(request("PATCH", { comment: "x" }), periodParams)],
    ["DELETE /api/admin/unavailabilities/[id]", () => deleteRoute(request("DELETE"), periodParams)],
  ];

  for (const [name, call] of calls) {
    it(`${name} : 401 sans session, sans rien écrire`, async () => {
      vi.mocked(getSession).mockResolvedValue(null);
      const response = await call();
      expect(response.status).toBe(401);
      expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
      expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
      expect(db.vehicleUnavailability.delete).not.toHaveBeenCalled();
    });

    it(`${name} : 403 pour un utilisateur, rôle relu en base, sans rien écrire`, async () => {
      signedInAs(false);
      const response = await call();
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "FORBIDDEN" });
      expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
      expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
      expect(db.vehicleUnavailability.delete).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });
  }
});

// ══════════════════════════════════════════════
// POST — création
// ══════════════════════════════════════════════

describe("POST /api/admin/vehicles/[id]/unavailabilities", () => {
  it("crée la période (201) et l'audit", async () => {
    const response = await createRoute(request("POST", validBody), vehicleParams);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "unavailability-new", reason: "CAR_BOOKING", vehicleId: "vehicle-1" });
    expect(db.vehicleUnavailability.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId: "vehicle-1",
        startsAt: at(10),
        endsAt: at(20),
        createdBySub: DRIVER,
        createdByEmail: "admin@em-normandie.fr",
      }),
    });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "VEHICLE_UNAVAILABILITY_CREATED", entityType: "vehicle", entityId: "vehicle-1" }),
    });
  });

  it("accepte une maintenance sans fin", async () => {
    const response = await createRoute(
      request("POST", { reason: "MAINTENANCE", startsAt: at(10).toISOString() }),
      vehicleParams
    );
    expect(response.status).toBe(201);
    expect(db.vehicleUnavailability.create).toHaveBeenCalledWith({ data: expect.objectContaining({ endsAt: null }) });
  });

  const invalidBodies: [string, unknown][] = [
    ["JSON mal formé", "{pas du json"],
    ["motif inconnu", { ...validBody, reason: "VACANCES" }],
    ["motif absent", { startsAt: validBody.startsAt, endsAt: validBody.endsAt }],
    ["début absent", { reason: "MAINTENANCE" }],
    ["début qui n'est pas une date ISO", { ...validBody, startsAt: "demain" }],
    ["fin qui n'est pas une date ISO", { ...validBody, endsAt: "2030-01-05" }],
    ["Car Booking sans fin", { reason: "CAR_BOOKING", startsAt: validBody.startsAt }],
    ["Car Booking avec une fin nulle", { reason: "CAR_BOOKING", startsAt: validBody.startsAt, endsAt: null }],
    ["fin avant le début", { ...validBody, startsAt: at(20).toISOString(), endsAt: at(10).toISOString() }],
    ["fin égale au début", { ...validBody, endsAt: validBody.startsAt }],
    ["commentaire de plus de 1000 caractères", { ...validBody, comment: "x".repeat(1001) }],
  ];
  for (const [name, body] of invalidBodies) {
    it(`400 VALIDATION_ERROR : ${name}`, async () => {
      const response = await createRoute(request("POST", body), vehicleParams);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "VALIDATION_ERROR" });
      expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });
  }

  it("404 pour un véhicule inconnu", async () => {
    db.vehicle.findUnique.mockResolvedValue(null);
    const response = await createRoute(request("POST", validBody), vehicleParams);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "NOT_FOUND" });
  });

  it("409 avec la liste des trajets en conflit (D60), sans rien écrire", async () => {
    const trips = [
      makeTrip({
        id: "trip-9",
        departureTime: at(12),
        estimatedArrivalTime: at(14),
        driverDisplayName: "Marie Curie",
        originCampus: { name: "Le Havre" },
        destinationCampus: { name: "Caen" },
      }),
    ];
    db.trip.findMany.mockImplementation(findManyIn(trips));
    const response = await createRoute(request("POST", validBody), vehicleParams);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("UNAVAILABILITY_TRIPS_CONFLICT");
    expect(body.message).toMatch(/trajet/i);
    expect(body.conflictingTrips).toEqual([
      expect.objectContaining({ id: "trip-9", driverDisplayName: "Marie Curie", origin: "Le Havre", destination: "Caen" }),
    ]);
    expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("409 UNAVAILABILITY_OVERLAP : une période par créneau et par véhicule (D70)", () => {
  const other = makeUnavailability({ id: "u-9", reason: "MAINTENANCE", startsAt: at(15), endsAt: at(25), comment: "Frein HS" });

  it("POST refuse une période qui en chevauche une autre, avec la liste", async () => {
    db.vehicleUnavailability.findMany.mockImplementation(findManyIn([other]));
    const response = await createRoute(request("POST", validBody), vehicleParams);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("UNAVAILABILITY_OVERLAP");
    expect(body.message).toMatch(/indisponibilit/i);
    expect(body.overlappingPeriods).toEqual([
      { id: "u-9", reason: "MAINTENANCE", startsAt: at(15).toISOString(), endsAt: at(25).toISOString() },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/Frein HS/);
    expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("PATCH refuse de décaler une période sur une autre", async () => {
    db.vehicleUnavailability.findMany.mockImplementation(findManyIn([other]));
    const response = await updateRoute(request("PATCH", { endsAt: at(18).toISOString() }), periodParams);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("UNAVAILABILITY_OVERLAP");
    expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// GET — liste
// ══════════════════════════════════════════════

describe("GET /api/admin/vehicles/[id]/unavailabilities", () => {
  it("rend les périodes en cours et à venir, commentaire et auteur compris", async () => {
    db.vehicleUnavailability.findMany.mockResolvedValue([
      makeUnavailability({ startsAt: at(10), endsAt: at(20), comment: "Frein HS" }),
    ]);
    const response = await listRoute(request("GET"), vehicleParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([expect.objectContaining({ id: "unavailability-1", comment: "Frein HS" })]);
    const { select } = db.vehicleUnavailability.findMany.mock.calls[0][0] as { select: Record<string, unknown> };
    expect(select).toMatchObject({ comment: true, createdByEmail: true });
  });

  it("404 pour un véhicule inconnu", async () => {
    db.vehicle.findUnique.mockResolvedValue(null);
    expect((await listRoute(request("GET"), vehicleParams)).status).toBe(404);
  });
});

// ══════════════════════════════════════════════
// PATCH et DELETE
// ══════════════════════════════════════════════

describe("PATCH /api/admin/unavailabilities/[id] (D68)", () => {
  it("modifie la période (200) et écrit l'audit", async () => {
    const response = await updateRoute(request("PATCH", { comment: "Autre salle" }), periodParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ comment: "Autre salle" });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "VEHICLE_UNAVAILABILITY_UPDATED", entityId: "vehicle-1" }),
    });
  });

  it("accepte un commentaire nul et une fin nulle (maintenance)", async () => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(makeUnavailability({ startsAt: at(10), endsAt: at(20) }));
    const response = await updateRoute(request("PATCH", { endsAt: null, comment: null }), periodParams);
    expect(response.status).toBe(200);
    expect(db.vehicleUnavailability.update).toHaveBeenCalledWith({
      where: { id: "unavailability-1" },
      data: { endsAt: null, comment: null },
    });
  });

  const invalidBodies: [string, unknown][] = [
    ["JSON mal formé", "{pas du json"],
    ["motif inconnu", { reason: "VACANCES" }],
    ["début nul", { startsAt: null }],
    ["date non ISO", { endsAt: "bientôt" }],
  ];
  for (const [name, body] of invalidBodies) {
    it(`400 VALIDATION_ERROR : ${name}`, async () => {
      const response = await updateRoute(request("PATCH", body), periodParams);
      expect(response.status).toBe(400);
      expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
    });
  }

  it("400 quand la période fusionnée est invalide : Car Booking sans fin", async () => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(
      makeUnavailability({ reason: "CAR_BOOKING", startsAt: at(10), endsAt: at(20) })
    );
    const response = await updateRoute(request("PATCH", { endsAt: null }), periodParams);
    expect(response.status).toBe(400);
    expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
  });

  it("404 pour une période inconnue", async () => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(null);
    expect((await updateRoute(request("PATCH", { comment: "x" }), periodParams)).status).toBe(404);
  });

  it("409 avec la liste des trajets quand les nouvelles dates les recouvrent", async () => {
    db.trip.findMany.mockImplementation(
      findManyIn([
        makeTrip({
          id: "trip-9",
          departureTime: at(21),
          estimatedArrivalTime: at(23),
          originCampus: { name: "Le Havre" },
          destinationCampus: { name: "Caen" },
        }),
      ])
    );
    const response = await updateRoute(request("PATCH", { endsAt: at(30).toISOString() }), periodParams);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("UNAVAILABILITY_TRIPS_CONFLICT");
    expect(body.conflictingTrips.map((t: { id: string }) => t.id)).toEqual(["trip-9"]);
    expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/unavailabilities/[id]", () => {
  it("supprime la période (200) et écrit l'audit", async () => {
    const response = await deleteRoute(request("DELETE"), periodParams);
    expect(response.status).toBe(200);
    expect(db.vehicleUnavailability.delete).toHaveBeenCalledWith({ where: { id: "unavailability-1" } });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "VEHICLE_UNAVAILABILITY_DELETED", entityId: "vehicle-1" }),
    });
  });

  it("404 pour une période inconnue", async () => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(null);
    const response = await deleteRoute(request("DELETE"), periodParams);
    expect(response.status).toBe(404);
    expect(db.vehicleUnavailability.delete).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// GET /api/vehicles/[id] — le calendrier lit les périodes (D67)
// ══════════════════════════════════════════════

describe("GET /api/vehicles/[id] : périodes du véhicule", () => {
  const vehicle = { id: "vehicle-1", name: "Zoé", licensePlate: "AB-123-CD", seats: 5, defaultCampus: { name: "Le Havre" } };

  beforeEach(() => {
    db.vehicle.findUnique.mockResolvedValue(vehicle);
    db.vehicleUnavailability.findMany.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      const row = makeUnavailability({ startsAt: at(10), endsAt: at(20), comment: "Frein HS" }) as Record<string, unknown>;
      // Prisma ne rend que les colonnes demandées
      return [Object.fromEntries(Object.entries(row).filter(([key]) => select[key]))];
    });
  });

  const get = () => getVehicleRoute(new NextRequest("http://localhost:3002/api/vehicles/vehicle-1"), vehicleParams);

  it("un utilisateur reçoit le motif et les dates, jamais le commentaire ni l'auteur (D67)", async () => {
    signedInAs(false);
    const body = await (await get()).json();
    expect(body.unavailabilities).toEqual([
      { id: "unavailability-1", reason: "MAINTENANCE", startsAt: at(10).toISOString(), endsAt: at(20).toISOString() },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/Frein HS|admin@em-normandie\.fr/);
  });

  it("un admin reçoit aussi le commentaire", async () => {
    signedInAs(true);
    const body = await (await get()).json();
    expect(body.unavailabilities[0]).toMatchObject({ comment: "Frein HS" });
  });

  it("401 sans session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });
});

// ══════════════════════════════════════════════
// Routes véhicule : plus de statut (D59)
// ══════════════════════════════════════════════

describe("le statut d'un véhicule ne s'écrit plus (D59)", () => {
  it("PATCH /api/admin/vehicles/[id] refuse status, sans rien écrire : la maintenance est une période", async () => {
    db.vehicle.findUnique.mockResolvedValue({ id: "vehicle-1", name: "Zoé" });
    const response = await updateVehicleRoute(request("PATCH", { status: "MAINTENANCE" }), vehicleParams);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message).toMatch(/indisponibilit/i);
    expect(db.vehicle.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/admin/vehicles/[id] n'envoie jamais de statut à la base, et l'audit reste VEHICLE_UPDATED", async () => {
    db.vehicle.findUnique.mockResolvedValue({ id: "vehicle-1", name: "Zoé" });
    db.vehicle.update.mockResolvedValue({ id: "vehicle-1", name: "Zoé 2" });
    const response = await updateVehicleRoute(request("PATCH", { name: "Zoé 2" }), vehicleParams);
    expect(response.status).toBe(200);
    expect(db.vehicle.update.mock.calls[0][0].data).not.toHaveProperty("status");
    expect(db.vehicle.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "VEHICLE_UPDATED" }) });
  });

  it("POST /api/admin/vehicles refuse status et n'en écrit pas", async () => {
    const vehicle = { name: "Zoé", licensePlate: "AB-123-CD", seats: 5, defaultCampusId: "c1" };
    expect((await createVehicleRoute(request("POST", { ...vehicle, status: "MAINTENANCE" }))).status).toBe(400);
    expect(db.vehicle.create).not.toHaveBeenCalled();

    db.vehicle.create.mockResolvedValue({ id: "vehicle-2", ...vehicle });
    expect((await createVehicleRoute(request("POST", vehicle))).status).toBe(201);
    expect(db.vehicle.create.mock.calls[0][0].data).not.toHaveProperty("status");
  });
});
