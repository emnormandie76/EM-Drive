// tests/unavailability-service.test.ts — Création, modification et retrait d'une période (D58, D60, D68)
// Une période ne se déclare pas sur un créneau où des trajets sont réservés : 409 avec leur liste (D60).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/services/audit-service", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit-service";
import {
  createUnavailability,
  deleteUnavailability,
  listVehicleUnavailabilities,
  updateUnavailability,
} from "@/lib/services/unavailability-service";
import {
  NotFoundError,
  UnavailabilityOverlapError,
  UnavailabilityTripsConflictError,
  ValidationError,
} from "@/lib/utils/errors";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { findManyIn } from "./helpers/where-matcher";
import { makeTrip, makeUnavailability, makeVehicle } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;

const NOW = new Date("2030-01-01T00:00:00.000Z");
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600_000);
const actor = { sub: "admin-id", email: "admin@em-normandie.fr" };

/** Un trajet réservé, avec les noms de campus que la liste des conflits affiche. */
const bookedTrip = (overrides: Record<string, unknown> = {}) =>
  makeTrip({
    originCampus: { name: "Le Havre" },
    destinationCampus: { name: "Caen" },
    ...overrides,
  });

const tripsOnVehicle = (...rows: Record<string, unknown>[]) => db.trip.findMany.mockImplementation(findManyIn(rows));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetPrismaMock(db);
  vi.mocked(logAudit).mockReset();
  db.vehicle.findUnique.mockResolvedValue(makeVehicle());
  db.trip.findMany.mockResolvedValue([]);
  db.vehicleUnavailability.findMany.mockResolvedValue([]); // aucune autre période
  db.appSetting.findUnique.mockResolvedValue(null); // buffer : 30 min
  db.vehicleUnavailability.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "unavailability-new",
    ...data,
  }));
  db.vehicleUnavailability.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...makeUnavailability(),
    ...data,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

// ══════════════════════════════════════════════
// Création
// ══════════════════════════════════════════════

describe("createUnavailability", () => {
  const maintenanceInput = { vehicleId: "vehicle-1", reason: "MAINTENANCE" as const, startsAt: at(10), endsAt: at(20) };

  it("crée la période, signée de l'admin", async () => {
    const created = await createUnavailability({ ...maintenanceInput, comment: "Révision" }, actor);
    expect(db.vehicleUnavailability.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vehicleId: "vehicle-1",
        reason: "MAINTENANCE",
        startsAt: at(10),
        endsAt: at(20),
        comment: "Révision",
        createdBySub: "admin-id",
        createdByEmail: "admin@em-normandie.fr",
      }),
    });
    expect(created.id).toBe("unavailability-new");
  });

  it("écrit l'audit VEHICLE_UNAVAILABILITY_CREATED sur le véhicule", async () => {
    await createUnavailability(maintenanceInput, actor);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userSub: "admin-id",
        userEmail: "admin@em-normandie.fr",
        action: "VEHICLE_UNAVAILABILITY_CREATED",
        entityType: "vehicle",
        entityId: "vehicle-1",
        details: expect.objectContaining({ unavailabilityId: "unavailability-new", reason: "MAINTENANCE" }),
      })
    );
  });

  it("accepte une maintenance sans date de fin (panne de durée inconnue, D59)", async () => {
    await createUnavailability({ ...maintenanceInput, endsAt: null }, actor);
    expect(db.vehicleUnavailability.create).toHaveBeenCalledWith({ data: expect.objectContaining({ endsAt: null }) });
  });

  it("refuse une réservation Car Booking sans date de fin", async () => {
    await expect(
      createUnavailability({ ...maintenanceInput, reason: "CAR_BOOKING", endsAt: null }, actor)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("refuse une fin qui ne suit pas le début, égale ou avant", async () => {
    await expect(createUnavailability({ ...maintenanceInput, endsAt: at(10) }, actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(createUnavailability({ ...maintenanceInput, endsAt: at(9) }, actor)).rejects.toBeInstanceOf(ValidationError);
    expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
  });

  it("refuse un véhicule inconnu (404)", async () => {
    db.vehicle.findUnique.mockResolvedValue(null);
    const error = await createUnavailability(maintenanceInput, actor).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.statusCode).toBe(404);
    expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
  });

  it("s'écrit dans une transaction sérialisée, pour ne pas croiser une réservation concurrente", async () => {
    await createUnavailability(maintenanceInput, actor);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });

  it("le commentaire vide est enregistré comme absent", async () => {
    await createUnavailability({ ...maintenanceInput, comment: "   " }, actor);
    expect(db.vehicleUnavailability.create).toHaveBeenCalledWith({ data: expect.objectContaining({ comment: null }) });
  });
});

// ══════════════════════════════════════════════
// Conflits avec les trajets (D60)
// ══════════════════════════════════════════════

describe("trajets en conflit : 409 avec leur liste (D60)", () => {
  const input = { vehicleId: "vehicle-1", reason: "CAR_BOOKING" as const, startsAt: at(10), endsAt: at(20) };
  const create = (overrides: Record<string, unknown> = {}) => createUnavailability({ ...input, ...overrides }, actor);
  /** Un aller simple du véhicule 1, de `from` à `to` heures. */
  const trip = (id: string, from: number, to: number, overrides: Record<string, unknown> = {}) =>
    bookedTrip({ id, departureTime: at(from), estimatedArrivalTime: at(to), ...overrides });

  it("refuse et liste le trajet qui roule pendant la période", async () => {
    tripsOnVehicle(trip("trip-9", 12, 14, { driverDisplayName: "Marie Curie" }));
    const error = await create().catch((e) => e);
    expect(error).toBeInstanceOf(UnavailabilityTripsConflictError);
    expect(error).toMatchObject({ code: "UNAVAILABILITY_TRIPS_CONFLICT", statusCode: 409 });
    expect(error.conflictingTrips).toEqual([
      expect.objectContaining({
        id: "trip-9",
        departureTime: at(12),
        endTime: at(14),
        driverDisplayName: "Marie Curie",
        origin: "Le Havre",
        destination: "Caen",
      }),
    ]);
    expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("le corps de l'erreur porte la liste, pour l'écran", async () => {
    tripsOnVehicle(trip("trip-9", 12, 14), trip("trip-10", 15, 16));
    const error = await create().catch((e) => e);
    const body = error.toJSON();
    expect(body.error).toBe("UNAVAILABILITY_TRIPS_CONFLICT");
    expect(body.conflictingTrips.map((t: { id: string }) => t.id)).toEqual(["trip-9", "trip-10"]);
  });

  it("deux créneaux qui se touchent ne sont pas en conflit : trajet qui finit quand la période commence, buffer compris", async () => {
    tripsOnVehicle(trip("trip-9", 7, 9.5)); // 9 h 30 + 30 min de buffer = 10 h pile
    await expect(create()).resolves.toBeDefined();
  });

  it("le buffer compte : un trajet qui finit 15 minutes avant le début est en conflit", async () => {
    tripsOnVehicle(trip("trip-9", 7, 9.75));
    await expect(create()).rejects.toBeInstanceOf(UnavailabilityTripsConflictError);
  });

  it("un trajet qui part quand la période finit n'est pas en conflit", async () => {
    tripsOnVehicle(trip("trip-9", 20, 22));
    await expect(create()).resolves.toBeDefined();
  });

  it("une période sans fin est en conflit avec tout trajet qui finit plus tard", async () => {
    tripsOnVehicle(trip("trip-9", 900, 902));
    await expect(create({ reason: "MAINTENANCE", endsAt: null })).rejects.toBeInstanceOf(UnavailabilityTripsConflictError);
  });

  it("un aller-retour se juge sur l'arrivée de son retour", async () => {
    tripsOnVehicle(
      trip("trip-9", 2, 4, { type: "ROUND_TRIP", returnDepartureTime: at(11), estimatedReturnArrivalTime: at(13) })
    );
    const error = await create().catch((e) => e);
    expect(error.conflictingTrips[0]).toMatchObject({ id: "trip-9", endTime: at(13) });
  });

  it("ignore un trajet annulé et celui d'un autre véhicule", async () => {
    tripsOnVehicle(trip("trip-9", 12, 14, { status: "CANCELLED" }), trip("trip-10", 12, 14, { vehicleId: "vehicle-2" }));
    await expect(create()).resolves.toBeDefined();
  });

  it("ignore un trajet déjà fini : on ne le déplace plus (une panne peut dater d'hier)", async () => {
    tripsOnVehicle(trip("trip-9", -30, -28));
    await expect(create({ reason: "MAINTENANCE", startsAt: at(-48), endsAt: null })).resolves.toBeDefined();
  });

  it("liste un trajet en cours quand la période a commencé avant lui", async () => {
    tripsOnVehicle(trip("trip-9", -1, 2));
    await expect(create({ reason: "MAINTENANCE", startsAt: at(-5), endsAt: null })).rejects.toBeInstanceOf(
      UnavailabilityTripsConflictError
    );
  });
});

// ══════════════════════════════════════════════
// Chevauchement entre périodes d'un même véhicule (D70)
// ══════════════════════════════════════════════

describe("deux périodes d'un même véhicule ne se chevauchent pas (D70)", () => {
  const input = { vehicleId: "vehicle-1", reason: "MAINTENANCE" as const, startsAt: at(10), endsAt: at(20) };
  /** Une période déjà enregistrée, du véhicule 1. */
  const existing = (id: string, from: number, to: number | null, overrides: Record<string, unknown> = {}) =>
    makeUnavailability({ id, startsAt: at(from), endsAt: to === null ? null : at(to), ...overrides });
  const others = (...rows: Record<string, unknown>[]) => db.vehicleUnavailability.findMany.mockImplementation(findManyIn(rows));
  const create = (overrides: Record<string, unknown> = {}) => createUnavailability({ ...input, ...overrides }, actor);

  it("refuse une maintenance qui en chevauche une autre, avec la liste des périodes en cause", async () => {
    others(existing("u-1", 15, 25, { comment: "Ne doit pas fuiter" }));
    const error = await create().catch((e) => e);
    expect(error).toBeInstanceOf(UnavailabilityOverlapError);
    expect(error).toMatchObject({ code: "UNAVAILABILITY_OVERLAP", statusCode: 409 });
    expect(error.overlappingPeriods).toEqual([{ id: "u-1", reason: "MAINTENANCE", startsAt: at(15), endsAt: at(25) }]);
    expect(db.vehicleUnavailability.create).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("le corps de l'erreur porte la liste, sans commentaire ni auteur", async () => {
    others(existing("u-1", 15, 25, { comment: "Ne doit pas fuiter" }));
    const body = (await create().catch((e) => e)).toJSON();
    expect(body.error).toBe("UNAVAILABILITY_OVERLAP");
    expect(body.overlappingPeriods).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/Ne doit pas fuiter|admin@em-normandie/);
  });

  it("refuse une réservation Car Booking sur une maintenance, et une maintenance sur une réservation Car Booking", async () => {
    others(existing("u-1", 15, 25));
    await expect(create({ reason: "CAR_BOOKING" })).rejects.toBeInstanceOf(UnavailabilityOverlapError);
    others(existing("u-2", 15, 25, { reason: "CAR_BOOKING" }));
    await expect(create({ reason: "MAINTENANCE" })).rejects.toBeInstanceOf(UnavailabilityOverlapError);
  });

  it("accepte deux périodes qui se touchent, dans un sens comme dans l'autre", async () => {
    others(existing("u-1", 20, 30), existing("u-2", 0, 10));
    await expect(create()).resolves.toBeDefined();
  });

  it("une milliseconde de recouvrement suffit", async () => {
    others(existing("u-1", 20, 30));
    await expect(create({ endsAt: new Date(at(20).getTime() + 1) })).rejects.toBeInstanceOf(UnavailabilityOverlapError);
  });

  it("une période sans fin chevauche toute période qui commence plus tard, et inversement", async () => {
    others(existing("u-1", 5, null));
    await expect(create({ startsAt: at(900), endsAt: at(950) })).rejects.toBeInstanceOf(UnavailabilityOverlapError);
    others(existing("u-2", 900, 950));
    await expect(create({ startsAt: at(10), endsAt: null })).rejects.toBeInstanceOf(UnavailabilityOverlapError);
  });

  it("une période sans fin qui commence quand une autre finit ne la chevauche pas", async () => {
    others(existing("u-1", 0, 10));
    await expect(create({ endsAt: null })).resolves.toBeDefined();
  });

  it("ne regarde que les périodes du même véhicule", async () => {
    others(existing("u-1", 5, 25, { vehicleId: "vehicle-2" }));
    await expect(create()).resolves.toBeDefined();
  });

  it("refuse avant de regarder les trajets : le chevauchement de périodes est le premier contrôle", async () => {
    others(existing("u-1", 15, 25));
    tripsOnVehicle(bookedTrip({ id: "trip-9", departureTime: at(12), estimatedArrivalTime: at(14) }));
    await expect(create()).rejects.toBeInstanceOf(UnavailabilityOverlapError);
  });

  it("à la modification, la période ne se chevauche pas elle-même", async () => {
    const self = existing("unavailability-1", 10, 20);
    db.vehicleUnavailability.findUnique.mockResolvedValue(self);
    others(self);
    await expect(updateUnavailability("unavailability-1", { endsAt: at(22) }, actor)).resolves.toBeDefined();
    // La requête l'écarte par son identifiant
    const where = (db.vehicleUnavailability.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.id).toEqual({ not: "unavailability-1" });
  });

  it("à la modification, refuse un chevauchement avec une autre période", async () => {
    const self = existing("unavailability-1", 10, 20);
    db.vehicleUnavailability.findUnique.mockResolvedValue(self);
    others(self, existing("u-2", 25, 30, { reason: "CAR_BOOKING" }));
    const error = await updateUnavailability("unavailability-1", { endsAt: at(27) }, actor).catch((e) => e);
    expect(error).toBeInstanceOf(UnavailabilityOverlapError);
    expect(error.overlappingPeriods.map((p: { id: string }) => p.id)).toEqual(["u-2"]);
    expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
  });

  it("à la modification, raccourcir jusqu'au début d'une autre période est permis (elles se touchent)", async () => {
    const self = existing("unavailability-1", 10, 20);
    db.vehicleUnavailability.findUnique.mockResolvedValue(self);
    others(self, existing("u-2", 25, 30));
    await expect(updateUnavailability("unavailability-1", { endsAt: at(25) }, actor)).resolves.toBeDefined();
  });
});

// ══════════════════════════════════════════════
// Modification (D68)
// ══════════════════════════════════════════════

describe("updateUnavailability", () => {
  const stored = () => makeUnavailability({ reason: "CAR_BOOKING", startsAt: at(10), endsAt: at(20), comment: "Salon" });

  beforeEach(() => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(stored());
  });

  it("modifie les dates, le motif et le commentaire, et rend la période", async () => {
    const updated = await updateUnavailability(
      "unavailability-1",
      { reason: "MAINTENANCE", startsAt: at(11), endsAt: null, comment: "Panne" },
      actor
    );
    expect(db.vehicleUnavailability.update).toHaveBeenCalledWith({
      where: { id: "unavailability-1" },
      data: { reason: "MAINTENANCE", startsAt: at(11), endsAt: null, comment: "Panne" },
    });
    expect(updated).toMatchObject({ reason: "MAINTENANCE", comment: "Panne" });
  });

  it("un champ absent reste tel quel", async () => {
    await updateUnavailability("unavailability-1", { comment: "Autre salle" }, actor);
    expect(db.vehicleUnavailability.update).toHaveBeenCalledWith({
      where: { id: "unavailability-1" },
      data: { comment: "Autre salle" },
    });
  });

  it("un commentaire à null l'efface", async () => {
    await updateUnavailability("unavailability-1", { comment: null }, actor);
    expect(db.vehicleUnavailability.update).toHaveBeenCalledWith({
      where: { id: "unavailability-1" },
      data: { comment: null },
    });
  });

  it("applique à la période fusionnée les mêmes règles qu'à la création : Car Booking exige une fin", async () => {
    await expect(updateUnavailability("unavailability-1", { endsAt: null }, actor)).rejects.toBeInstanceOf(ValidationError);
    expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
  });

  it("passer une maintenance sans fin en Car Booking exige une fin", async () => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(makeUnavailability({ endsAt: null }));
    await expect(updateUnavailability("unavailability-1", { reason: "CAR_BOOKING" }, actor)).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      updateUnavailability("unavailability-1", { reason: "CAR_BOOKING", endsAt: at(30) }, actor)
    ).resolves.toBeDefined();
  });

  it("refuse une fin qui ne suit pas le début", async () => {
    await expect(updateUnavailability("unavailability-1", { startsAt: at(25) }, actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateUnavailability("unavailability-1", { endsAt: at(10) }, actor)).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuse une période inconnue (404)", async () => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(null);
    const error = await updateUnavailability("nope", { comment: "x" }, actor).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
  });

  it("revérifie les trajets sur la nouvelle période : 409 avec leur liste", async () => {
    tripsOnVehicle(bookedTrip({ id: "trip-9", departureTime: at(21), estimatedArrivalTime: at(23) }));
    const error = await updateUnavailability("unavailability-1", { endsAt: at(30) }, actor).catch((e) => e);
    expect(error).toBeInstanceOf(UnavailabilityTripsConflictError);
    expect(error.conflictingTrips.map((t: { id: string }) => t.id)).toEqual(["trip-9"]);
    expect(db.vehicleUnavailability.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("deux créneaux qui se touchent : raccourcir jusqu'au départ d'un trajet est permis", async () => {
    tripsOnVehicle(bookedTrip({ id: "trip-9", departureTime: at(20), estimatedArrivalTime: at(22) }));
    await expect(updateUnavailability("unavailability-1", { endsAt: at(20) }, actor)).resolves.toBeDefined();
  });

  it("écrit l'audit VEHICLE_UNAVAILABILITY_UPDATED avec l'avant et l'après", async () => {
    await updateUnavailability("unavailability-1", { endsAt: at(22), comment: "Rallongé" }, actor);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userSub: "admin-id",
        action: "VEHICLE_UNAVAILABILITY_UPDATED",
        entityType: "vehicle",
        entityId: "vehicle-1",
        details: expect.objectContaining({
          unavailabilityId: "unavailability-1",
          before: expect.objectContaining({ endsAt: at(20).toISOString() }),
          after: expect.objectContaining({ endsAt: at(22).toISOString() }),
        }),
      })
    );
  });

  it("s'écrit dans une transaction sérialisée", async () => {
    await updateUnavailability("unavailability-1", { comment: "x" }, actor);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
});

// ══════════════════════════════════════════════
// Suppression
// ══════════════════════════════════════════════

describe("deleteUnavailability", () => {
  beforeEach(() => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(
      makeUnavailability({ startsAt: at(10), endsAt: at(20), comment: "Révision" })
    );
  });

  it("supprime la période et écrit l'audit VEHICLE_UNAVAILABILITY_DELETED", async () => {
    await deleteUnavailability("unavailability-1", actor);
    expect(db.vehicleUnavailability.delete).toHaveBeenCalledWith({ where: { id: "unavailability-1" } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VEHICLE_UNAVAILABILITY_DELETED",
        entityType: "vehicle",
        entityId: "vehicle-1",
        details: expect.objectContaining({ unavailabilityId: "unavailability-1", reason: "MAINTENANCE" }),
      })
    );
  });

  it("refuse une période inconnue (404), sans audit", async () => {
    db.vehicleUnavailability.findUnique.mockResolvedValue(null);
    await expect(deleteUnavailability("nope", actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.vehicleUnavailability.delete).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// Liste
// ══════════════════════════════════════════════

describe("listVehicleUnavailabilities", () => {
  const rows = [
    makeUnavailability({ id: "past", startsAt: at(-50), endsAt: at(-10), comment: "Passée" }),
    makeUnavailability({ id: "current", startsAt: at(-5), endsAt: at(5), comment: "En cours" }),
    makeUnavailability({ id: "open", startsAt: at(-1), endsAt: null, comment: "Sans fin" }),
    makeUnavailability({ id: "future", startsAt: at(50), endsAt: at(60), comment: "À venir" }),
    makeUnavailability({ id: "other", vehicleId: "vehicle-2", startsAt: at(-5), endsAt: at(5) }),
  ];

  beforeEach(() => {
    db.vehicleUnavailability.findMany.mockImplementation(findManyIn(rows));
  });

  it("rend les périodes en cours et à venir du véhicule, pas les terminées", async () => {
    const list = await listVehicleUnavailabilities("vehicle-1", { admin: true });
    expect(list.map((p) => p.id).sort()).toEqual(["current", "future", "open"]);
  });

  it("trie par début", async () => {
    await listVehicleUnavailabilities("vehicle-1", { admin: true });
    expect(db.vehicleUnavailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { startsAt: "asc" } })
    );
  });

  it("un admin lit le commentaire et l'auteur ; un autre ne lit que le motif et les dates (D67)", async () => {
    const select = async (admin: boolean) => {
      db.vehicleUnavailability.findMany.mockClear();
      await listVehicleUnavailabilities("vehicle-1", { admin });
      return (db.vehicleUnavailability.findMany.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    };
    expect(await select(true)).toMatchObject({ comment: true, createdByEmail: true });
    const publicSelect = await select(false);
    expect(publicSelect).toMatchObject({ id: true, reason: true, startsAt: true, endsAt: true });
    expect(publicSelect).not.toHaveProperty("comment");
    expect(publicSelect).not.toHaveProperty("createdByEmail");
    expect(publicSelect).not.toHaveProperty("createdBySub");
  });

  it("refuse un véhicule inconnu (404)", async () => {
    db.vehicle.findUnique.mockResolvedValue(null);
    await expect(listVehicleUnavailabilities("nope", { admin: true })).rejects.toBeInstanceOf(NotFoundError);
  });
});
