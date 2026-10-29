// tests/neon-metrics.test.ts — Métriques Neon de /admin/settings sans clé (D49) : aucune clé Neon en production.
// L'action rend « non configuré » au lieu de lever une erreur, dont Next masque le message en production.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(), isAdmin: vi.fn() }));

import { getSession, isAdmin } from "@/lib/auth";
import { getNeonMetrics } from "@/app/admin/settings/actions";

const fetchSpy = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
  vi.mocked(getSession).mockResolvedValue({
    user: { sub: "sub-admin", email: "admin@em-normandie.fr", name: "Admin" },
    expires: "2099-01-01T00:00:00.000Z",
  });
  vi.mocked(isAdmin).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchSpy.mockReset();
});

describe("D49 : métriques Neon sans clé", () => {
  it.each([
    ["aucune des deux", "", ""],
    ["sans clé", "wispy-shadow-66847588", ""],
    ["sans projet", "", "cle-fictive"],
  ])("%s : « non configuré », sans appel à l'API Neon", async (_label, projectId, apiKey) => {
    vi.stubEnv("NEON_PROJET_ID", projectId);
    vi.stubEnv("NEON_API_KEY", apiKey);
    await expect(getNeonMetrics()).resolves.toEqual({ configured: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("un non-administrateur reste refusé, même sans clé", async () => {
    vi.stubEnv("NEON_PROJET_ID", "");
    vi.stubEnv("NEON_API_KEY", "");
    vi.mocked(isAdmin).mockResolvedValue(false);
    await expect(getNeonMetrics()).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
