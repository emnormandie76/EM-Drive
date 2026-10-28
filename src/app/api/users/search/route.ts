// GET /api/users/search?q=... — Recherche d'utilisateurs
// SIMULATION gardée jusqu'à l'étape 2b du plan : la recherche passera alors par l'annuaire du portail
// (contrat portail v1 §3.7), qui rend le vrai sub, le nom et l'adresse des personnes ayant accès.

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession } from "@/lib/api-helpers";

// Personnes simulées : leurs sub ne correspondent à personne du portail (étape 2b)
const DEV_USERS = [
  { sub: "dev-sub-admin", displayName: "Admin Dev", email: "admin@entreprise.fr" },
  { sub: "dev-sub-001", displayName: "Jean Dupont", email: "jean.dupont@entreprise.fr" },
  { sub: "dev-sub-002", displayName: "Marie Martin", email: "marie.martin@entreprise.fr" },
];

export async function GET(request: NextRequest) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const q = request.nextUrl.searchParams.get("q")?.toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const results = DEV_USERS.filter(
    (u) =>
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
  );

  return NextResponse.json(results);
}
