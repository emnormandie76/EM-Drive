// tests/proxy.test.ts — Le proxy redirige les pages sans session, pas les API (D4)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, type NextFetchEvent } from "next/server";
import { encode } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import proxy, { config } from "@/proxy";

/** Le matcher est une expression régulière sur le chemin (syntaxe de Next). */
const covers = (path: string) => config.matcher.some((matcher) => new RegExp(`^${matcher}$`).test(path));

const SECRET = "secret-de-test-pour-les-jetons";
const HOUR = 60 * 60;

/** Demande /dashboard avec un cookie de session donné ; rend la réponse du proxy (undefined = laissé passer). */
async function visitDashboard(cookieName: string, signedInAgoSeconds: number) {
  const signedInAt = Math.floor(Date.now() / 1000) - signedInAgoSeconds;
  // Jeton relu récemment : son exp est loin, seule l'heure de connexion est ancienne
  const value = await encode({ token: { sub: "sub-anne", signedInAt }, secret: SECRET, maxAge: 8 * HOUR });
  const request = new NextRequest("http://localhost:3002/dashboard", { headers: { cookie: `${cookieName}=${value}` } });
  return (proxy as (req: NextRequest, event: NextFetchEvent) => Promise<Response | undefined>)(request, {} as NextFetchEvent);
}

beforeEach(() => vi.stubEnv("NEXTAUTH_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("vit dans src/, au niveau de app/ (à la racine, Next l'ignore)", () => {
    expect(existsSync(join(process.cwd(), "src", "proxy.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "proxy.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "middleware.ts"))).toBe(false);
  });

  it("exporte une fonction par défaut, écrite dans le fichier (Next ne reconnaît pas un réexport)", () => {
    expect(typeof proxy).toBe("function");
    const source = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(source).toMatch(/^export default /m);
  });

  it.each(["/", "/dashboard", "/trips/abc", "/admin", "/admin/settings", "/vehicles/v1/calendar"])(
    "couvre la page %s",
    (path) => expect(covers(path)).toBe(true)
  );

  it.each(["/login", "/unauthorized", "/api/trips", "/api/auth/callback/portail", "/_next/static/chunk.js", "/favicon.ico"])(
    "laisse passer %s",
    (path) => expect(covers(path)).toBe(false)
  );
});

describe("proxy : session de ResaVroom (D12, contrat §3.2)", () => {
  it("lit le cookie renommé de ResaVroom", async () => {
    expect(await visitDashboard("resavroom.session-token", HOUR)).toBeUndefined();
  });

  it("ignore le cookie par défaut de NextAuth (celui d'appVC sur le poste)", async () => {
    const response = await visitDashboard("next-auth.session-token", HOUR);
    expect(response?.status).toBe(307);
    expect(new URL(response!.headers.get("Location")!).pathname).toBe("/login");
  });

  it("renvoie vers /login 8 h après la connexion, même si le jeton a été relu depuis", async () => {
    const response = await visitDashboard("resavroom.session-token", 8 * HOUR + 60);
    expect(response?.status).toBe(307);
    expect(new URL(response!.headers.get("Location")!).pathname).toBe("/login");
  });
});
