// GET /api/admin/settings — Lire les paramètres
// PATCH /api/admin/settings — Modifier un paramètre

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, handleBusinessError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit-service";
import { parseJsonBody, updateSettingSchema } from "@/lib/validators/request-schemas";

export async function GET() {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const settings = await prisma.appSetting.findMany();
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  try {
    // Seules les clés connues sont acceptées (cas limite 6)
    const { key, value } = await parseJsonBody(request, updateSettingSchema);

    const oldSetting = await prisma.appSetting.findUnique({ where: { key } });

    const setting = await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });

    await logAudit({
      userSub: auth.session.user.sub,
      userEmail: auth.session.user.email,
      action: "SETTINGS_UPDATED",
      entityType: "setting",
      entityId: key,
      details: { oldValue: oldSetting?.value, newValue: value },
    });

    return NextResponse.json(setting);
  } catch (error) {
    return handleBusinessError(error);
  }
}
