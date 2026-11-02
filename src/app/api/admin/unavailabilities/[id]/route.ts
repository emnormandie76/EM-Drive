// PATCH /api/admin/unavailabilities/[id] — Modifier une période (dates, motif, commentaire ; D68)
// DELETE /api/admin/unavailabilities/[id] — Retirer une période

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, handleBusinessError } from "@/lib/api-helpers";
import { deleteUnavailability, updateUnavailability } from "@/lib/services/unavailability-service";
import { parseJsonBody, updateUnavailabilitySchema } from "@/lib/validators/request-schemas";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await parseJsonBody(request, updateUnavailabilitySchema);
    const updated = await updateUnavailability(id, body, { sub: auth.session.user.sub, email: auth.session.user.email });
    return NextResponse.json(updated);
  } catch (error) {
    return handleBusinessError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    await deleteUnavailability(id, { sub: auth.session.user.sub, email: auth.session.user.email });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleBusinessError(error);
  }
}
