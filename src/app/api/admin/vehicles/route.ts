// POST /api/admin/vehicles — Ajouter un véhicule
// PATCH /api/admin/vehicles/[id] — Modifier un véhicule

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, handleBusinessError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit-service";
import { createVehicleSchema, parseJsonBody } from "@/lib/validators/request-schemas";

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  try {
    const body = await parseJsonBody(request, createVehicleSchema);

    const vehicle = await prisma.vehicle.create({
      data: {
        name: body.name,
        licensePlate: body.licensePlate,
        seats: body.seats,
        status: body.status ?? "AVAILABLE",
        defaultCampusId: body.defaultCampusId,
      },
    });

    await logAudit({
      userEntraId: auth.session.user.entraId,
      userEmail: auth.session.user.email,
      action: "VEHICLE_CREATED",
      entityType: "vehicle",
      entityId: vehicle.id,
      details: { name: vehicle.name, licensePlate: vehicle.licensePlate },
    });

    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    return handleBusinessError(error);
  }
}
