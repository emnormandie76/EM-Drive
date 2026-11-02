// tests/vehicle-unavailability.test.ts — Indisponibilités datées : le contrôle commun (D58, D59, D62, D66)
// `findVehicleUnavailability` est l'unique lecteur des périodes ; la recherche, la création, les changements
// d'horaire et la modification admin passent par `assertVehicleBookable`. Les bornes se vérifient en rejouant
// la clause `where` sur de vraies dates (tests/helpers/where-matcher.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/services/audit-service", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  assertVehicleBookable,
  findVehicleUnavailability,
  getAllVehiclesWithPositions,
  getAvailableVehicles,
} from "@/lib/services/vehicle-service";
import { createTrip, updateTripInfo, updateTripTimes, type CreateTripInput } from "@/lib/services/trip-service";
import { VehicleUnavailableError } from "@/lib/utils/errors";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { findFirstIn, findManyIn } from "./helpers/where-matcher";
import { DRIVER, OTHER, makeTrip, makeUnavailability, makeVehicle } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;

// Une heure fixe, pour que « maintenant » et les périodes se comparent sans dérive
const NOW = new Date("2030-01-01T00:00:00.000Z");
/** L'instant `hours` heures après NOW (décimales permises : 0.5 = 30 minutes). */
const at = (hours: number) => new Date(NOW.getTime() + hours * 3600_000);

/** Une période du véhicule 1, de la 10e à la 20e heure. */
const maintenance = (overrides: Record<string, unknown> = {}) =>
  makeUnavailability({ startsAt: at(10), endsAt: at(20), ...overrides });

const periods = (...rows: Record<string, unknown>[]) =>
  db.vehicleUnavailability.findFirst.mockImplementation(findFirstIn(rows));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetPrismaMock(db);
  db.trip.findFirst.mockResolvedValue(null); // aucun conflit, aucun trajet antérieur
  db.vehicle.findUniqueOrThrow.mockResolvedValue(makeVehicle()); // rattaché à campus-1
  db.vehicleUnavailability.findFirst.mockResolvedValue(null);
  db.vehicleUnavailability.findMany.mockResolvedValue([]);
  db.appSetting.findUnique.mockResolvedValue(null); // buffer par défaut : 30 min
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// findVehicleUnavailability — bornes [début, fin)
// ══════════════════════════════════════════════

describe("findVehicleUnavailability : bornes (piège 4)", () => {
  const find = (start: number, end: number, vehicleId = "vehicle-1") =>
    findVehicleUnavailability(vehicleId, at(start), at(end));

  it("rend la période qui chevauche le créneau", async () => {
    periods(maintenance());
    await expect(find(9, 11)).resolves.toMatchObject({ id: "unavailability-1", reason: "MAINTENANCE" });
    await expect(find(12, 14)).resolves.not.toBeNull(); // créneau dans la période
    await expect(find(5, 30)).resolves.not.toBeNull(); // période dans le créneau
  });

  it("un créneau qui finit quand la période commence ne la chevauche pas", async () => {
    periods(maintenance());
    await expect(find(8, 10)).resolves.toBeNull();
  });

  it("un créneau qui commence quand la période finit ne la chevauche pas", async () => {
    periods(maintenance());
    await expect(find(20, 22)).resolves.toBeNull();
  });

  it("une milliseconde de recouvrement suffit", async () => {
    periods(maintenance());
    await expect(findVehicleUnavailability("vehicle-1", at(8), new Date(at(10).getTime() + 1))).resolves.not.toBeNull();
    await expect(findVehicleUnavailability("vehicle-1", new Date(at(20).getTime() - 1), at(22))).resolves.not.toBeNull();
  });

  it("une période sans fin chevauche tout créneau qui finit après son début", async () => {
    periods(maintenance({ endsAt: null }));
    await expect(find(1000, 1002)).resolves.not.toBeNull();
    await expect(find(9, 11)).resolves.not.toBeNull();
    await expect(find(8, 10)).resolves.toBeNull(); // touche le début : pas de conflit
  });

  it("ne regarde que le véhicule demandé", async () => {
    periods(maintenance({ vehicleId: "vehicle-2" }));
    await expect(find(12, 14)).resolves.toBeNull();
    await expect(find(12, 14, "vehicle-2")).resolves.not.toBeNull();
  });
});

// ══════════════════════════════════════════════
// assertVehicleBookable — la période remplace vehicle.status
// ══════════════════════════════════════════════

describe("assertVehicleBookable : indisponibilités (D59, D62)", () => {
  const assertSlot = (start: number, end: number) => assertVehicleBookable("vehicle-1", "campus-1", at(start), at(end));

  it("refuse un créneau qui chevauche une maintenance, avec son motif", async () => {
    periods(maintenance());
    const error = await assertSlot(9, 11).catch((e) => e);
    expect(error).toBeInstanceOf(VehicleUnavailableError);
    expect(error).toMatchObject({ code: "VEHICLE_UNAVAILABLE", statusCode: 409 });
    expect(error.message).toMatch(/maintenance/i);
  });

  it("refuse un créneau qui chevauche une réservation Car Booking, avec son motif", async () => {
    periods(maintenance({ reason: "CAR_BOOKING" }));
    const error = await assertSlot(9, 11).catch((e) => e);
    expect(error).toBeInstanceOf(VehicleUnavailableError);
    expect(error.message).toMatch(/car booking/i);
  });

  it("accepte deux créneaux qui se touchent", async () => {
    periods(maintenance());
    await expect(assertSlot(8, 10)).resolves.toBeUndefined();
    await expect(assertSlot(20, 22)).resolves.toBeUndefined();
  });

  it("accepte le créneau d'un véhicule dont la colonne status dit MAINTENANCE : seules les périodes comptent", async () => {
    db.vehicle.findUniqueOrThrow.mockResolvedValue(makeVehicle({ status: "MAINTENANCE" }));
    await expect(assertSlot(12, 14)).resolves.toBeUndefined();
  });

  it("refuse tout créneau après le début d'une maintenance sans fin", async () => {
    periods(maintenance({ endsAt: null }));
    await expect(assertSlot(500, 502)).rejects.toBeInstanceOf(VehicleUnavailableError);
  });

  it("lit les périodes dans la transaction qu'on lui passe", async () => {
    const tx = { ...db, vehicleUnavailability: { findFirst: vi.fn().mockResolvedValue(null) } };
    await assertVehicleBookable("vehicle-1", "campus-1", at(12), at(14), tx as never);
    expect(tx.vehicleUnavailability.findFirst).toHaveBeenCalledOnce();
    expect(db.vehicleUnavailability.findFirst).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// Appelants : création, changement d'horaire, modification admin
// ══════════════════════════════════════════════

describe("les écritures de trajets respectent les périodes", () => {
  const createInput = (departure: number, arrival: number): CreateTripInput => ({
    vehicleId: "vehicle-1",
    driverSub: DRIVER,
    driverEmail: "d@em-normandie.fr",
    driverDisplayName: "Conducteur",
    type: "ONE_WAY",
    originCampusId: "campus-1",
    destinationCampusId: "campus-2",
    departureTime: at(departure),
    estimatedArrivalTime: at(arrival),
  });

  beforeEach(() => {
    db.trip.create.mockResolvedValue({ id: "trip-1" });
  });

  it("createTrip refuse un trajet qui roule pendant une période", async () => {
    periods(maintenance({ reason: "CAR_BOOKING" }));
    await expect(createTrip(createInput(8, 12))).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("createTrip compte le buffer : un trajet qui finit 15 minutes avant la période la chevauche (30 min de buffer)", async () => {
    periods(maintenance());
    await expect(createTrip(createInput(7, 9.75))).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("createTrip accepte un trajet dont l'arrivée plus le buffer touche le début de la période", async () => {
    periods(maintenance());
    await createTrip(createInput(7, 9.5)); // 9 h 30 + 30 min = 10 h pile
    expect(db.trip.create).toHaveBeenCalledOnce();
  });

  it("createTrip accepte un trajet qui part quand la période finit", async () => {
    periods(maintenance());
    await createTrip(createInput(20, 22));
    expect(db.trip.create).toHaveBeenCalledOnce();
  });

  it("createTrip juge un aller-retour sur toute sa durée, retour compris", async () => {
    periods(maintenance({ startsAt: at(30), endsAt: at(40) }));
    await expect(
      createTrip({
        ...createInput(5, 7),
        type: "ROUND_TRIP",
        returnCampusId: "campus-1",
        returnDepartureTime: at(29),
        estimatedReturnArrivalTime: at(31),
      })
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
  });

  it("updateTripTimes refuse un nouvel horaire pendant une période, buffer compris", async () => {
    // Trajet de 2 h : départ 5 h → nouveau départ 8 h, arrivée 10 h, + 30 min : touche 10 h 30
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(5), estimatedArrivalTime: at(7) }));
    periods(maintenance({ startsAt: at(10.25), endsAt: at(20) }));
    await expect(
      updateTripTimes("trip-1", { departureTime: at(8) }, DRIVER, "d@em-normandie.fr", false)
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("updateTripTimes accepte un nouvel horaire qui touche la période", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(5), estimatedArrivalTime: at(7) }));
    periods(maintenance({ startsAt: at(10.5), endsAt: at(20) }));
    await updateTripTimes("trip-1", { departureTime: at(8) }, DRIVER, "d@em-normandie.fr", false);
    expect(db.trip.update).toHaveBeenCalledOnce();
  });

  it("updateTripInfo refuse qu'un admin déplace un trajet pendant une période", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(50), estimatedArrivalTime: at(52) }));
    periods(maintenance());
    await expect(
      updateTripInfo("trip-1", { departureTime: at(11), estimatedArrivalTime: at(13) }, OTHER, "a@em-normandie.fr", true)
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("updateTripInfo refuse qu'un admin rallonge un trajet jusque dans une période (l'arrivée seule change)", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(5), estimatedArrivalTime: at(7) }));
    periods(maintenance());
    await expect(
      updateTripInfo("trip-1", { estimatedArrivalTime: at(12) }, OTHER, "a@em-normandie.fr", true)
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("updateTripInfo laisse un admin annuler ou commenter un trajet qui chevauche une période", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(11), estimatedArrivalTime: at(13) }));
    periods(maintenance());
    await updateTripInfo("trip-1", { comment: "Clés à l'accueil" }, OTHER, "a@em-normandie.fr", true);
    await updateTripInfo("trip-1", { status: "CANCELLED" }, OTHER, "a@em-normandie.fr", true);
    expect(db.trip.update).toHaveBeenCalledTimes(2);
  });
});

// ══════════════════════════════════════════════
// Recherche : getAvailableVehicles
// ══════════════════════════════════════════════

describe("getAvailableVehicles : indisponibilités (D59)", () => {
  const query = (departure: number, arrival: number) => ({
    originCampusId: "campus-1",
    departureTime: at(departure),
    estimatedArrivalTime: at(arrival),
  });

  beforeEach(() => {
    db.vehicle.findMany.mockResolvedValue([
      { id: "vehicle-1", name: "Zoé", licensePlate: "AB-123-CD", seats: 5 },
      { id: "vehicle-2", name: "C3", licensePlate: "EF-456-GH", seats: 5 },
    ]);
    db.vehicle.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) =>
      makeVehicle({ id: where.id })
    );
  });

  it("ne filtre plus sur la colonne status : tous les véhicules sont examinés", async () => {
    await getAvailableVehicles(query(12, 14));
    const args = db.vehicle.findMany.mock.calls[0][0] as { where?: Record<string, unknown> } | undefined;
    expect(args?.where ?? {}).not.toHaveProperty("status");
  });

  it("écarte un véhicule dont une période chevauche le créneau, et garde les autres", async () => {
    periods(maintenance({ vehicleId: "vehicle-2", reason: "CAR_BOOKING" }));
    const found = await getAvailableVehicles(query(12, 14));
    expect(found.map((v) => v.id)).toEqual(["vehicle-1"]);
  });

  it("garde un véhicule dont la période touche le créneau", async () => {
    periods(maintenance({ vehicleId: "vehicle-2" }));
    const found = await getAvailableVehicles(query(18, 20)); // finit à 20 h + 30 min de buffer : chevauche
    expect(found.map((v) => v.id)).toEqual(["vehicle-1"]);
    const touching = await getAvailableVehicles(query(7, 9.5)); // 9 h 30 + 30 min = 10 h pile
    expect(touching.map((v) => v.id)).toEqual(["vehicle-1", "vehicle-2"]);
  });

  it("compte le buffer d'un aller-retour sur son retour", async () => {
    periods(maintenance({ vehicleId: "vehicle-1", startsAt: at(40), endsAt: at(50) }));
    const found = await getAvailableVehicles({
      ...query(5, 7),
      returnDepartureTime: at(38),
      estimatedReturnArrivalTime: at(40),
    });
    expect(found.map((v) => v.id)).toEqual(["vehicle-2"]);
  });

  it("garde un véhicule dont la colonne status dit MAINTENANCE mais qui n'a aucune période", async () => {
    db.vehicle.findMany.mockResolvedValue([
      { id: "vehicle-1", name: "Zoé", licensePlate: "AB-123-CD", seats: 5, status: "MAINTENANCE" },
    ]);
    expect((await getAvailableVehicles(query(12, 14))).map((v) => v.id)).toEqual(["vehicle-1"]);
  });
});

// ══════════════════════════════════════════════
// Tableau de bord : getAllVehiclesWithPositions
// ══════════════════════════════════════════════

describe("getAllVehiclesWithPositions : statut tiré des périodes en cours (D67, D69)", () => {
  const campus = { id: "campus-1", name: "Le Havre" };
  const vehicle = { id: "vehicle-1", name: "Zoé", licensePlate: "AB-123-CD", seats: 5, defaultCampusId: "campus-1", defaultCampus: campus };

  const withPeriods = (...rows: Record<string, unknown>[]) => {
    db.vehicleUnavailability.findMany.mockImplementation(findManyIn(rows));
    return getAllVehiclesWithPositions();
  };

  beforeEach(() => {
    db.vehicle.findMany.mockResolvedValue([vehicle]);
    db.campus.findUniqueOrThrow.mockResolvedValue(campus);
  });

  it("sans période : disponible", async () => {
    const [v] = await withPeriods();
    expect(v.displayStatus).toBe("available");
    expect(v.currentUnavailability).toBeNull();
  });

  it("maintenance en cours : « maintenance »", async () => {
    const [v] = await withPeriods(maintenance({ startsAt: at(-1), endsAt: at(5) }));
    expect(v.displayStatus).toBe("maintenance");
  });

  it("réservation Car Booking en cours : « car_booking » (D69)", async () => {
    const [v] = await withPeriods(maintenance({ reason: "CAR_BOOKING", startsAt: at(-1), endsAt: at(5) }));
    expect(v.displayStatus).toBe("car_booking");
  });

  it("maintenance sans fin : en cours tant qu'elle n'est pas retirée", async () => {
    const [v] = await withPeriods(maintenance({ startsAt: at(-500), endsAt: null }));
    expect(v.displayStatus).toBe("maintenance");
  });

  it("période à venir ou terminée : disponible", async () => {
    expect((await withPeriods(maintenance({ startsAt: at(1), endsAt: at(5) })))[0].displayStatus).toBe("available");
    expect((await withPeriods(maintenance({ startsAt: at(-5), endsAt: at(-1) })))[0].displayStatus).toBe("available");
  });

  it("une période qui finit à l'instant même est terminée", async () => {
    expect((await withPeriods(maintenance({ startsAt: at(-5), endsAt: at(0) })))[0].displayStatus).toBe("available");
  });

  it("maintenance et Car Booking en même temps : la maintenance l'emporte", async () => {
    const [v] = await withPeriods(
      maintenance({ id: "u1", reason: "CAR_BOOKING", startsAt: at(-1), endsAt: at(5) }),
      maintenance({ id: "u2", reason: "MAINTENANCE", startsAt: at(-1), endsAt: at(5) })
    );
    expect(v.displayStatus).toBe("maintenance");
  });

  it("n'expose que le motif et les dates : ni commentaire ni auteur (D67)", async () => {
    const [v] = await withPeriods(
      maintenance({ startsAt: at(-1), endsAt: at(5), comment: "Frein HS", createdByEmail: "admin@em-normandie.fr" })
    );
    expect(v.currentUnavailability).toEqual({ reason: "MAINTENANCE", startsAt: at(-1), endsAt: at(5) });
    const args = db.vehicleUnavailability.findMany.mock.calls[0][0] as { select?: Record<string, unknown> };
    expect(args.select).toBeDefined();
    expect(args.select).not.toHaveProperty("comment");
    expect(args.select).not.toHaveProperty("createdByEmail");
  });

  it("une période ne déplace pas le véhicule : sa position reste celle de ses trajets (D66)", async () => {
    const [v] = await withPeriods(maintenance({ reason: "CAR_BOOKING", startsAt: at(-1), endsAt: at(5) }));
    expect(v.currentCampus).toEqual(campus);
    expect(db.campus.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "campus-1" } });
  });

  it("n'ignore pas un trajet en cours : « en trajet » sans période", async () => {
    db.vehicleUnavailability.findMany.mockResolvedValue([]);
    db.trip.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "departureTime" in where && (where.departureTime as { lte?: Date }).lte ? { id: "trip-1" } : null
    );
    const [v] = await getAllVehiclesWithPositions();
    expect(v.displayStatus).toBe("in_trip");
  });
});
