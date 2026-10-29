import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthSession } from "@/lib/api-helpers";

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

    return NextResponse.json(vehicle);
  } catch (error) {
    console.error("[API] GET /api/vehicles/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Erreur serveur" }, { status: 500 });
  }
}
