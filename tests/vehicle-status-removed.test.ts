// tests/vehicle-status-removed.test.ts — Retrait de `vehicles.status` et du type `VehicleStatus` (D59, D72)
// La disponibilité vient des périodes de `vehicle_unavailabilities` : plus aucune trace de l'ancien statut dans
// le schéma, le client généré, la migration ni les réponses des routes qui lisent un véhicule.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { Prisma } from "@/generated/prisma/client";
import * as prismaEnums from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { getAllVehiclesWithPositions } from "@/lib/services/vehicle-service";
import { GET as listVehiclesRoute } from "@/app/api/vehicles/route";
import { GET as getVehicleRoute } from "@/app/api/vehicles/[id]/route";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;

const root = path.resolve(__dirname, "..");
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");

// ══════════════════════════════════════════════
// Schéma, client généré, migration
// ══════════════════════════════════════════════

describe("schéma Prisma et client généré", () => {
  it("le modèle Vehicle n'a plus de colonne status", () => {
    const block = schema.match(/model Vehicle \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(block).toContain("licensePlate");
    expect(block).not.toMatch(/^\s*status\s/m);
  });

  it("le type VehicleStatus n'existe plus", () => {
    expect(schema).not.toMatch(/enum VehicleStatus/);
    expect(schema).not.toMatch(/VehicleStatus/);
  });

  it("le client généré ne connaît plus la colonne ni le type", () => {
    expect(Object.keys(Prisma.VehicleScalarFieldEnum)).not.toContain("status");
    expect(prismaEnums).not.toHaveProperty("VehicleStatus");
  });

  it("l'audit garde VEHICLE_MAINTENANCE_ON et _OFF : des lignes du journal les portent", () => {
    expect(prismaEnums.AuditAction).toHaveProperty("VEHICLE_MAINTENANCE_ON");
    expect(prismaEnums.AuditAction).toHaveProperty("VEHICLE_MAINTENANCE_OFF");
  });
});

describe("migration drop_vehicle_status", () => {
  const migrations = path.join(root, "prisma/migrations");
  const name = readdirSync(migrations).find((entry) => entry.endsWith("_drop_vehicle_status"));
  const sql = name ? readFileSync(path.join(migrations, name, "migration.sql"), "utf8") : "";
  // Les commentaires ne comptent pas : seules les instructions sont examinées
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  it("existe, et vient après toutes les autres", () => {
    expect(name).toBeDefined();
    const all = readdirSync(migrations).filter((entry) => existsSync(path.join(migrations, entry, "migration.sql")));
    expect([...all].sort().at(-1)).toBe(name);
  });

  it("ne retire que la colonne status de vehicles, puis le type VehicleStatus (exception D72 à la règle 8)", () => {
    expect(statements).toEqual(['ALTER TABLE "vehicles" DROP COLUMN "status"', 'DROP TYPE "VehicleStatus"']);
  });
});

// ══════════════════════════════════════════════
// Réponses : aucun champ status sur un véhicule
// ══════════════════════════════════════════════

/**
 * Une ligne de la base telle qu'une table qui aurait encore la colonne la rendrait, mais filtrée comme le fait
 * le client généré : Prisma ne rend que les champs de son schéma.
 */
function likeGeneratedClient(row: Record<string, unknown>) {
  const known = new Set<string>(Object.keys(Prisma.VehicleScalarFieldEnum));
  return Object.fromEntries(Object.entries(row).filter(([key]) => known.has(key)));
}

const campus = { id: "campus-1", name: "Le Havre", latitude: 49.49, longitude: 0.1, createdAt: new Date("2029-01-01") };
const storedVehicle = {
  id: "vehicle-1",
  name: "Zoé",
  licensePlate: "AB-123-CD",
  seats: 5,
  status: "MAINTENANCE", // la colonne, tant qu'elle existe en base
  defaultCampusId: "campus-1",
  createdAt: new Date("2029-01-01"),
  updatedAt: new Date("2029-01-01"),
};

beforeEach(() => {
  resetPrismaMock(db);
  vi.mocked(getSession).mockResolvedValue({
    user: { sub: DRIVER, email: "driver@em-normandie.fr", name: "Conducteur" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.vehicle.findMany.mockImplementation(async () => [{ ...likeGeneratedClient(storedVehicle), defaultCampus: campus }]);
  db.vehicle.findUnique.mockImplementation(async () => ({ ...likeGeneratedClient(storedVehicle), defaultCampus: campus }));
  db.vehicle.findUniqueOrThrow.mockResolvedValue({ id: "vehicle-1", defaultCampusId: "campus-1" });
  db.vehicleUnavailability.findMany.mockResolvedValue([]);
  db.campus.findUniqueOrThrow.mockResolvedValue(campus);
  db.trip.findFirst.mockResolvedValue(null);
});

describe("aucun champ status sur un véhicule", () => {
  it("getAllVehiclesWithPositions", async () => {
    const [vehicle] = await getAllVehiclesWithPositions();
    expect(vehicle).not.toHaveProperty("status");
    expect(vehicle).toMatchObject({ id: "vehicle-1", displayStatus: "available" });
  });

  it("GET /api/vehicles", async () => {
    const [vehicle] = await (await listVehiclesRoute()).json();
    expect(vehicle).not.toHaveProperty("status");
    expect(vehicle.displayStatus).toBe("available");
  });

  it("GET /api/vehicles/[id]", async () => {
    const response = await getVehicleRoute(new NextRequest("http://localhost:3002/api/vehicles/vehicle-1"), {
      params: Promise.resolve({ id: "vehicle-1" }),
    });
    const body = await response.json();
    expect(body).not.toHaveProperty("status");
    expect(body).toMatchObject({ id: "vehicle-1", licensePlate: "AB-123-CD" });
  });
});
