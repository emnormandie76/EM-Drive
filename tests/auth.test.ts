// tests/auth.test.ts — Connexion par le portail (contrat portail v1, étape 2a) : fournisseur OIDC,
// rapprochement du contrat §3.2, rôle recopié, session de 8 h fixes, cookies renommés, garde administrateur.
// Aucun réseau : les rappels de authOptions sont appelés directement, Prisma est simulé.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Variables lues au chargement de src/lib/auth.ts : posées avant tout import
vi.hoisted(() => {
  process.env.PORTAIL_ISSUER = "https://portail.test/api/auth";
  process.env.PORTAIL_CLIENT_ID = "resavroom-dev";
  process.env.PORTAIL_CLIENT_SECRET = "secret-de-test";
  process.env.NEXTAUTH_URL = "http://localhost:3002";
});

vi.mock("@/lib/prisma", async () => {
  const { createPrismaMock } = await import("./helpers/prisma-mock");
  return { prisma: createPrismaMock() };
});
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth")>()),
  getServerSession: vi.fn(),
}));

import { getServerSession, type Account, type CallbacksOptions, type Session, type User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { prisma } from "@/lib/prisma";
import { authOptions, isAdmin } from "@/lib/auth";
import { requireAdminSession } from "@/lib/api-helpers";
import { SESSION_MAX_AGE_SECONDS, authCookies } from "@/lib/auth-session";
import { resetPrismaMock, type PrismaMock } from "./helpers/prisma-mock";

const db = prisma as unknown as PrismaMock;
const callbacks = authOptions.callbacks as CallbacksOptions;
const provider = authOptions.providers[0] as unknown as OAuthConfig<Record<string, unknown>>;

const T0 = new Date("2026-11-02T08:00:00.000Z");
const HOUR = 60 * 60 * 1000;

/** Ce que le fournisseur rend après profile() : l'identité du jeton d'identité du portail (contrat §3.4). */
function portalUser(overrides: Partial<User> = {}): User {
  return { id: "sub-anne", email: "anne.martin@em-normandie.fr", name: "Anne Martin", role: "USER", ...overrides };
}

function portalAccount(): Account {
  return { provider: "portail", type: "oauth", providerAccountId: "sub-anne", id_token: "id-token-anne" };
}

function signIn(user: User = portalUser()) {
  return callbacks.signIn({ user, account: portalAccount(), profile: { sub: user.id } });
}

function jwtAtSignIn(user: User = portalUser()) {
  const token: JWT = { sub: user.id, email: user.email, name: user.name };
  return callbacks.jwt({ token, user, account: portalAccount(), profile: { sub: user.id }, trigger: "signIn" });
}

/** Une lecture de la session, plus tard : NextAuth rappelle jwt sans compte (core/routes/session.js). */
function jwtOnRead(token: JWT) {
  return callbacks.jwt({ token } as Parameters<CallbacksOptions["jwt"]>[0]);
}

function person(overrides: Record<string, unknown> = {}) {
  return {
    id: "person-anne",
    sub: "sub-anne",
    email: "anne.martin@em-normandie.fr",
    name: "Anne Martin",
    role: "USER",
    lastLoginAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetPrismaMock(db);
  db.person.findUnique.mockResolvedValue(null);
  db.person.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "person-new", ...data }));
  db.person.update.mockImplementation(async ({ data }: { data: object }) => ({ ...person(), ...data }));
  vi.mocked(getServerSession).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fournisseur OIDC « portail » (contrat §3.3, piège 11)", () => {
  it("est le seul fournisseur : plus de connexion de développement (cas limite 5)", () => {
    expect(authOptions.providers).toHaveLength(1);
    expect(provider.id).toBe("portail");
    expect(provider.type).toBe("oauth");
  });

  it("lit la découverte de l'émetteur, sans adresse de route écrite en dur", () => {
    expect(provider.wellKnown).toBe("https://portail.test/api/auth/.well-known/openid-configuration");
    expect(provider).not.toHaveProperty("token");
    expect(provider).not.toHaveProperty("userinfo");
  });

  it("exige PKCE, state et nonce, et lit le jeton d'identité", () => {
    // NextAuth ne pose ses valeurs par défaut (checks ["state"]) que si le fournisseur n'en donne pas
    expect(provider.checks).toEqual(["pkce", "state", "nonce"]);
    expect(provider.idToken).toBe(true);
  });

  it("s'authentifie en client_secret_basic, avec le client de l'environnement", () => {
    expect(provider.client).toMatchObject({ token_endpoint_auth_method: "client_secret_basic" });
    expect(provider.clientId).toBe("resavroom-dev");
    expect(provider.clientSecret).toBe("secret-de-test");
  });

  it("demande openid profile email, sans offline_access", () => {
    const authorization = provider.authorization as { params: { scope: string } };
    expect(authorization.params.scope).toBe("openid profile email");
    expect(authorization.params.scope).not.toContain("offline_access");
  });

  it("profile() lit sub, email, name et role", async () => {
    const claims = { sub: "sub-anne", email: "anne.martin@em-normandie.fr", name: "Anne Martin", role: "ADMIN", email_verified: false };
    expect(await provider.profile(claims, {})).toEqual({
      id: "sub-anne",
      email: "anne.martin@em-normandie.fr",
      name: "Anne Martin",
      role: "ADMIN",
    });
  });

  it("renvoie les erreurs vers /login, qui ne relance pas le flux (contrat §3.6)", () => {
    expect(authOptions.pages).toMatchObject({ signIn: "/login", error: "/login" });
  });
});

describe("rapprochement du compte local (contrat §3.2)", () => {
  it("1. retrouve la personne par sub et met à jour adresse, nom, rôle et heure de connexion", async () => {
    vi.useFakeTimers({ now: T0 });
    db.person.findUnique.mockImplementation(async ({ where }: { where: { sub?: string } }) =>
      where.sub === "sub-anne" ? person({ email: "ancienne@em-normandie.fr", name: "Ancien nom" }) : null
    );

    expect(await signIn()).toBe(true);
    expect(db.person.update).toHaveBeenCalledWith({
      where: { id: "person-anne" },
      data: { email: "anne.martin@em-normandie.fr", name: "Anne Martin", role: "USER", lastLoginAt: T0 },
    });
    expect(db.person.create).not.toHaveBeenCalled();
  });

  it("2. sinon la retrouve par l'adresse et y enregistre le sub", async () => {
    db.person.findUnique.mockImplementation(async ({ where }: { where: { sub?: string; email?: string } }) =>
      where.email === "anne.martin@em-normandie.fr" ? person({ sub: null }) : null
    );

    expect(await signIn()).toBe(true);
    expect(db.person.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "person-anne" }, data: expect.objectContaining({ sub: "sub-anne" }) })
    );
    expect(db.person.create).not.toHaveBeenCalled();
  });

  it("3. sinon la crée", async () => {
    vi.useFakeTimers({ now: T0 });
    expect(await signIn()).toBe(true);
    expect(db.person.create).toHaveBeenCalledWith({
      data: { sub: "sub-anne", email: "anne.martin@em-normandie.fr", name: "Anne Martin", role: "USER", lastLoginAt: T0 },
    });
  });

  it("refuse une adresse liée à un autre sub, vers /unauthorized, et le consigne", async () => {
    db.person.findUnique.mockImplementation(async ({ where }: { where: { sub?: string; email?: string } }) =>
      where.email === "anne.martin@em-normandie.fr" ? person({ id: "person-autre", sub: "sub-autre" }) : null
    );

    expect(await signIn()).toBe("/unauthorized");
    expect(db.person.update).not.toHaveBeenCalled();
    expect(db.person.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userSub: "sub-anne",
        userEmail: "anne.martin@em-normandie.fr",
        action: "SIGNIN_REFUSED",
        entityType: "person",
        entityId: "person-autre",
      }),
    });
  });

  it("refuse aussi une nouvelle adresse déjà portée par une autre personne", async () => {
    db.person.findUnique.mockImplementation(async ({ where }: { where: { sub?: string; email?: string } }) => {
      if (where.sub === "sub-anne") return person({ email: "ancienne@em-normandie.fr" });
      if (where.email === "anne.martin@em-normandie.fr") return person({ id: "person-autre", sub: "sub-autre" });
      return null;
    });

    expect(await signIn()).toBe("/unauthorized");
    expect(db.person.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "SIGNIN_REFUSED", entityId: "person-autre" }),
    });
  });

  it("recopie le rôle reçu à chaque connexion, même s'il retire l'administration", async () => {
    db.person.findUnique.mockImplementation(async ({ where }: { where: { sub?: string } }) =>
      where.sub === "sub-anne" ? person({ role: "ADMIN" }) : null
    );

    expect(await signIn(portalUser({ role: "USER" }))).toBe(true);
    expect(db.person.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "USER" }) })
    );
  });

  it("refuse un rôle que ResaVroom n'a pas déclaré, sans rien écrire sur la personne (D20)", async () => {
    expect(await signIn(portalUser({ role: "GESTIONNAIRE" }))).toBe("/unauthorized");
    expect(db.person.findUnique).not.toHaveBeenCalled();
    expect(db.person.update).not.toHaveBeenCalled();
    expect(db.person.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "SIGNIN_REFUSED", userSub: "sub-anne" }),
    });
  });

  it("refuse un profil sans sub ou sans adresse", async () => {
    expect(await signIn(portalUser({ id: "" }))).toBe("/unauthorized");
    expect(await signIn(portalUser({ email: null }))).toBe("/unauthorized");
    expect(db.person.create).not.toHaveBeenCalled();
  });
});

describe("session de 8 h fixes depuis la connexion (contrat §3.2)", () => {
  it("dure 8 h au plus", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(8 * 60 * 60);
    expect(authOptions.session).toMatchObject({ strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS });
  });

  it("le jeton garde le sub, le rôle, l'heure de connexion et l'id_token", async () => {
    vi.useFakeTimers({ now: T0 });
    const token = await jwtAtSignIn(portalUser({ role: "ADMIN" }));
    expect(token).toMatchObject({
      sub: "sub-anne",
      role: "ADMIN",
      signedInAt: T0.getTime() / 1000,
      idToken: "id-token-anne",
    });
  });

  it("est refusée 8 h après la connexion, même relue entre-temps", async () => {
    vi.useFakeTimers({ now: T0 });
    const token = await jwtAtSignIn();

    vi.setSystemTime(T0.getTime() + 4 * HOUR);
    const reread = await jwtOnRead(token);
    expect(reread.signedInAt).toBe(T0.getTime() / 1000); // la relecture ne repousse rien

    vi.setSystemTime(T0.getTime() + 8 * HOUR - 1000);
    await expect(jwtOnRead(reread)).resolves.toMatchObject({ sub: "sub-anne" });

    vi.setSystemTime(T0.getTime() + 8 * HOUR);
    await expect(jwtOnRead(reread)).rejects.toThrow();
  });

  it("refuse un jeton sans heure de connexion", async () => {
    await expect(jwtOnRead({ sub: "sub-anne" })).rejects.toThrow();
  });

  it("la session exposée au navigateur n'a pas l'id_token, et expire 8 h après la connexion", async () => {
    vi.useFakeTimers({ now: T0 });
    const token = await jwtAtSignIn(portalUser({ role: "ADMIN" }));
    const session = (await callbacks.session({
      session: { user: { name: "Anne Martin", email: "anne.martin@em-normandie.fr" }, expires: "2099-01-01T00:00:00.000Z" },
      token,
    } as Parameters<CallbacksOptions["session"]>[0])) as Session;

    expect(session.user).toMatchObject({ sub: "sub-anne", email: "anne.martin@em-normandie.fr", isAdmin: true });
    expect(JSON.stringify(session)).not.toContain("id-token-anne");
    expect(session.expires).toBe(new Date(T0.getTime() + 8 * HOUR).toISOString());
  });
});

describe("cookies propres à ResaVroom (D12)", () => {
  it("renomme tous les cookies de NextAuth, en http sur le poste", () => {
    const cookies = authOptions.cookies!;
    expect(cookies.sessionToken!.name).toBe("resavroom.session-token");
    for (const cookie of Object.values(cookies)) {
      expect(cookie!.name).toMatch(/^resavroom\./);
      expect(cookie!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    }
  });

  it("prend les préfixes __Secure- et __Host- en https", () => {
    const cookies = authCookies(true);
    expect(cookies.sessionToken.name).toBe("__Secure-resavroom.session-token");
    expect(cookies.csrfToken.name).toBe("__Host-resavroom.csrf-token");
    for (const cookie of Object.values(cookies)) {
      expect(cookie.options.secure).toBe(true);
    }
  });
});

describe("rôle relu en base (règle 9)", () => {
  it("isAdmin lit le rôle de la personne par son sub", async () => {
    db.person.findUnique.mockResolvedValueOnce({ role: "ADMIN" });
    expect(await isAdmin("sub-anne")).toBe(true);
    expect(db.person.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { sub: "sub-anne" } }));

    db.person.findUnique.mockResolvedValueOnce({ role: "USER" });
    expect(await isAdmin("sub-anne")).toBe(false);

    db.person.findUnique.mockResolvedValueOnce(null);
    expect(await isAdmin("sub-inconnu")).toBe(false);
  });

  it("la garde administrateur suit la base, pas le jeton", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { sub: "sub-anne", email: "anne.martin@em-normandie.fr", name: "Anne Martin", isAdmin: true },
      expires: "2099-01-01T00:00:00.000Z",
    });

    db.person.findUnique.mockResolvedValueOnce({ role: "USER" });
    const refused = await requireAdminSession();
    expect("error" in refused ? refused.error?.status : 200).toBe(403);

    db.person.findUnique.mockResolvedValueOnce({ role: "ADMIN" });
    const allowed = await requireAdminSession();
    expect("error" in allowed).toBe(false);
  });

  it("sans session, la garde répond 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const result = await requireAdminSession();
    expect("error" in result ? result.error?.status : 200).toBe(401);
  });
});
