// tests/helpers/prisma-mock.ts — Client Prisma simulé (D2 : aucun réseau, aucune base)
// Les tests remplacent "@/lib/prisma" par ce client et règlent les réponses de chaque méthode.

import { vi } from "vitest";

export function createPrismaMock() {
  const mock = {
    trip: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    passenger: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    vehicle: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    appSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    person: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // Une transaction exécute son callback avec le même client simulé
    $transaction: vi.fn(),
  };
  return mock;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;

/** Remet toutes les méthodes à zéro ; la transaction rappelle le callback avec le client. */
export function resetPrismaMock(mock: PrismaMock) {
  for (const model of [mock.trip, mock.passenger, mock.vehicle, mock.appSetting, mock.auditLog, mock.person]) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  mock.$transaction.mockReset();
  mock.$transaction.mockImplementation(async (callback: (tx: PrismaMock) => unknown) => callback(mock));
}
