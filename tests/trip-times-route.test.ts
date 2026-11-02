// tests/trip-times-route.test.ts — PATCH /api/trips/[id] : « Modifier l'heure » (D61, D63)

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/services/audit-service", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { PATCH as updateTripRoute } from "@/app/api/trips/[id]/route";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER, makeTrip, makeUnavailability, makeVehicle } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;
const tripParams = { params: Promise.resolve({ id: "trip-1" }) };
const base = Date.now();
const at = (hours: number) => new Date(base + hours * 60 * 60 * 1000);

function patch(body: unknown) {
  return updateTripRoute(
    new NextRequest("http://localhost:3002/api/trips/trip-1", { method: "PATCH", body: JSON.stringify(body) }),
    tripParams
  );
}

beforeEach(() => {
  resetPrismaMock(db);
  vi.mocked(getSession).mockResolvedValue({
    user: { sub: DRIVER, email: "d@em-normandie.fr", name: "Conducteur" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(false);
  db.trip.findFirst.mockResolvedValue(null);
  db.vehicle.findUniqueOrThrow.mockResolvedValue(makeVehicle());
  db.vehicleUnavailability.findFirst.mockResolvedValue(null);
  db.appSetting.findUnique.mockResolvedValue(null);
  db.trip.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "trip-1", ...data }));
});

describe("PATCH /api/trips/[id] : horaires", () => {
  it("transmet le départ et le retour choisis par le conducteur (D61)", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(
      makeTrip({
        type: "ROUND_TRIP",
        departureTime: at(72),
        estimatedArrivalTime: at(74),
        returnDepartureTime: at(80),
        estimatedReturnArrivalTime: at(82),
        returnCampusId: "campus-1",
      })
    );
    const response = await patch({ departureTime: at(96).toISOString(), returnDepartureTime: at(110).toISOString() });
    expect(response?.status).toBe(200);
    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: "trip-1" },
      data: expect.objectContaining({ departureTime: at(96), returnDepartureTime: at(110), estimatedReturnArrivalTime: at(112) }),
    });
  });

  it("refuse en 403 un trajet déjà parti, même pour un admin (D63)", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip({ departureTime: at(-1), estimatedArrivalTime: at(1) }));
    const response = await patch({ departureTime: at(96).toISOString() });
    expect(response?.status).toBe(403);
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("refuse en 409 un véhicule en maintenance sur le nouveau créneau (D62, D59)", async () => {
    db.trip.findUniqueOrThrow.mockResolvedValue(makeTrip());
    db.vehicleUnavailability.findFirst.mockResolvedValue(makeUnavailability({ endsAt: null }));
    const response = await patch({ departureTime: at(96).toISOString() });
    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ error: "VEHICLE_UNAVAILABLE" });
    expect(db.trip.update).not.toHaveBeenCalled();
  });
});
