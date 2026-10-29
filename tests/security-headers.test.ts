// tests/security-headers.test.ts — En-têtes de sécurité et CSP de next.config.ts (D43), sur toutes les routes
// CSP sans nonce : les pages restent pré-rendues. form-action laisse passer le portail, vers lequel le
// formulaire de déconnexion redirige (contrat portail v1 §2 et §8).

import { afterEach, describe, expect, it, vi } from "vitest";

const PORTAL_ISSUER = "https://portail-admission.vercel.app/api/auth";
const PORTAL_ORIGIN = "https://portail-admission.vercel.app";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/** La configuration relue à neuf, avec l'environnement voulu (lu au moment où Next appelle headers()). */
async function loadConfig(env: { nodeEnv?: string; portalIssuer?: string } = {}) {
  vi.stubEnv("NODE_ENV", env.nodeEnv ?? "production");
  vi.stubEnv("PORTAIL_ISSUER", env.portalIssuer ?? PORTAL_ISSUER);
  vi.resetModules();
  const config = (await import("../next.config")).default;
  const rules = ((await config.headers?.()) ?? []) as HeaderRule[];
  return { config, rules };
}

/** Les en-têtes de la règle unique, par nom en minuscules. */
async function loadHeaders(env?: Parameters<typeof loadConfig>[0]): Promise<Map<string, string>> {
  const { rules } = await loadConfig(env);
  expect(rules).toHaveLength(1);
  return new Map(rules[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

/** La CSP découpée : directive → sources. */
function parseCsp(value: string | undefined): Map<string, string[]> {
  expect(value, "en-tête Content-Security-Policy absent").toBeTruthy();
  return new Map(
    (value ?? "")
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((tokens) => tokens[0])
      .map(([name, ...sources]) => [name, sources])
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("D43 : en-têtes de sécurité", () => {
  it("une seule règle, qui couvre toutes les routes, pages et API", async () => {
    const { rules } = await loadConfig();
    expect(rules.map((rule) => rule.source)).toEqual(["/:path*"]);
  });

  it("nosniff, Referrer-Policy, cadrage limité à l'application, Permissions-Policy, HSTS", async () => {
    const headers = await loadHeaders();
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-frame-options")).toBe("SAMEORIGIN");

    const permissions = headers.get("permissions-policy") ?? "";
    for (const feature of ["camera=()", "microphone=()", "geolocation=()"]) {
      expect(permissions).toContain(feature);
    }

    const hsts = headers.get("strict-transport-security") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain("includeSubDomains");
  });

  it("Next ne s'annonce pas (X-Powered-By)", async () => {
    const { config } = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
  });
});

describe("D43 : Content-Security-Policy", () => {
  it("tout vient de l'application : aucune source extérieure, aucun joker", async () => {
    const csp = parseCsp((await loadHeaders()).get("content-security-policy"));
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(csp.get("font-src")).toEqual(["'self'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(csp.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'self'"]);

    for (const [directive, sources] of csp) {
      for (const source of sources) {
        expect(["*", "http:", "https:"], `${directive} ouvre ${source}`).not.toContain(source);
      }
    }
  });

  it("script-src : sans eval en production", async () => {
    const csp = parseCsp((await loadHeaders()).get("content-security-policy"));
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("script-src : eval permis en développement seulement (React s'en sert pour ses traces)", async () => {
    const csp = parseCsp((await loadHeaders({ nodeEnv: "development" })).get("content-security-policy"));
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
  });

  it("form-action : l'application et l'origine du portail, sans chemin, rien d'autre", async () => {
    const csp = parseCsp((await loadHeaders()).get("content-security-policy"));
    expect(csp.get("form-action")).toEqual(["'self'", PORTAL_ORIGIN]);
  });

  it("form-action sans émetteur du portail (Preview) : l'application seule", async () => {
    const csp = parseCsp((await loadHeaders({ portalIssuer: "" })).get("content-security-policy"));
    expect(csp.get("form-action")).toEqual(["'self'"]);
  });
});
