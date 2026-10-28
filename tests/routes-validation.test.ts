// tests/routes-validation.test.ts — Un corps invalide donne 400, jamais 500 (cas limite 6)

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { POST as createTripRoute } from "@/app/api/trips/route";
import { PATCH as updateTripRoute } from "@/app/api/trips/[id]/route";
import { POST as addPassengerRoute } from "@/app/api/trips/[id]/passengers/route";
import { POST as createVehicleRoute } from "@/app/api/admin/vehicles/route";
import { PATCH as updateSettingRoute } from "@/app/api/admin/settings/route";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;
const tripParams = { params: Promise.resolve({ id: "trip-1" }) };

function request(method: string, body: string) {
  return new NextRequest("http://localhost:3002/api/test", { method, body });
}

async function expectValidationError(response: Response | undefined) {
  expect(response?.status).toBe(400);
  expect(await response?.json()).toMatchObject({ error: "VALIDATION_ERROR" });
}

beforeEach(() => {
  resetPrismaMock(db);
  vi.mocked(getSession).mockResolvedValue({
    user: { entraId: DRIVER, email: "d@em-normandie.fr", name: "Conducteur" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("routes d'écriture : corps invalide → 400", () => {
  it("POST /api/trips avec une date invalide", async () => {
    const body = { vehicleId: "v1", type: "ONE_WAY", originCampusId: "c1", destinationCampusId: "c2", departureTime: "pas-une-date", estimatedArrivalTime: "2026-11-02T10:00:00.000Z" };
    await expectValidationError(await createTripRoute(request("POST", JSON.stringify(body))));
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/trips/[id] sans heure de départ", async () => {
    await expectValidationError(await updateTripRoute(request("PATCH", JSON.stringify({})), tripParams));
    expect(db.trip.update).not.toHaveBeenCalled();
  });

  it("POST /api/trips/[id]/passengers avec un JSON mal formé", async () => {
    await expectValidationError(await addPassengerRoute(request("POST", "{oups"), tripParams));
    expect(db.passenger.create).not.toHaveBeenCalled();
  });

  it("POST /api/admin/vehicles avec un nombre de places non numérique", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const body = { name: "Zoé", licensePlate: "AB-123-CD", seats: "abc", defaultCampusId: "c1" };
    await expectValidationError(await createVehicleRoute(request("POST", JSON.stringify(body))));
    expect(db.vehicle.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/admin/settings avec une clé inconnue", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    await expectValidationError(await updateSettingRoute(request("PATCH", JSON.stringify({ key: "autre", value: "1" }))));
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });
});
