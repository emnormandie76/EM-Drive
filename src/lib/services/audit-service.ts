// src/lib/services/audit-service.ts — Service de journalisation des actions critiques

import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@/generated/prisma/client";

// ══════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════

interface AuditLogInput {
  userSub: string;
  userEmail: string;
  action: AuditAction;
  entityType: string;  // "trip", "vehicle", "admin", "service", "setting"
  entityId: string;
  details?: Record<string, unknown>;
}

// ══════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════

/**
 * Enregistre une action dans le journal d'audit.
 * Exécuté hors transaction pour ne pas bloquer l'opération principale.
 */
export async function logAudit(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userSub: input.userSub,
        userEmail: input.userEmail,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        details: (input.details as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (error) {
    // L'audit ne doit jamais bloquer l'opération principale
    console.error("[AUDIT] Erreur lors de l'écriture du log d'audit:", error);
  }
}

/**
 * Récupère les logs d'audit avec pagination.
 */
export async function getAuditLogs(options?: {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
}) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const skip = (page - 1) * limit;

  const where = {
    ...(options?.entityType && { entityType: options.entityType }),
    ...(options?.entityId && { entityId: options.entityId }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
