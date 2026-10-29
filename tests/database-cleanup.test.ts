// tests/database-cleanup.test.ts — Nettoyage de la base depuis /admin/settings (cas limite 8, D32)
// Un trajet se juge sur sa fin (arrivée du retour, sinon de l'aller), jamais sur sa date de création.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/auth";
import { cleanupDatabase } from "@/app/admin/settings/actions";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";
import { DRIVER } from "./helpers/fixtures";

const db = prisma as unknown as PrismaMock;
const NOW = new Date("2026-10-28T12:00:00.000Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/**
 * Applique à une ligne le filtre `where` que reçoit `deleteMany` : égalité, `null`, `lt`, `OR`.
 * Un opérateur inconnu fait échouer le test plutôt que de répondre au hasard.
 */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Where[]).some((part) => matches(row, part));
    if (key === "AND") return (condition as Where[]).every((part) => matches(row, part));
    const value = row[key];
    if (condition === null) return value === null;
    if (typeof condition !== "object") return value === condition;
    return Object.entries(condition as Record<string, unknown>).every(([operator, operand]) => {
      if (operator === "lt") return value instanceof Date && value < (operand as Date);
      throw new Error(`Opérateur non pris en charge par le test : ${operator}`);
    });
  });
}

/** Les trajets que viserait le dernier appel à `trip.deleteMany`. */
function targetedTrips(rows: Record<string, Row>): string[] {
  const where = db.trip.deleteMany.mock.calls.at(-1)?.[0]?.where as Where;
  return Object.entries(rows).filter(([, row]) => matches(row, where)).map(([name]) => name);
}

function trip(overrides: Row): Row {
  return {
    status: "SCHEDULED",
    createdAt: daysFromNow(-90),
    estimatedReturnArrivalTime: null,
    ...overrides,
  };
}

const TRIPS = {
  // Réservé il y a deux mois, part dans une semaine : jamais supprimé
  futureBookedLongAgo: trip({ createdAt: daysFromNow(-60), estimatedArrivalTime: daysFromNow(7) }),
  // Terminé il y a deux mois
  endedLongAgo: trip({ estimatedArrivalTime: daysFromNow(-60) }),
  // Terminé il y a une semaine
  endedRecently: trip({ estimatedArrivalTime: daysFromNow(-7) }),
  // Aller arrivé il y a 40 jours, retour il y a 20 : se juge sur le retour
  roundTripReturnedRecently: trip({ estimatedArrivalTime: daysFromNow(-40), estimatedReturnArrivalTime: daysFromNow(-20) }),
  // Annulé, prévu il y a deux mois
  cancelledLongAgo: trip({ status: "CANCELLED", estimatedArrivalTime: daysFromNow(-60) }),
  // Annulé, prévu dans une semaine, réservé il y a deux mois
  cancelledFuture: trip({ status: "CANCELLED", createdAt: daysFromNow(-60), estimatedArrivalTime: daysFromNow(7) }),
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetPrismaMock(db);
  db.trip.deleteMany.mockResolvedValue({ count: 0 });
  db.auditLog.deleteMany.mockResolvedValue({ count: 0 });
  vi.mocked(getSession).mockResolvedValue({
    user: { sub: DRIVER, email: "admin@em-normandie.fr", name: "Admin" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cas limite 8 : nettoyage des trajets", () => {
  it("tous les statuts : seuls les trajets terminés depuis plus d'un mois sont visés", async () => {
    await cleanupDatabase("TRIPS", "ALL");
    expect(targetedTrips(TRIPS).sort()).toEqual(["cancelledLongAgo", "endedLongAgo"]);
  });

  it("un trajet futur réservé il y a plus d'un mois n'est jamais visé", async () => {
    for (const status of ["ALL", "SCHEDULED", "CANCELLED"] as const) {
      await cleanupDatabase("TRIPS", status);
      expect(targetedTrips(TRIPS)).not.toContain("futureBookedLongAgo");
      expect(targetedTrips(TRIPS)).not.toContain("cancelledFuture");
    }
  });

  it("un aller-retour se juge sur l'arrivée du retour", async () => {
    await cleanupDatabase("TRIPS", "ALL");
    expect(targetedTrips(TRIPS)).not.toContain("roundTripReturnedRecently");
  });

  it("le filtre de statut garde son sens", async () => {
    await cleanupDatabase("TRIPS", "CANCELLED");
    expect(targetedTrips(TRIPS)).toEqual(["cancelledLongAgo"]);
    await cleanupDatabase("TRIPS", "SCHEDULED");
    expect(targetedTrips(TRIPS)).toEqual(["endedLongAgo"]);
  });

  it("rend le nombre de trajets supprimés", async () => {
    db.trip.deleteMany.mockResolvedValue({ count: 3 });
    expect(await cleanupDatabase("TRIPS", "ALL")).toBe(3);
  });

  it("un statut inconnu est refusé, rien n'est supprimé", async () => {
    await expect(cleanupDatabase("TRIPS", "DROP" as never)).rejects.toThrow();
    expect(db.trip.deleteMany).not.toHaveBeenCalled();
  });
});

describe("cas limite 8 : nettoyage des journaux et gardes", () => {
  it("journaux : ceux créés depuis plus d'un mois", async () => {
    await cleanupDatabase("AUDIT_LOGS");
    const where = db.auditLog.deleteMany.mock.calls[0][0].where as Where;
    expect(matches({ createdAt: daysFromNow(-40) }, where)).toBe(true);
    expect(matches({ createdAt: daysFromNow(-20) }, where)).toBe(false);
  });

  it("une cible inconnue est refusée, rien n'est supprimé", async () => {
    await expect(cleanupDatabase("PEOPLE" as never)).rejects.toThrow();
    expect(db.trip.deleteMany).not.toHaveBeenCalled();
    expect(db.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it("un non-administrateur est refusé, rien n'est supprimé", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    await expect(cleanupDatabase("TRIPS", "ALL")).rejects.toThrow(/administrateur/);
    expect(db.trip.deleteMany).not.toHaveBeenCalled();
  });

  it("sans session, refusé, rien n'est supprimé", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(cleanupDatabase("AUDIT_LOGS")).rejects.toThrow();
    expect(db.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});
