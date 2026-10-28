// GET /api/users/search?q=... — Recherche de collègues dans l'annuaire du portail (contrat portail v1 §7)
// Rend [{ sub, name, email }] des personnes qui ont accès à ResaVroom (D26) ; [] si q fait moins de deux
// caractères. Annuaire fermé ou muet : 503 DIRECTORY_UNAVAILABLE ; trop de requêtes : 429 (D25).

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { searchDirectory } from "@/lib/portail-directory";

export async function GET(request: NextRequest) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  try {
    return NextResponse.json(await searchDirectory(request.nextUrl.searchParams.get("q") ?? ""));
  } catch (error) {
    return handleBusinessError(error);
  }
}
