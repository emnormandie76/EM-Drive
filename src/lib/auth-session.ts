// src/lib/auth-session.ts — Durée de session et cookies d'EM Drive (contrat portail v1 §3.2, D12, D54)
// Sans Prisma : lu à la fois par la configuration NextAuth (src/lib/auth.ts), le proxy et la déconnexion.

import type { CookiesOptions } from "next-auth";

/** Une session dure 8 h au plus, comptées depuis la connexion et jamais prolongées (contrat §3.2). */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Préfixe propre à EM Drive (conservé à « resavroom », D54) : sur localhost, les cookies valent pour tous les ports (piège 11, D12). */
const COOKIE_PREFIX = "resavroom";

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Vrai si la session est trop vieille : 8 h depuis la connexion, ou heure de connexion absente.
 * NextAuth repousse l'expiration du jeton à chaque lecture (piège 11) : cette heure-là ne bouge pas.
 */
export function isSessionExpired(signedInAt: unknown, now: number = nowInSeconds()): boolean {
  if (typeof signedInAt !== "number") return true;
  return now - signedInAt >= SESSION_MAX_AGE_SECONDS;
}

/** Cookies sécurisés dès que l'application est servie en https (comme le fait NextAuth). */
export function usesSecureCookies(): boolean {
  return (process.env.NEXTAUTH_URL ?? "").startsWith("https://");
}

/** Les cookies de NextAuth, renommés ; mêmes options que ses valeurs par défaut (core/lib/cookie.js). */
export function authCookies(secure: boolean): CookiesOptions {
  const prefix = secure ? "__Secure-" : "";
  const options = { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
  return {
    sessionToken: { name: `${prefix}${COOKIE_PREFIX}.session-token`, options },
    callbackUrl: { name: `${prefix}${COOKIE_PREFIX}.callback-url`, options },
    csrfToken: { name: `${secure ? "__Host-" : ""}${COOKIE_PREFIX}.csrf-token`, options },
    pkceCodeVerifier: { name: `${prefix}${COOKIE_PREFIX}.pkce.code_verifier`, options: { ...options, maxAge: 60 * 15 } },
    state: { name: `${prefix}${COOKIE_PREFIX}.state`, options: { ...options, maxAge: 60 * 15 } },
    nonce: { name: `${prefix}${COOKIE_PREFIX}.nonce`, options },
  };
}

/** Le nom du cookie de session : le proxy et la déconnexion doivent lire le même que NextAuth. */
export function sessionCookieName(secure: boolean = usesSecureCookies()): string {
  return authCookies(secure).sessionToken.name;
}
