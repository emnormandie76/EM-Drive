// src/lib/auth.ts — Configuration NextAuth : connexion par le portail admission (G9, contrat portail v1)
// Un seul fournisseur, OIDC « portail ». NextAuth v4 ne suit pas le contrat sans réglage (piège 11) :
// vérifications, authentification du client, session de 8 h fixes, cookies, déconnexion (route logout).

import type { NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { getServerSession } from "next-auth";
import { prisma } from "./prisma";
import { reconcilePerson } from "./services/person-service";
import { SESSION_MAX_AGE_SECONDS, authCookies, isSessionExpired, nowInSeconds, usesSecureCookies } from "./auth-session";
import { portalDiscoveryUrl } from "./portail";

// ══════════════════════════════════════════════
// FOURNISSEUR OIDC DU PORTAIL
// ══════════════════════════════════════════════

/** Les champs du jeton d'identité sur lesquels EM Drive s'appuie (contrat §3.4). */
interface PortalProfile extends Record<string, unknown> {
  sub: string;
  email: string;
  name?: string;
  role?: string;
}

/**
 * Le retour se fait sur /api/auth/callback/portail (adresse exacte déclarée au portail, D12).
 * `checks` et `idToken` sont écrits : NextAuth ne pose ses valeurs par défaut (checks ["state"])
 * que s'ils manquent (core/lib/providers.js).
 */
function portalProvider(): OAuthConfig<PortalProfile> {
  return {
    id: "portail",
    name: "Portail admission",
    type: "oauth",
    wellKnown: portalDiscoveryUrl(),
    clientId: process.env.PORTAIL_CLIENT_ID,
    clientSecret: process.env.PORTAIL_CLIENT_SECRET,
    // Pas d'offline_access : le portail le refuse, et EM Drive ne garde aucun jeton de rafraîchissement
    authorization: { params: { scope: "openid profile email" } },
    checks: ["pkce", "state", "nonce"],
    idToken: true,
    client: { token_endpoint_auth_method: "client_secret_basic" },
    profile(profile) {
      return { id: profile.sub, email: profile.email, name: profile.name ?? null, role: profile.role };
    },
  };
}

// ══════════════════════════════════════════════
// CONFIGURATION NEXTAUTH
// ══════════════════════════════════════════════

const secureCookies = usesSecureCookies();

export const authOptions: NextAuthOptions = {
  providers: [portalProvider()],

  pages: {
    signIn: "/login",
    // Une erreur OIDC revient sur /login?error=… : la page affiche un message neutre, sans relancer le flux
    error: "/login",
  },

  callbacks: {
    /** Rapprochement du compte local (contrat §3.2, D22) ; un refus est consigné et renvoyé vers /unauthorized. */
    async signIn({ user }) {
      const result = await reconcilePerson({ sub: user.id, email: user.email, name: user.name, role: user.role });
      return result.allowed ? true : "/unauthorized";
    },

    /**
     * À la connexion : sub, rôle (affichage seulement, piège 7), heure de connexion et id_token (déconnexion).
     * À chaque lecture : refus 8 h après la connexion, car NextAuth repousse l'expiration du jeton (piège 11).
     */
    async jwt({ token, user, account }) {
      if (account && user) {
        token.sub = user.id;
        token.role = user.role;
        token.signedInAt = nowInSeconds();
        token.idToken = account.id_token;
        return token;
      }
      if (isSessionExpired(token.signedInAt)) {
        throw new Error("SESSION_EXPIRED");
      }
      return token;
    },

    /** La session vue du navigateur : jamais l'id_token ; l'expiration réelle, 8 h après la connexion. */
    async session({ session, token }) {
      session.user = {
        sub: token.sub ?? "",
        email: token.email ?? "",
        name: token.name ?? "",
        isAdmin: token.role === "ADMIN",
      };
      if (typeof token.signedInAt === "number") {
        session.expires = new Date((token.signedInAt + SESSION_MAX_AGE_SECONDS) * 1000).toISOString();
      }
      return session;
    },
  },

  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },

  // Cookies renommés (D12) ; src/proxy.ts et la route de déconnexion lisent le même nom
  useSecureCookies: secureCookies,
  cookies: authCookies(secureCookies),

  secret: process.env.NEXTAUTH_SECRET,
};

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════

/**
 * Récupère la session côté serveur (App Router).
 * À utiliser dans les Server Components et les API Routes.
 */
export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Vrai si la personne a le rôle ADMIN, relu en base (règle 9) : le rôle recopié du portail à sa
 * dernière connexion, jamais celui du jeton.
 */
export async function isAdmin(sub: string): Promise<boolean> {
  const person = await prisma.person.findUnique({ where: { sub }, select: { role: true } });
  return person?.role === "ADMIN";
}
