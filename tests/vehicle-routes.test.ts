// tests/vehicle-routes.test.ts — Plaque déjà prise : 409, pas 500 (cas limite 10, D34)

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { POST as createVehicleRoute } from "@/app/api/admin/vehicles/route";
import { PATCH as updateVehicleRoute } from "@/app/api/admin/vehicles/[id]/route";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;
const vehicleParams = { params: Promise.resolve({ id: "vehicle-1" }) };
const newVehicle = { name: "Zoé", licensePlate: "AB-123-CD", seats: 5, defaultCampusId: "c1" };
const existingVehicle = { id: "vehicle-1", ...newVehicle, licensePlate: "EF-456-GH", status: "AVAILABLE" };

/** L'erreur que Prisma lève quand la base refuse un doublon (l'adaptateur Neon convertit le 23505 en P2002). */
function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`license_plate`)", {
    code: "P2002",
    clientVersion: "7.7.0",
  });
}

function request(method: string, body: unknown) {
  return new NextRequest("http://localhost:3002/api/admin/vehicles", { method, body: JSON.stringify(body) });
}

async function expectPlateTaken(response: Response) {
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body).toMatchObject({ error: "LICENSE_PLATE_TAKEN" });
  expect(body.message).toMatch(/plaque/i);
}

beforeEach(() => {
  resetPrismaMock(db);
  vi.mocked(getSession).mockResolvedValue({
    user: { sub: DRIVER, email: "admin@em-normandie.fr", name: "Admin" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cas limite 10 : plaque déjà prise", () => {
  it("POST /api/admin/vehicles → 409 LICENSE_PLATE_TAKEN, sans audit", async () => {
    db.vehicle.create.mockRejectedValue(uniqueViolation());
    await expectPlateTaken(await createVehicleRoute(request("POST", newVehicle)));
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/admin/vehicles/[id] → 409 LICENSE_PLATE_TAKEN, sans audit", async () => {
    db.vehicle.findUnique.mockResolvedValue(existingVehicle);
    db.vehicle.update.mockRejectedValue(uniqueViolation());
    await expectPlateTaken(await updateVehicleRoute(request("PATCH", { licensePlate: "AB-123-CD" }), vehicleParams));
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("une autre erreur de la base reste une erreur interne (500)", async () => {
    db.vehicle.create.mockRejectedValue(new Error("connexion perdue"));
    const response = await createVehicleRoute(request("POST", newVehicle));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "INTERNAL_ERROR" });
  });

  it("une plaque libre crée le véhicule (201) et l'audit", async () => {
    db.vehicle.create.mockResolvedValue({ id: "vehicle-2", ...newVehicle, status: "AVAILABLE" });
    const response = await createVehicleRoute(request("POST", newVehicle));
    expect(response.status).toBe(201);
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });
});
