// GET /api/trips/[id] — Détail d'un trajet
// PATCH /api/trips/[id] — Modifier l'heure de départ
// DELETE /api/trips/[id] — Annuler un trajet

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/auth";
import { getTripById, cancelTrip, updateDepartureTime, updateTripInfo } from "@/lib/services/trip-service";
import { getTripDisplayStatus } from "@/lib/utils/dates";
import { canDeleteTrip, canModifyDepartureTime, canJoinAsPassenger } from "@/lib/validators/permission-checker";
import { parseJsonBody, updateTripSchema } from "@/lib/validators/request-schemas";
import { ValidationError } from "@/lib/utils/errors";

/** Champs qu'un PATCH « horaire » peut porter ; tout autre champ envoyé par un admin passe par updateTripInfo. */
const TIME_ONLY_FIELDS = ["departureTime", "estimatedArrivalTime", "returnDepartureTime", "estimatedReturnArrivalTime", "status"];

type RouteParams = { params: Promise<{ id: string }> };

// ══════════════════════════════════════════════
// GET /api/trips/[id]
// ══════════════════════════════════════════════

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const trip = await getTripById(id);

  if (!trip) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Trajet non trouvé." },
      { status: 404 }
    );
  }

  const userSub = auth.session.user.sub;
  const userIsAdmin = await isAdmin(userSub);

  // Calculer les permissions pour l'utilisateur connecté
  const permissions = {
    canDelete: canDeleteTrip(trip, userSub, userIsAdmin).allowed,
    canModifyDeparture: canModifyDepartureTime(trip, userSub, userIsAdmin).allowed,
    canJoinAsPassenger: canJoinAsPassenger(
      { ...trip, vehicleSeats: trip.vehicle.seats },
      userSub
    ).allowed,
  };

  return NextResponse.json({
    ...trip,
    displayStatus: getTripDisplayStatus(trip),
    seatsAvailable: trip.vehicle.seats - 1 - trip.passengers.length,
    driver: {
      sub: trip.driverSub,
      email: trip.driverEmail,
      displayName: trip.driverDisplayName,
    },
    permissions,
  });
}

// ══════════════════════════════════════════════
// PATCH /api/trips/[id]
// ══════════════════════════════════════════════

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await parseJsonBody(request, updateTripSchema);
    const userIsAdmin = await isAdmin(auth.session.user.sub);

    // Si c'est un admin et qu'on modifie autre chose que l'heure de départ
    if (userIsAdmin && Object.keys(body).some((key) => !TIME_ONLY_FIELDS.includes(key))) {
      const updated = await updateTripInfo(
        id,
        body,
        auth.session.user.sub,
        auth.session.user.email,
        userIsAdmin
      );
      return NextResponse.json(updated);
    }

    if (!body.departureTime) {
      throw new ValidationError("departureTime : l'heure de départ est requise.");
    }

    const updated = await updateDepartureTime(
      id,
      body.departureTime,
      auth.session.user.sub,
      auth.session.user.email,
      userIsAdmin
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleBusinessError(error);
  }
}

// ══════════════════════════════════════════════
// DELETE /api/trips/[id]
// ══════════════════════════════════════════════

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const userIsAdmin = await isAdmin(auth.session.user.sub);

    await cancelTrip(
      id,
      auth.session.user.sub,
      auth.session.user.email,
      userIsAdmin
    );

    return NextResponse.json({ message: "Trajet annulé." });
  } catch (error) {
    return handleBusinessError(error);
  }
}
