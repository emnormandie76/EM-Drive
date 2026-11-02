// GET /api/admin/vehicles/[id]/unavailabilities — Périodes en cours et à venir d'un véhicule (admin, avec commentaire)
// POST /api/admin/vehicles/[id]/unavailabilities — Déclarer une période (maintenance ou réservation Car Booking)

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, handleBusinessError } from "@/lib/api-helpers";
import { createUnavailability, listVehicleUnavailabilities } from "@/lib/services/unavailability-service";
import { createUnavailabilitySchema, parseJsonBody } from "@/lib/validators/request-schemas";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    return NextResponse.json(await listVehicleUnavailabilities(id, { admin: true }));
  } catch (error) {
    return handleBusinessError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await parseJsonBody(request, createUnavailabilitySchema);
    const created = await createUnavailability(
      { vehicleId: id, ...body },
      { sub: auth.session.user.sub, email: auth.session.user.email }
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    // Dont le 409 UNAVAILABILITY_TRIPS_CONFLICT et la liste des trajets (D60)
    return handleBusinessError(error);
  }
}
