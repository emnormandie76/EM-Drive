// src/types/next-auth.d.ts — Extension des types NextAuth
// Ajoute les champs personnalisés à la session et au token JWT (connexion par le portail, contrat portail v1).

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  /** Ce que profile() du fournisseur « portail » rend : id = sub du portail. */
  interface User {
    role?: string;
  }

  interface Session {
    user: {
      sub: string;
      email: string;
      name: string;
      image?: string;
      isAdmin?: boolean; // affichage seulement : les gardes relisent le rôle en base (piège 7)
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    signedInAt?: number; // heure de connexion, en secondes : la session est refusée 8 h après
    idToken?: string; // id_token du portail, pour la déconnexion (id_token_hint) ; jamais exposé au navigateur
  }
}
