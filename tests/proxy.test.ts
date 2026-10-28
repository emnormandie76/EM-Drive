// tests/proxy.test.ts — Le proxy redirige les pages sans session, pas les API (D4)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import proxy, { config } from "@/proxy";

/** Le matcher est une expression régulière sur le chemin (syntaxe de Next). */
const covers = (path: string) => config.matcher.some((matcher) => new RegExp(`^${matcher}$`).test(path));

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
