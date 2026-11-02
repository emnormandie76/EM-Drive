// GET /api/vehicles/[id] — Un véhicule et ses périodes d'indisponibilité en cours et à venir (calendrier)
// Tout utilisateur connecté lit le motif et les dates ; le commentaire et l'auteur restent aux admins (D67).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { requireAuthSession } from "@/lib/api-helpers";
import { readVehicleUnavailabilities } from "@/lib/services/unavailability-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        defaultCampus: true,
      }
    });

    if (!vehicle) {
      return NextResponse.json({ error: "NOT_FOUND", message: "Véhicule non trouvé" }, { status: 404 });
    }

    // Rôle relu en base, jamais déduit du jeton (règle 9)
    const unavailabilities = await readVehicleUnavailabilities(id, { admin: await isAdmin(auth.session.user.sub) });

    return NextResponse.json({ ...vehicle, unavailabilities });
  } catch (error) {
    console.error("[API] GET /api/vehicles/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Erreur serveur" }, { status: 500 });
  }
}
