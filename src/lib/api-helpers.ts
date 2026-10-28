// src/lib/api-helpers.ts — Helpers partagés pour les API Routes

import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth";
import { BusinessError } from "@/lib/utils/errors";

/**
 * Récupère la session authentifiée ou retourne une erreur 401.
 */
export async function requireAuthSession() {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "UNAUTHORIZED", message: "Non authentifié." }, { status: 401 }) };
  }
  return { session };
}

/**
 * Récupère la session et vérifie que l'utilisateur est admin, ou retourne 403.
 */
export async function requireAdminSession() {
  const result = await requireAuthSession();
  if ("error" in result) return result;

  const adminStatus = await isAdmin(result.session.user.sub);
  if (!adminStatus) {
    return { error: NextResponse.json({ error: "FORBIDDEN", message: "Accès administrateur requis." }, { status: 403 }) };
  }

  return { session: result.session, isAdmin: true };
}

/**
 * Convertit une BusinessError en réponse JSON avec le bon status code.
 */
export function handleBusinessError(error: unknown): NextResponse {
  if (error instanceof BusinessError) {
    return NextResponse.json(error.toJSON(), { status: error.statusCode });
  }

  console.error("[API] Unexpected error:", error);
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Une erreur interne est survenue." },
    { status: 500 }
  );
}
