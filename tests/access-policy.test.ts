// tests/access-policy.test.ts — Chaque méthode de chaque route API appelle la garde de la table

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCESS_POLICY, type Guard } from "./helpers/access-policy";

const API_DIR = join(process.cwd(), "src", "app", "api");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Chemins des routes relatifs à src/app/api, sans « /route.ts » (ex. « trips/[id] »). */
function listRoutes(): string[] {
  return readdirSync(API_DIR, { recursive: true, encoding: "utf8" })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.endsWith("/route.ts"))
    .map((file) => file.slice(0, -"/route.ts".length))
    .sort();
}

/** Méthodes exportées par une route, avec le code de chacune (jusqu'à l'export suivant). */
function exportedMethods(source: string): Map<string, string> {
  const methods = new Map<string, string>();
  const functionExports = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)];
  functionExports.forEach((match, i) => {
    if (!HTTP_METHODS.includes(match[1])) return;
    const end = i + 1 < functionExports.length ? functionExports[i + 1].index : source.length;
    methods.set(match[1], source.slice(match.index, end));
  });
  // Réexport d'un gestionnaire (« export { handler as GET } ») : pas de code propre
  for (const match of source.matchAll(/\bas\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    methods.set(match[1], "");
  }
  return methods;
}

function guardOf(code: string): Guard {
  if (/requireAdminSession\(\)/.test(code)) return "admin";
  if (/requireAuthSession\(\)|getSession\(\)/.test(code)) return "auth";
  return "public";
}

describe("table des droits par route", () => {
  const routes = listRoutes();

  it("couvre toutes les routes du code, et seulement elles", () => {
    expect(routes).toEqual(Object.keys(ACCESS_POLICY).sort());
  });

  for (const route of routes) {
    const expected = ACCESS_POLICY[route] ?? {};
    const methods = exportedMethods(readFileSync(join(API_DIR, route, "route.ts"), "utf8"));

    it(`${route} : méthodes exportées = méthodes de la table`, () => {
      expect([...methods.keys()].sort()).toEqual(Object.keys(expected).sort());
    });

    for (const [method, code] of methods) {
      it(`${method} /api/${route} : garde ${expected[method]}`, () => {
        expect(guardOf(code)).toBe(expected[method]);
      });
    }
  }
});
