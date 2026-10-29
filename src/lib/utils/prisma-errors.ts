// src/lib/utils/prisma-errors.ts — Reconnaissance des erreurs de Prisma (serveur seulement)

import { Prisma } from "@/generated/prisma/client";

/**
 * Violation d'une contrainte d'unicité (code Prisma P2002). L'adaptateur Neon convertit l'erreur
 * PostgreSQL 23505 en ce code.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
