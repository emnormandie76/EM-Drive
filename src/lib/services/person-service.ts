// src/lib/services/person-service.ts — Rapprochement d'une personne à la connexion (contrat portail v1 §3.2)
// Appelé par le rappel signIn de NextAuth (D22). Le portail garantit le sub, l'adresse en minuscules
// et un rôle pris dans la liste déclarée (§3.1) ; ResaVroom refuse quand même ce qu'il ne comprend pas.

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit-service";
import type { Role } from "@/generated/prisma/client";

const ROLES: readonly Role[] = ["USER", "ADMIN"];

/** L'identité reçue du portail, après profile() du fournisseur (jeton d'identité, §3.4). */
export interface PortalIdentity {
  sub: string | null | undefined;
  email: string | null | undefined;
  name: string | null | undefined;
  role: string | null | undefined;
}

export type SignInRefusal = "INVALID_PROFILE" | "UNKNOWN_ROLE" | "EMAIL_BOUND_TO_OTHER_SUB";

export type ReconcileResult =
  | { allowed: true; personId: string; role: Role }
  | { allowed: false; reason: SignInRefusal };

function isRole(role: unknown): role is Role {
  return ROLES.includes(role as Role);
}

/** Consigne un refus ; l'audit ne bloque jamais (logAudit avale ses erreurs). */
async function refuse(
  identity: { sub: string; email: string },
  reason: SignInRefusal,
  entityId: string,
  details: Record<string, unknown> = {}
): Promise<ReconcileResult> {
  await logAudit({
    userSub: identity.sub,
    userEmail: identity.email,
    action: "SIGNIN_REFUSED",
    entityType: "person",
    entityId,
    details: { reason, ...details },
  });
  return { allowed: false, reason };
}

/**
 * Retrouve le compte local à chaque connexion : par sub ; sinon par l'adresse, puis enregistre le sub ;
 * sinon le crée. Recopie l'adresse, le nom et le rôle reçus. Refuse (et consigne) une adresse déjà liée
 * à un autre sub : c'est le signe d'une adresse réattribuée. Refuse aussi un rôle non déclaré (D20).
 */
export async function reconcilePerson(identity: PortalIdentity): Promise<ReconcileResult> {
  const { sub, email } = identity;
  if (!sub || !email) {
    console.warn("[AUTH] Profil du portail incomplet : connexion refusée.");
    return { allowed: false, reason: "INVALID_PROFILE" };
  }

  if (!isRole(identity.role)) {
    return refuse({ sub, email }, "UNKNOWN_ROLE", sub, { role: identity.role ?? null });
  }

  const now = new Date();
  const fields = { email, name: identity.name || email, role: identity.role, lastLoginAt: now };

  // 1. Par sub
  const bySub = await prisma.person.findUnique({ where: { sub } });
  if (bySub) {
    if (bySub.email !== email) {
      // L'adresse a changé dans le portail : elle ne doit appartenir à personne d'autre ici
      const holder = await prisma.person.findUnique({ where: { email } });
      if (holder && holder.id !== bySub.id) {
        return refuse({ sub, email }, "EMAIL_BOUND_TO_OTHER_SUB", holder.id, { email });
      }
    }
    const person = await prisma.person.update({ where: { id: bySub.id }, data: fields });
    return { allowed: true, personId: person.id, role: person.role };
  }

  // 2. Par l'adresse, la première fois : enregistrer le sub, sauf s'il en porte déjà un autre
  const byEmail = await prisma.person.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.sub !== null) {
      return refuse({ sub, email }, "EMAIL_BOUND_TO_OTHER_SUB", byEmail.id, { email });
    }
    const person = await prisma.person.update({ where: { id: byEmail.id }, data: { sub, ...fields } });
    return { allowed: true, personId: person.id, role: person.role };
  }

  // 3. Création
  const person = await prisma.person.create({ data: { sub, ...fields } });
  return { allowed: true, personId: person.id, role: person.role };
}
