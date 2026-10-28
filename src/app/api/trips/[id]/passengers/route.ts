// POST /api/trips/[id]/passengers — Ajouter un passager
// DELETE handled via /api/trips/[id]/passengers/[passengerId]

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/auth";
import { addPassenger } from "@/lib/services/trip-service";
import { addPassengerSchema, parseJsonBody } from "@/lib/validators/request-schemas";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const { id: tripId } = await params;

  try {
    const body = await parseJsonBody(request, addPassengerSchema);
    const { entraId, email, name } = auth.session.user;
    const userIsAdmin = await isAdmin(entraId);

    if (body.addedBy === "SELF") {
      // L'utilisateur s'inscrit lui-même
      await addPassenger(tripId, entraId, email, name, "SELF", entraId, email, userIsAdmin);
    } else {
      // Ajout par le conducteur (ou un admin) : le service vérifie le droit d'ajouter
      await addPassenger(
        tripId,
        body.userEntraId!,
        body.userEmail!,
        body.userDisplayName!,
        "DRIVER",
        entraId,
        email,
        userIsAdmin
      );
    }

    return NextResponse.json({ message: "Passager ajouté." }, { status: 201 });
  } catch (error) {
    return handleBusinessError(error);
  }
}
