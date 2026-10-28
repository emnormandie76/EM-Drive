// tests/trip-service.test.ts — Gardes du service des trajets : cas limites 1, 2, 3 et 9

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/services/audit-service", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  addPassenger,
  createTrip,
  removePassenger,
  updateDepartureTime,
  type CreateTripInput,
} from "@/lib/services/trip-service";
import {
  DriverOverlapError,
  PassengerOverlapError,
  PermissionError,
  ValidationError,
  VehicleConflictError,
} from "@/lib/utils/errors";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER, OTHER, PASSENGER, hoursFromNow, makePassenger, makeTrip } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;

beforeEach(() => {
  resetPrismaMock(db);
  db.trip.findFirst.mockResolvedValue(null); // aucun conflit par défaut
  db.appSetting.findUnique.mockResolvedValue(null); // buffer par défaut : 30 min
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// CAS LIMITE 1 — inscription d'un passager
// ══════════════════════════════════════════════

describe("addPassenger (cas limite 1)", () => {
  const join = (actor: string, actorIsAdmin = false) =>
    addPassenger("trip-1", PASSENGER, "p@em-normandie.fr", "Passager", "SELF", actor, "a@em-normandie.fr", actorIsAdmin);
  const addByDriver = (actor: string, actorIsAdmin = false) =>
    addPassenger("trip-1", PASSENGER, "p@em-normandie.fr", "Passager", "DRIVER", actor, "a@em-normandie.fr", actorIsAdmin);

  it("inscrit un passager sur un trajet futur avec des places", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    await join(PASSENGER);
    expect(db.passenger.create).toHaveBeenCalledOnce();
  });

  it("refuse un trajet annulé", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ status: "CANCELLED" }));
    await expect(join(PASSENGER)).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.create).not.toHaveBeenCalled();
  });

  it("refuse un trajet déjà parti", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: hoursFromNow(-1) }));
    await expect(join(PASSENGER)).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.create).not.toHaveBeenCalled();
  });

  it("refuse un trajet complet", async () => {
    const passengers = [1, 2, 3, 4].map((n) => makePassenger({ id: `p${n}`, userSub: `user-${n}` }));
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ passengers }));
    await expect(join(PASSENGER)).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.create).not.toHaveBeenCalled();
  });

  it("refuse que le conducteur soit passager de son trajet", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    await expect(
      addPassenger("trip-1", DRIVER, "d@em-normandie.fr", "Conducteur", "SELF", DRIVER, "d@em-normandie.fr", false)
    ).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.create).not.toHaveBeenCalled();
  });

  it("refuse un ajout « par le conducteur » fait par un tiers", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    await expect(addByDriver(OTHER)).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.create).not.toHaveBeenCalled();
  });

  it("accepte un ajout par le conducteur", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    await addByDriver(DRIVER);
    expect(db.passenger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userSub: PASSENGER, addedBy: "DRIVER" }),
    });
  });

  it("accepte un ajout par un admin", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    await addByDriver(OTHER, true);
    expect(db.passenger.create).toHaveBeenCalledOnce();
  });

  it("refuse un passager qui a déjà un trajet sur le créneau", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    db.trip.findFirst.mockResolvedValueOnce({ id: "trip-9" });
    await expect(join(PASSENGER)).rejects.toBeInstanceOf(PassengerOverlapError);
    expect(db.passenger.create).not.toHaveBeenCalled();
  });

  it("vérifie et écrit dans une même transaction sérialisée (places disputées)", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    await join(PASSENGER);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
});

// ══════════════════════════════════════════════
// CAS LIMITE 2 (et 9) — retrait d'un passager
// ══════════════════════════════════════════════

describe("removePassenger (cas limite 2)", () => {
  const setUp = (passenger: ReturnType<typeof makePassenger>, departureTime = hoursFromNow(72)) => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime }));
    db.passenger.findUnique.mockResolvedValue(passenger);
  };
  const remove = (actor: string, actorIsAdmin = false) =>
    removePassenger("trip-1", "passenger-row-1", actor, "a@em-normandie.fr", actorIsAdmin);

  it("laisse un passager se retirer avant le départ", async () => {
    setUp(makePassenger({ addedBy: "SELF" }));
    await remove(PASSENGER);
    expect(db.passenger.delete).toHaveBeenCalledOnce();
  });

  it("refuse qu'un passager se retire après le départ", async () => {
    setUp(makePassenger({ addedBy: "SELF" }), hoursFromNow(-1));
    await expect(remove(PASSENGER)).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.delete).not.toHaveBeenCalled();
  });

  it("laisse le conducteur retirer un passager qu'il a ajouté, avant le départ", async () => {
    setUp(makePassenger({ addedBy: "DRIVER" }));
    await remove(DRIVER);
    expect(db.passenger.delete).toHaveBeenCalledOnce();
  });

  it("refuse que le conducteur retire un passager inscrit lui-même", async () => {
    setUp(makePassenger({ addedBy: "SELF" }));
    await expect(remove(DRIVER)).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.delete).not.toHaveBeenCalled();
  });

  it("refuse que le conducteur retire un passager après le départ", async () => {
    setUp(makePassenger({ addedBy: "DRIVER" }), hoursFromNow(-1));
    await expect(remove(DRIVER)).rejects.toBeInstanceOf(PermissionError);
    expect(db.passenger.delete).not.toHaveBeenCalled();
  });

  it("laisse un admin retirer n'importe quel passager, même après le départ", async () => {
    setUp(makePassenger({ addedBy: "SELF" }), hoursFromNow(-1));
    await remove(OTHER, true);
    expect(db.passenger.delete).toHaveBeenCalledOnce();
  });

  it("refuse un tiers sans rien écrire dans la console (cas limite 9)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    setUp(makePassenger({ addedBy: "SELF" }));
    await expect(remove(OTHER)).rejects.toBeInstanceOf(PermissionError);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// CAS LIMITE 3 — décalage de l'heure de départ
// ══════════════════════════════════════════════

describe("updateDepartureTime (cas limite 3)", () => {
  // Toutes les heures partent du même instant, pour des comparaisons exactes
  const base = Date.now();
  const at = (hours: number) => new Date(base + hours * 60 * 60 * 1000);
  const newDeparture = at(96); // décalage de 24 h
  const newArrival = at(98); // arrivée prévue décalée d'autant
  const trip = () =>
    makeTrip({
      departureTime: at(72),
      estimatedArrivalTime: at(74),
      passengers: [makePassenger({ addedBy: "DRIVER" })],
    });
  const shift = () => updateDepartureTime("trip-1", newDeparture, DRIVER, "d@em-normandie.fr", false);

  type FindFirstArgs = { where: Record<string, unknown> };
  const conflictWhen = (predicate: (where: Record<string, unknown>) => boolean) =>
    db.trip.findFirst.mockImplementation(async ({ where }: FindFirstArgs) => (predicate(where) ? { id: "trip-9" } : null));

  beforeEach(() => {
    db.trip.findUniqueOrThrow.mockResolvedValue(trip());
  });

  it("refuse si le véhicule est pris sur le nouveau créneau", async () => {
    conflictWhen((where) => "vehicleId" in where);
    await expect(shift()).rejects.toBeInstanceOf(VehicleConflictError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse si le conducteur a un autre trajet sur le nouveau créneau", async () => {
    conflictWhen((where) => where.driverSub === DRIVER);
    await expect(shift()).rejects.toBeInstanceOf(DriverOverlapError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse si un passager a un autre trajet sur le nouveau créneau", async () => {
    conflictWhen((where) => JSON.stringify(where.passengers) === JSON.stringify({ some: { userSub: PASSENGER } }));
    await expect(shift()).rejects.toBeInstanceOf(PassengerOverlapError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("vérifie le nouveau créneau, buffer compris, en excluant le trajet lui-même", async () => {
    await shift();
    const calls = db.trip.findFirst.mock.calls.map((call) => (call[0] as FindFirstArgs).where);
    expect(calls.length).toBeGreaterThanOrEqual(3); // véhicule, conducteur, passager
    for (const where of calls) {
      expect(where.id).toEqual({ not: "trip-1" });
      expect(where.departureTime).toEqual({ lt: new Date(newArrival.getTime() + 30 * 60 * 1000) });
    }
  });

  it("décale le trajet dans une transaction sérialisée quand rien ne chevauche", async () => {
    await shift();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: expect.objectContaining({ departureTime: newDeparture, estimatedArrivalTime: newArrival }),
    });
  });
});

// ══════════════════════════════════════════════
// CAS LIMITE 1 — passagers à la création
// ══════════════════════════════════════════════

describe("createTrip : passagers (cas limite 1)", () => {
  const input = (passengerIds: string[]): CreateTripInput => ({
    vehicleId: "vehicle-1",
    driverSub: DRIVER,
    driverEmail: "d@em-normandie.fr",
    driverDisplayName: "Conducteur",
    type: "ONE_WAY",
    originCampusId: "campus-1",
    destinationCampusId: "campus-2",
    departureTime: hoursFromNow(72),
    estimatedArrivalTime: hoursFromNow(74),
    passengers: passengerIds.map((id) => ({ userSub: id, userEmail: `${id}@em-normandie.fr`, userDisplayName: id })),
  });

  beforeEach(() => {
    db.vehicle.findUniqueOrThrow.mockResolvedValue({ id: "vehicle-1", seats: 5 });
    db.trip.create.mockResolvedValue({ id: "trip-1" });
  });

  it("accepte autant de passagers que de places hors conducteur", async () => {
    await createTrip(input(["u1", "u2", "u3", "u4"]));
    expect(db.trip.create).toHaveBeenCalledOnce();
  });

  it("refuse plus de passagers que de places", async () => {
    await expect(createTrip(input(["u1", "u2", "u3", "u4", "u5"]))).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("refuse le conducteur parmi les passagers", async () => {
    await expect(createTrip(input([DRIVER]))).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });
});
