// tests/trips-list.test.ts — « Mes trajets à venir » filtrés par le serveur (D32)
// Le tableau de bord prenait les 5 prochains trajets de tout le monde puis gardait ceux de l'appelant.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { GET as listTripsRoute } from "@/app/api/trips/route";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER, OTHER } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;
const mineFilter = { OR: [{ driverSub: DRIVER }, { passengers: { some: { userSub: DRIVER } } }] };

function list(query: string) {
  return listTripsRoute(new NextRequest(`http://localhost:3002/api/trips?${query}`));
}

function whereOfLastQuery() {
  return db.trip.findMany.mock.calls.at(-1)?.[0]?.where;
}

beforeEach(() => {
  resetPrismaMock(db);
  db.trip.findMany.mockResolvedValue([]);
  db.trip.count.mockResolvedValue(0);
  vi.mocked(getSession).mockResolvedValue({
    user: { sub: DRIVER, email: "d@em-normandie.fr", name: "Conducteur" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(false);
});

describe("GET /api/trips?mine=true", () => {
  it("ne garde que les trajets où l'appelant conduit ou voyage, avant la limite", async () => {
    const response = await list("status=upcoming&mine=true&limit=5");
    expect(response.status).toBe(200);
    expect(whereOfLastQuery()).toMatchObject(mineFilter);
    expect(db.trip.findMany.mock.calls[0][0]).toMatchObject({ take: 5 });
    // Le total de la pagination suit le même filtre
    expect(db.trip.count.mock.calls[0][0].where).toMatchObject(mineFilter);
  });

  it("l'identité vient de la session, jamais de la requête", async () => {
    await list(`mine=true&driverSub=${OTHER}&userSub=${OTHER}`);
    expect(JSON.stringify(whereOfLastQuery())).not.toContain(OTHER);
    expect(whereOfLastQuery()).toMatchObject(mineFilter);
  });

  it("sans mine=true, la liste reste celle de tous les trajets", async () => {
    await list("status=upcoming");
    expect(whereOfLastQuery()).not.toHaveProperty("OR");
    expect(JSON.stringify(whereOfLastQuery())).not.toContain(DRIVER);
  });

  it("sans session : 401, aucune lecture", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const response = await list("mine=true");
    expect(response.status).toBe(401);
    expect(db.trip.findMany).not.toHaveBeenCalled();
  });
});
