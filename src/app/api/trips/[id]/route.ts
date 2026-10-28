// GET /api/trips/[id] — Détail d'un trajet
// PATCH /api/trips/[id] — Modifier l'heure de départ
// DELETE /api/trips/[id] — Annuler un trajet

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/auth";
import { getTripById, cancelTrip, updateDepartureTime, updateTripInfo, type TripInfoUpdate } from "@/lib/services/trip-service";
import { resolveChosenPerson, type PersonIdentity } from "@/lib/portail-directory";
import { getTripDisplayStatus } from "@/lib/utils/dates";
import { canDeleteTrip, canModifyDepartureTime, canJoinAsPassenger } from "@/lib/validators/permission-checker";
import { parseJsonBody, updateTripSchema, type UpdateTripInput } from "@/lib/validators/request-schemas";
import { ValidationError } from "@/lib/utils/errors";

/** Champs qu'un PATCH « horaire » peut porter ; tout autre champ envoyé par un admin passe par updateTripInfo. */
const TIME_ONLY_FIELDS = ["departureTime", "estimatedArrivalTime", "returnDepartureTime", "estimatedReturnArrivalTime", "status"];

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Écart 5 (D24) : un nouveau conducteur est vérifié dans l'annuaire, qui donne son nom et son adresse ; un
 * conducteur inchangé (la modale admin le renvoie à chaque enregistrement) garde ses valeurs en base, sans appel.
 */
async function withVerifiedDriver(tripId: string, body: UpdateTripInput, caller: PersonIdentity): Promise<TripInfoUpdate> {
  const { driverSub, driverEmail, ...rest } = body;
  if (!driverSub) return rest;

  const trip = await getTripById(tripId);
  if (!trip || trip.driverSub === driverSub) return rest;

  const driver = await resolveChosenPerson({ sub: driverSub, email: driverEmail }, caller);
  return { ...rest, driverSub: driver.sub, driverEmail: driver.email, driverDisplayName: driver.name };
}

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
    const { sub, email, name } = auth.session.user;
    const userIsAdmin = await isAdmin(sub);

    // Si c'est un admin et qu'on modifie autre chose que l'heure de départ
    if (userIsAdmin && Object.keys(body).some((key) => !TIME_ONLY_FIELDS.includes(key))) {
      const updated = await updateTripInfo(
        id,
        await withVerifiedDriver(id, body, { sub, email, name }),
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
