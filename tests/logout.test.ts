// tests/logout.test.ts — Déconnexion par le portail (contrat §3.8, D23) : la route efface la session puis
// renvoie vers end_session_endpoint, lu dans la découverte. Aucun réseau : fetch est simulé.

import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PORTAIL_ISSUER = "https://portail.test/api/auth";
  process.env.PORTAIL_CLIENT_ID = "resavroom-dev";
  process.env.NEXTAUTH_URL = "http://localhost:3002";
  process.env.NEXTAUTH_SECRET = "secret-de-test-pour-les-jetons";
});

import { POST as logout } from "@/app/api/auth/logout/route";

const DISCOVERY = "https://portail.test/api/auth/.well-known/openid-configuration";
const END_SESSION = "https://portail.test/api/auth/session/end";
const fetchMock = vi.fn();

async function sessionCookie(token: Record<string, unknown>) {
  return encode({ token, secret: process.env.NEXTAUTH_SECRET! });
}

function request(cookie?: string) {
  return new NextRequest("http://localhost:3002/api/auth/logout", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

function discovery(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Les cookies effacés par la réponse (valeur vide, Max-Age=0). */
function clearedCookies(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((line) => /Max-Age=0/i.test(line))
    .map((line) => line.split("=")[0]);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/auth/logout", () => {
  it("efface la session puis renvoie vers end_session_endpoint avec id_token_hint, client_id et post_logout_redirect_uri", async () => {
    fetchMock.mockResolvedValue(discovery({ end_session_endpoint: END_SESSION }));
    const cookie = await sessionCookie({ sub: "sub-anne", idToken: "id-token-anne", signedInAt: 1 });

    const response = await logout(request(`resavroom.session-token=${cookie}`));

    expect(fetchMock).toHaveBeenCalledWith(DISCOVERY, expect.anything());
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("Location")!);
    expect(`${location.origin}${location.pathname}`).toBe(END_SESSION);
    expect(Object.fromEntries(location.searchParams)).toEqual({
      id_token_hint: "id-token-anne",
      client_id: "resavroom-dev",
      post_logout_redirect_uri: "http://localhost:3002/login",
    });
    expect(clearedCookies(response)).toContain("resavroom.session-token");
  });

  it("sans session, renvoie vers /login sans appeler le portail", async () => {
    const response = await logout(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3002/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("efface tous les morceaux du cookie de session", async () => {
    const response = await logout(request("resavroom.session-token.0=morceau-a; resavroom.session-token.1=morceau-b"));
    expect(clearedCookies(response)).toEqual(
      expect.arrayContaining(["resavroom.session-token.0", "resavroom.session-token.1"])
    );
  });

  it("si le portail ne répond pas, efface quand même la session et renvoie vers /login", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("réseau coupé"));
    const cookie = await sessionCookie({ sub: "sub-anne", idToken: "id-token-anne", signedInAt: 1 });

    const response = await logout(request(`resavroom.session-token=${cookie}`));
    expect(response.headers.get("Location")).toBe("http://localhost:3002/login");
    expect(clearedCookies(response)).toContain("resavroom.session-token");
  });

  it("refuse une adresse de déconnexion hors de l'émetteur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(discovery({ end_session_endpoint: "https://ailleurs.test/logout" }));
    const cookie = await sessionCookie({ sub: "sub-anne", idToken: "id-token-anne", signedInAt: 1 });

    const response = await logout(request(`resavroom.session-token=${cookie}`));
    expect(response.headers.get("Location")).toBe("http://localhost:3002/login");
  });
});
