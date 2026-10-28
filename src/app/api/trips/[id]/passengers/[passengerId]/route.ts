// DELETE /api/trips/[id]/passengers/[passengerId] — Retirer un passager

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/auth";
import { removePassenger } from "@/lib/services/trip-service";

type RouteParams = { params: Promise<{ id: string; passengerId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const { id: tripId, passengerId } = await params;

  try {
    const userIsAdmin = await isAdmin(auth.session.user.sub);

    await removePassenger(
      tripId,
      passengerId,
      auth.session.user.sub,
      auth.session.user.email,
      userIsAdmin
    );

    return NextResponse.json({ message: "Passager retiré." });
  } catch (error) {
    return handleBusinessError(error);
  }
}
