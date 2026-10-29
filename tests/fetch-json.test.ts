// tests/fetch-json.test.ts — Lecture JSON des écrans : une réponse d'erreur devient une erreur (D33)
// Avant l'étape 3, la plupart des écrans prenaient `{ error, message }` pour des données et affichaient une liste vide.

import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchError, fetchJson } from "@/lib/utils/fetch-json";

function respondWith(status: number, body: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchJson", () => {
  it("rend le corps d'une réponse 2xx", async () => {
    respondWith(200, JSON.stringify([{ id: "c1" }]));
    await expect(fetchJson("/api/campuses")).resolves.toEqual([{ id: "c1" }]);
  });

  it("une réponse d'erreur devient une FetchError avec le message, le statut et le code de l'API", async () => {
    respondWith(503, JSON.stringify({ error: "DIRECTORY_UNAVAILABLE", message: "Annuaire indisponible." }));
    const error = await fetchJson("/api/users/search?q=ab").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
    expect(error).toMatchObject({ status: 503, code: "DIRECTORY_UNAVAILABLE", message: "Annuaire indisponible." });
  });

  it("une erreur sans corps lisible garde un message en français", async () => {
    respondWith(500, "<html>panne</html>");
    const error = await fetchJson("/api/trips").catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 500, message: "Le serveur n'a pas répondu comme prévu." });
  });

  it("sans réseau, un message en français et le statut 0 (le navigateur dit « Failed to fetch »)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const error = await fetchJson("/api/vehicles").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FetchError);
    expect(error).toMatchObject({ status: 0, message: "Le serveur ne répond pas. Vérifiez votre connexion, puis réessayez." });
  });

  it("un 404 se reconnaît à son statut", async () => {
    respondWith(404, JSON.stringify({ error: "NOT_FOUND", message: "Trajet non trouvé." }));
    await expect(fetchJson("/api/trips/inconnu")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
