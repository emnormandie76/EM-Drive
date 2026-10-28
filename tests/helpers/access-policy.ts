// tests/helpers/access-policy.ts — Table de référence des droits par route API
// Lue par tests/access-policy.test.ts contre le code ; reprise dans l'architecture §4.
//   public : aucune garde (NextAuth, ou la déconnexion, qui ne fait qu'effacer la session)
//   auth   : utilisateur connecté (requireAuthSession, ou getSession avec 401)
//   admin  : administrateur, rôle relu en base (requireAdminSession)
// Étape 2a : check-admin, admin/admins et admin/services sont retirés ; auth/logout arrive (D23).

export type Guard = "public" | "auth" | "admin";

export const ACCESS_POLICY: Record<string, Record<string, Guard>> = {
  "auth/[...nextauth]": { GET: "public", POST: "public" },
  "auth/logout": { POST: "public" },
  campuses: { GET: "auth" },
  vehicles: { GET: "auth" },
  "vehicles/[id]": { GET: "auth" },
  "vehicles/availability": { GET: "auth" },
  trips: { GET: "auth", POST: "auth" },
  "trips/[id]": { GET: "auth", PATCH: "auth", DELETE: "auth" },
  "trips/[id]/passengers": { POST: "auth" },
  "trips/[id]/passengers/[passengerId]": { DELETE: "auth" },
  "geo/autocomplete": { GET: "auth" },
  "geo/directions": { GET: "auth" },
  "users/search": { GET: "auth" },
  "admin/settings": { GET: "admin", PATCH: "admin" },
  "admin/trips": { GET: "admin" },
  "admin/audit": { GET: "admin" },
  "admin/vehicles": { POST: "admin" },
  "admin/vehicles/[id]": { PATCH: "admin" },
};
