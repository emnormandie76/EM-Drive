// GET /api/users/search?q=... — Recherche de collègues dans l'annuaire du portail (contrat portail v1 §7)
// Rend [{ sub, name, email }] des personnes qui ont accès à EM Drive (D26) ; [] si q fait moins de deux
// caractères. Annuaire fermé ou muet : 503 DIRECTORY_UNAVAILABLE ; trop de requêtes : 429 (D25). Débit limité
// par personne avant l'appel à l'annuaire, qui sert toutes les applications du portail (D44) : 429 RATE_LIMITED.

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { searchDirectory } from "@/lib/portail-directory";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  // Sous deux caractères, searchDirectory n'appelle pas l'annuaire : la requête ne compte pas
  if (q.trim().length >= 2) {
    const limited = rateLimit("userSearch", auth.session.user.sub);
    if (limited) return limited;
  }

  try {
    return NextResponse.json(await searchDirectory(q));
  } catch (error) {
    return handleBusinessError(error);
  }
}
