// src/proxy.ts — Redirige vers /login les pages demandées sans session (ex-middleware.ts, convention de Next 16)
// Il vit dans src/, au niveau de app/ : à la racine, Next l'ignorait (D4).
// Les routes API sont exclues : leurs gardes (requireAuthSession) répondent 401 en JSON.
// Ce n'est qu'une vérification optimiste ; les gardes serveur restent la vraie protection.

import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  // Toutes les pages sauf login, unauthorized, les API et les ressources statiques
  matcher: ["/((?!login|unauthorized|api|_next/static|_next/image|favicon.ico).*)"],
};
