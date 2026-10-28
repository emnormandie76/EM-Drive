// tests/portail-directory.test.ts — Annuaire du portail (contrat portail v1 §7 ; D24 à D26), contre une imitation
// du portail (tests/helpers/portail-fake.ts) : aucun réseau. L'heure est simulée pour la durée du jeton.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  DIRECTORY_URL,
  DISCOVERY_URL,
  JEAN,
  MARIE,
  PORTAL_ISSUER,
  TOKEN_URL,
  createFakePortal,
  type FakePortalOptions,
} from "./helpers/portail-fake";

type DirectoryModule = typeof import("@/lib/portail-directory");

let directory: DirectoryModule;
let portal: ReturnType<typeof createFakePortal>;

/** Un portail imité et un module neuf à chaque test : le jeton gardé en mémoire ne passe pas d'un test à l'autre. */
async function setup(options: FakePortalOptions = {}) {
  vi.stubEnv("PORTAIL_ISSUER", PORTAL_ISSUER);
  vi.stubEnv("PORTAIL_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("PORTAIL_CLIENT_SECRET", CLIENT_SECRET);
  portal = createFakePortal(options);
  vi.stubGlobal("fetch", portal.fetch);
  vi.resetModules();
  directory = await import("@/lib/portail-directory");
}

/** Les appels faits au portail, dans l'ordre. */
function calls() {
  return portal.fetch.mock.calls.map(([input, init]) => ({ url: String(input), init: init ?? {} }));
}

function header(init: RequestInit, name: string) {
  return new Headers(init.headers).get(name);
}

/** Tout ce qui est écrit dans la console pendant le test. */
function captureConsole(): string[] {
  const lines: string[] = [];
  for (const method of ["error", "warn", "log", "info"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  }
  return lines;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════
// JETON
// ══════════════════════════════════════════════

describe("jeton de l'annuaire (contrat §7)", () => {
  it("demande le jeton sur le token_endpoint de la découverte, en client_credentials avec scope=directory", async () => {
    await setup();
    await directory.searchDirectory("jean");

    const [discovery, token, search] = calls();
    expect(discovery.url).toBe(DISCOVERY_URL);
    expect(token.url).toBe(TOKEN_URL);
    expect(token.init.method).toBe("POST");
    expect(header(token.init, "content-type")).toBe("application/x-www-form-urlencoded");
    expect(token.init.body).toBe("grant_type=client_credentials&scope=directory");
    expect(search.url).toBe(`${DIRECTORY_URL}?q=jean`);
    expect(header(search.init, "authorization")).toBe("Bearer jeton-1");
  });

  it("s'authentifie en client_secret_basic, identifiant et secret encodés en x-www-form-urlencoded (RFC 6749 §2.3.1)", async () => {
    await setup();
    await directory.searchDirectory("jean");

    const authorization = header(calls()[1].init, "authorization")!;
    expect(authorization.startsWith("Basic ")).toBe(true);
    // Le deux-points du secret devient %3A ; l'exemple de l'annexe B de la RFC, « %&+£€ », devient +%25%26%2B%C2%A3%E2%82%AC
    expect(Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8")).toBe(
      "resavroom-dev:s3cr%3At+%25%26%2B%C2%A3%E2%82%AC"
    );
  });

  it("garde le jeton jusqu'à son terme, moins une marge, puis en demande un neuf", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
    await setup();
    await directory.searchDirectory("jean");

    vi.setSystemTime(new Date("2026-10-28T10:50:00Z"));
    await directory.searchDirectory("marie");
    expect(portal.tokenRequests()).toBe(1);

    // 30 s avant le terme d'une heure : dans la marge, le jeton est renouvelé
    vi.setSystemTime(new Date("2026-10-28T10:59:30Z"));
    await directory.searchDirectory("jean");
    expect(portal.tokenRequests()).toBe(2);
    expect(header(calls().at(-1)!.init, "authorization")).toBe("Bearer jeton-2");
  });

  it("partage une demande de jeton en cours entre des recherches simultanées", async () => {
    await setup();
    await Promise.all([
      directory.searchDirectory("jean"),
      directory.searchDirectory("marie"),
      directory.searchDirectory("dupont"),
    ]);
    expect(portal.tokenRequests()).toBe(1);
    expect(portal.discoveryRequests()).toBe(1);
    expect(portal.directoryRequests()).toBe(3);
  });

  it("ne demande rien au portail pour moins de deux caractères", async () => {
    await setup();
    expect(await directory.searchDirectory("j")).toEqual([]);
    expect(await directory.searchDirectory("  j  ")).toEqual([]);
    expect(portal.fetch).not.toHaveBeenCalled();
  });

  it("borne chaque appel au portail par un délai", async () => {
    await setup();
    await directory.searchDirectory("jean");
    expect(calls()).toHaveLength(3);
    for (const { init } of calls()) expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("n'envoie jamais le secret hors de l'émetteur", async () => {
    await setup({ tokenEndpoint: "https://ailleurs.test/token" });
    captureConsole();
    await expect(directory.searchDirectory("jean")).rejects.toMatchObject({ code: "DIRECTORY_UNAVAILABLE" });
    expect(calls().map((call) => call.url)).toEqual([DISCOVERY_URL]);
  });
});

// ══════════════════════════════════════════════
// ERREURS (D25)
// ══════════════════════════════════════════════

describe("erreurs de l'annuaire (D25)", () => {
  it("annuaire fermé : 400 unauthorized_client → DIRECTORY_UNAVAILABLE (503), sans appeler l'annuaire", async () => {
    await setup({ closed: true });
    captureConsole();
    await expect(directory.searchDirectory("jean")).rejects.toMatchObject({ code: "DIRECTORY_UNAVAILABLE", statusCode: 503 });
    expect(portal.directoryRequests()).toBe(0);
  });

  it("sur un 401 de l'annuaire, jette le jeton et en demande un neuf, une seule fois", async () => {
    await setup();
    await directory.searchDirectory("jean");
    portal.revokeTokens();

    expect(await directory.searchDirectory("jean")).toEqual([{ sub: JEAN.sub, name: JEAN.name, email: JEAN.email }]);
    expect(portal.tokenRequests()).toBe(2);
    expect(portal.directoryRequests()).toBe(3);
  });

  it("deux 401 de suite → DIRECTORY_UNAVAILABLE, sans troisième jeton", async () => {
    await setup({ rejectTokens: true });
    captureConsole();
    await expect(directory.searchDirectory("jean")).rejects.toMatchObject({ code: "DIRECTORY_UNAVAILABLE", statusCode: 503 });
    expect(portal.tokenRequests()).toBe(2);
    expect(portal.directoryRequests()).toBe(2);
  });

  it("429 → DIRECTORY_RATE_LIMITED (429)", async () => {
    await setup({ directoryStatus: 429 });
    captureConsole();
    await expect(directory.searchDirectory("jean")).rejects.toMatchObject({ code: "DIRECTORY_RATE_LIMITED", statusCode: 429 });
  });

  it.each<[string, FakePortalOptions]>([
    ["panne du réseau", { down: true }],
    ["erreur du portail", { directoryStatus: 500 }],
    ["réponse qui n'est pas du JSON", { directoryRawBody: "<html>Jean Dupont</html>" }],
    ["réponse d'une autre forme", { directoryRawBody: JSON.stringify({ people: [{ sub: 42 }] }) }],
  ])("%s → DIRECTORY_UNAVAILABLE (503)", async (_case, options) => {
    await setup(options);
    captureConsole();
    await expect(directory.searchDirectory("jean")).rejects.toMatchObject({ code: "DIRECTORY_UNAVAILABLE", statusCode: 503 });
  });

  it("journalise le motif d'un échec, jamais le jeton, le secret, un nom ni une adresse (cas limite 9)", async () => {
    const lines = captureConsole();
    const scenarios: FakePortalOptions[] = [
      {},
      { closed: true },
      { rejectTokens: true },
      { directoryStatus: 429 },
      { directoryStatus: 500 },
      { directoryRawBody: `Jean Dupont <${JEAN.email}>` },
      { tokenEndpoint: "https://ailleurs.test/token" },
    ];
    for (const options of scenarios) {
      await setup(options);
      await directory.searchDirectory("jean").catch(() => undefined);
    }

    const logged = lines.join("\n");
    expect(lines.length).toBeGreaterThan(0);
    for (const secret of [CLIENT_SECRET, "s3cr%3At", "jeton-", "Bearer", "Basic", JEAN.name, JEAN.email, MARIE.name, MARIE.email]) {
      expect(logged).not.toContain(secret);
    }
  });
});

// ══════════════════════════════════════════════
// FORME DE LA RÉPONSE (D26)
// ══════════════════════════════════════════════

describe("forme de la réponse (D26)", () => {
  it("rend sub, name et email de chaque personne, sans le rôle", async () => {
    await setup();
    expect(await directory.searchDirectory("em-normandie")).toEqual([
      { sub: JEAN.sub, name: JEAN.name, email: JEAN.email },
      { sub: MARIE.sub, name: MARIE.name, email: MARIE.email },
    ]);
  });

  it("prend l'adresse pour nom quand le portail n'en donne pas", async () => {
    await setup({ people: [{ ...JEAN, name: "" }] });
    expect(await directory.searchDirectory("jean")).toEqual([{ sub: JEAN.sub, name: JEAN.email, email: JEAN.email }]);
  });
});

// ══════════════════════════════════════════════
// PERSONNE CHOISIE PAR UN ÉCRAN (D24, écart 5)
// ══════════════════════════════════════════════

describe("personne choisie par un écran (D24, écart 5)", () => {
  const caller = { sub: "sub-moi", email: "moi@em-normandie.fr", name: "Moi" };

  it("cherche l'adresse dans l'annuaire et rend le nom et l'adresse du portail", async () => {
    await setup();
    const person = await directory.resolveChosenPerson({ sub: JEAN.sub, email: JEAN.email }, caller);
    expect(person).toEqual({ sub: JEAN.sub, name: JEAN.name, email: JEAN.email });
    expect(new URL(calls().at(-1)!.url).searchParams.get("q")).toBe(JEAN.email);
  });

  it("refuse (400) un sub que l'adresse ne désigne pas", async () => {
    await setup();
    await expect(directory.resolveChosenPerson({ sub: "sub-inventé", email: JEAN.email }, caller)).rejects.toMatchObject({
      code: "PERSON_NOT_IN_DIRECTORY",
      statusCode: 400,
    });
  });

  it("refuse (400) une personne absente de l'annuaire", async () => {
    await setup();
    await expect(
      directory.resolveChosenPerson({ sub: "sub-inconnu", email: "inconnu@em-normandie.fr" }, caller)
    ).rejects.toMatchObject({ code: "PERSON_NOT_IN_DIRECTORY", statusCode: 400 });
  });

  it("l'appelant lui-même vient de sa session, sans appel au portail", async () => {
    await setup();
    expect(await directory.resolveChosenPerson({ sub: caller.sub }, caller)).toEqual(caller);
    expect(portal.fetch).not.toHaveBeenCalled();
  });

  it("exige l'adresse d'une autre personne, sans appel au portail", async () => {
    await setup();
    await expect(directory.resolveChosenPerson({ sub: JEAN.sub }, caller)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(portal.fetch).not.toHaveBeenCalled();
  });

  it("annuaire fermé : l'erreur remonte (503)", async () => {
    await setup({ closed: true });
    captureConsole();
    await expect(directory.resolveChosenPerson({ sub: JEAN.sub, email: JEAN.email }, caller)).rejects.toMatchObject({
      code: "DIRECTORY_UNAVAILABLE",
    });
  });
});
