// tests/conflicts.test.ts — Forme des requêtes de chevauchement (SAD 7.2, 7.5)
// D2 : la requête SQL n'est pas exécutée ; on vérifie le filtre envoyé à Prisma.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});

import { prisma } from "@/lib/prisma";
import { findVehicleConflict } from "@/lib/services/vehicle-service";
import { findPersonConflict } from "@/lib/services/trip-service";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";

const db = prisma as unknown as PrismaMock;
const start = new Date("2026-11-02T08:00:00Z");
const end = new Date("2026-11-02T12:30:00Z");

/** Filtre de chevauchement attendu pour le créneau [start, end]. */
const overlap = {
  status: { not: "CANCELLED" },
  departureTime: { lt: end },
  OR: [
    { type: "ONE_WAY", estimatedArrivalTime: { gt: start } },
    { type: { in: ["ROUND_TRIP", "ROUND_TRIP_OTHER"] }, estimatedReturnArrivalTime: { gt: start } },
  ],
};

beforeEach(() => {
  resetPrismaMock(db);
  db.trip.findFirst.mockResolvedValue(null);
});

describe("findVehicleConflict", () => {
  it("cherche un trajet non annulé du véhicule qui chevauche le créneau", async () => {
    await findVehicleConflict("vehicle-1", start, end);
    expect(db.trip.findFirst).toHaveBeenCalledWith({
      where: { vehicleId: "vehicle-1", ...overlap },
      select: { id: true },
    });
  });

  it("renvoie le trajet en conflit", async () => {
    db.trip.findFirst.mockResolvedValue({ id: "trip-9" });
    await expect(findVehicleConflict("vehicle-1", start, end)).resolves.toEqual({ id: "trip-9" });
  });

  it("peut exclure un trajet (celui qu'on décale)", async () => {
    await findVehicleConflict("vehicle-1", start, end, undefined, "trip-1");
    expect(db.trip.findFirst).toHaveBeenCalledWith({
      where: { vehicleId: "vehicle-1", id: { not: "trip-1" }, ...overlap },
      select: { id: true },
    });
  });
});

describe("findPersonConflict", () => {
  it("cherche la personne comme conducteur, puis comme passager", async () => {
    await findPersonConflict(db as never, "user-1", start, end);
    expect(db.trip.findFirst).toHaveBeenNthCalledWith(1, {
      where: { ...overlap, driverSub: "user-1" },
      select: { id: true },
    });
    expect(db.trip.findFirst).toHaveBeenNthCalledWith(2, {
      where: { ...overlap, passengers: { some: { userSub: "user-1" } } },
      select: { id: true },
    });
  });

  it("s'arrête au premier conflit trouvé comme conducteur", async () => {
    db.trip.findFirst.mockResolvedValueOnce({ id: "trip-9" });
    await expect(findPersonConflict(db as never, "user-1", start, end)).resolves.toEqual({ id: "trip-9" });
    expect(db.trip.findFirst).toHaveBeenCalledTimes(1);
  });

  it("peut exclure un trajet", async () => {
    await findPersonConflict(db as never, "user-1", start, end, "trip-1");
    expect(db.trip.findFirst.mock.calls[0][0].where.id).toEqual({ not: "trip-1" });
    expect(db.trip.findFirst.mock.calls[1][0].where.id).toEqual({ not: "trip-1" });
  });
});
