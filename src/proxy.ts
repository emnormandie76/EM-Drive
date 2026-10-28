// src/proxy.ts — Redirige vers /login les pages demandées sans session (ex-middleware.ts, convention de Next 16)
// Il vit dans src/, au niveau de app/ : à la racine, Next l'ignorait (D4).
// Les routes API sont exclues : leurs gardes (requireAuthSession) répondent 401 en JSON.
// Ce n'est qu'une vérification optimiste ; les gardes serveur restent la vraie protection.

import { withAuth } from "next-auth/middleware";
import { isSessionExpired, sessionCookieName } from "@/lib/auth-session";

export default withAuth({
  pages: { signIn: "/login" },
  // Le même nom que NextAuth (D12) : sans lui, withAuth lirait next-auth.session-token et toutes les pages
  // redirigeraient vers /login
  cookies: { sessionToken: { name: sessionCookieName() } },
  callbacks: {
    // 8 h fixes depuis la connexion : un jeton relu entre-temps a vu son expiration repoussée (piège 11)
    authorized: ({ token }) => token !== null && !isSessionExpired(token.signedInAt),
  },
});

export const config = {
  // Toutes les pages sauf login, unauthorized, les API et les ressources statiques
  matcher: ["/((?!login|unauthorized|api|_next/static|_next/image|favicon.ico).*)"],
};
