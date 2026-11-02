// tests/trip-service.test.ts — Gardes du service des trajets : cas limites 1, 2, 3 et 9 ; horaires et véhicule
// réservable (D61 à D63)

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
  updateTripInfo,
  updateTripTimes,
  type CreateTripInput,
} from "@/lib/services/trip-service";
import {
  DriverOverlapError,
  PassengerOverlapError,
  PermissionError,
  ValidationError,
  VehicleConflictError,
  VehicleNotAtCampusError,
  VehicleUnavailableError,
} from "@/lib/utils/errors";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER, OTHER, PASSENGER, hoursFromNow, makePassenger, makeTrip, makeUnavailability, makeVehicle } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;

type FindFirstArgs = { where: Record<string, unknown> };
/** Les recherches de chevauchement bornent le départ ; celle de la position du véhicule, non. */
const isOverlapQuery = (where: Record<string, unknown>) => "departureTime" in where;

/** Dernier trajet du véhicule avant l'heure demandée : un aller simple qui l'a laissé à `campusId`. */
const leftVehicleAt = (campusId: string) =>
  db.trip.findFirst.mockImplementation(async ({ where }: FindFirstArgs) =>
    isOverlapQuery(where)
      ? null
      : { type: "ONE_WAY", originCampusId: "campus-1", destinationCampusId: campusId, returnCampusId: null }
  );

beforeEach(() => {
  resetPrismaMock(db);
  db.trip.findFirst.mockResolvedValue(null); // aucun conflit, aucun trajet antérieur par défaut
  db.vehicle.findUniqueOrThrow.mockResolvedValue(makeVehicle()); // rattaché à campus-1
  db.vehicleUnavailability.findFirst.mockResolvedValue(null); // aucune période d'indisponibilité
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

describe("updateTripTimes : conflits (cas limite 3)", () => {
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
  const shift = () => updateTripTimes("trip-1", { departureTime: newDeparture }, DRIVER, "d@em-normandie.fr", false);

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
    const calls = db.trip.findFirst.mock.calls
      .map((call) => (call[0] as FindFirstArgs).where)
      .filter(isOverlapQuery); // la position du véhicule a sa propre recherche (D62), vue plus bas
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

  it("refuse un passager en double (cas limite 11, D27 : sinon l'unicité de la base répond 500)", async () => {
    await expect(createTrip(input(["u1", "u1"]))).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// D61, D63 — « Modifier l'heure » : départ et retour
// ══════════════════════════════════════════════

describe("updateTripTimes : départ et retour (D61, D63)", () => {
  const base = Date.now();
  const at = (hours: number) => new Date(base + hours * 60 * 60 * 1000);
  const roundTrip = (overrides: Record<string, unknown> = {}) =>
    makeTrip({
      type: "ROUND_TRIP",
      departureTime: at(72),
      estimatedArrivalTime: at(74), // 2 h de route à l'aller
      returnDepartureTime: at(80),
      estimatedReturnArrivalTime: at(83), // 3 h au retour
      returnCampusId: "campus-1",
      ...overrides,
    });
  const update = (times: { departureTime: Date; returnDepartureTime?: Date }, actorIsAdmin = false) =>
    updateTripTimes("trip-1", times, actorIsAdmin ? OTHER : DRIVER, "a@em-normandie.fr", actorIsAdmin);

  it("change le départ et le retour séparément, en gardant les durées de route", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(roundTrip());
    await update({ departureTime: at(96), returnDepartureTime: at(110) });
    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: expect.objectContaining({
        departureTime: at(96),
        estimatedArrivalTime: at(98),
        returnDepartureTime: at(110),
        estimatedReturnArrivalTime: at(113),
      }),
    });
  });

  it("sans nouveau retour, décale le retour du même écart que le départ", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(roundTrip());
    await update({ departureTime: at(96) });
    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: expect.objectContaining({ returnDepartureTime: at(104), estimatedReturnArrivalTime: at(107) }),
    });
  });

  it("vérifie les chevauchements jusqu'à l'arrivée du nouveau retour, buffer compris", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(roundTrip());
    await update({ departureTime: at(96), returnDepartureTime: at(110) });
    const overlaps = db.trip.findFirst.mock.calls.map((call) => (call[0] as FindFirstArgs).where).filter(isOverlapQuery);
    expect(overlaps.length).toBeGreaterThanOrEqual(2); // véhicule, conducteur
    for (const where of overlaps) {
      expect(where.departureTime).toEqual({ lt: new Date(at(113).getTime() + 30 * 60 * 1000) });
    }
  });

  it("refuse un retour qui part avant l'arrivée de l'aller", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(roundTrip());
    await expect(update({ departureTime: at(96), returnDepartureTime: at(97) })).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse un retour sur un aller simple", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(72), estimatedArrivalTime: at(74) }));
    await expect(update({ departureTime: at(96), returnDepartureTime: at(110) })).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse un nouveau départ dans le passé, même pour un admin", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(roundTrip());
    await expect(update({ departureTime: at(-1) }, true)).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse un trajet déjà parti, même pour un admin", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(-1), estimatedArrivalTime: at(1) }));
    await expect(update({ departureTime: at(96) }, true)).rejects.toBeInstanceOf(PermissionError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse un trajet annulé", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(roundTrip({ status: "CANCELLED" }));
    await expect(update({ departureTime: at(96) }, true)).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════
// D62 — le véhicule peut-il partir de ce campus à cette heure ?
// ══════════════════════════════════════════════

describe("véhicule réservable : maintenance et campus de départ (D62)", () => {
  // Depuis D59, la maintenance est une période datée (vehicle_unavailabilities), plus la colonne status
  const inMaintenance = () => db.vehicleUnavailability.findFirst.mockResolvedValue(makeUnavailability({ endsAt: null }));

  const createInput = (): CreateTripInput => ({
    vehicleId: "vehicle-1",
    driverSub: DRIVER,
    driverEmail: "d@em-normandie.fr",
    driverDisplayName: "Conducteur",
    type: "ONE_WAY",
    originCampusId: "campus-1",
    destinationCampusId: "campus-2",
    departureTime: hoursFromNow(72),
    estimatedArrivalTime: hoursFromNow(74),
  });
  const shift = () => updateTripTimes("trip-1", { departureTime: hoursFromNow(96) }, DRIVER, "d@em-normandie.fr", false);

  beforeEach(() => {
    db.trip.create.mockResolvedValue({ id: "trip-1" });
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
  });

  it("crée le trajet quand le véhicule est disponible et au campus de départ", async () => {
    await createTrip(createInput());
    expect(db.trip.create).toHaveBeenCalledOnce();
  });

  it("refuse à la création un véhicule en maintenance", async () => {
    inMaintenance();
    await expect(createTrip(createInput())).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("refuse à la création un véhicule rattaché à un autre campus, sans trajet pour l'amener", async () => {
    db.vehicle.findUniqueOrThrow.mockResolvedValue(makeVehicle({ defaultCampusId: "campus-2" }));
    await expect(createTrip(createInput())).rejects.toBeInstanceOf(VehicleNotAtCampusError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("refuse à la création un véhicule qu'un trajet antérieur aura laissé ailleurs", async () => {
    leftVehicleAt("campus-3");
    await expect(createTrip(createInput())).rejects.toBeInstanceOf(VehicleNotAtCampusError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("refuse un nouvel horaire pour un véhicule en maintenance", async () => {
    inMaintenance();
    await expect(shift()).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse un nouvel horaire où le véhicule ne sera pas au campus de départ", async () => {
    leftVehicleAt("campus-3");
    await expect(shift()).rejects.toBeInstanceOf(VehicleNotAtCampusError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("ignore le trajet modifié lui-même pour situer le véhicule", async () => {
    await shift();
    const positionQueries = db.trip.findFirst.mock.calls
      .map((call) => (call[0] as FindFirstArgs).where)
      .filter((where) => !isOverlapQuery(where));
    expect(positionQueries).toHaveLength(1);
    expect(positionQueries[0].id).toEqual({ not: "trip-1" });
  });

  it("refuse qu'un admin passe un trajet sur un véhicule en maintenance (modale complète)", async () => {
    inMaintenance();
    await expect(updateTripInfo("trip-1", { vehicleId: "vehicle-2" }, OTHER, "a@em-normandie.fr", true)).rejects.toBeInstanceOf(
      VehicleUnavailableError
    );
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse qu'un admin déplace un trajet à une heure où le véhicule sera ailleurs (modale complète)", async () => {
    leftVehicleAt("campus-3");
    await expect(
      updateTripInfo("trip-1", { departureTime: hoursFromNow(96) }, OTHER, "a@em-normandie.fr", true)
    ).rejects.toBeInstanceOf(VehicleNotAtCampusError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("laisse un admin modifier le reste d'un trajet dont le véhicule est en maintenance", async () => {
    inMaintenance();
    await updateTripInfo("trip-1", { comment: "Clés à l'accueil" }, OTHER, "a@em-normandie.fr", true);
    expect(db.trip.update).toHaveBeenCalledOnce();
  });

  it("laisse un admin annuler un trajet dont le véhicule est en maintenance", async () => {
    inMaintenance();
    await updateTripInfo("trip-1", { status: "CANCELLED", vehicleId: "vehicle-1" }, OTHER, "a@em-normandie.fr", true);
    expect(db.trip.update).toHaveBeenCalledOnce();
  });
});

describe("updateTripInfo : nouveau conducteur (écart 5, D24)", () => {
  it("refuse un nouveau conducteur déjà passager du trajet", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ passengers: [makePassenger({ userSub: "u1" })] }));
    await expect(
      updateTripInfo("trip-1", { driverSub: "u1", driverEmail: "u1@em-normandie.fr", driverDisplayName: "U1" }, OTHER, "a@em-normandie.fr", true)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.trip.update).not.toHaveBeenCalled();
  });
});
