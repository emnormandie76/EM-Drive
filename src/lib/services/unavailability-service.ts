// src/lib/services/unavailability-service.ts — Périodes d'indisponibilité des véhicules (D58)
// Une période (maintenance, réservation Car Booking) se déclare, se modifie et se retire par un admin. Elle ne se
// déclare pas sur un créneau où des trajets sont réservés : on refuse et on les liste (D60). Le contrôle des
// réservations suivantes est `assertVehicleBookable` (vehicle-service.ts), qui lit les mêmes périodes.

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit-service";
import { addMinutes, getBufferMinutes } from "@/lib/utils/dates";
import {
  NotFoundError,
  UnavailabilityOverlapError,
  UnavailabilityTripsConflictError,
  ValidationError,
  type ConflictingTripSummary,
} from "@/lib/utils/errors";
import type { UnavailabilityReason, VehicleUnavailability } from "@/generated/prisma/client";

// Type pour le client transactionnel Prisma
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ══════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════

/** L'admin qui écrit : son sub et son adresse, copiés dans la période et l'audit (piège 6). */
export interface UnavailabilityActor {
  sub: string;
  email: string;
}

export interface UnavailabilityInput {
  reason: UnavailabilityReason;
  startsAt: Date;
  /** Absente ou nulle : sans limite, permis pour une maintenance seulement. */
  endsAt?: Date | null;
  comment?: string | null;
}

export interface CreateUnavailabilityInput extends UnavailabilityInput {
  vehicleId: string;
}

/** Corps de la modification : un champ absent reste tel quel, `null` efface la fin ou le commentaire. */
export type UpdateUnavailabilityInput = Partial<UnavailabilityInput>;

/** Ce que voit un utilisateur : le motif et les dates (D67). */
export interface PublicUnavailability {
  id: string;
  reason: UnavailabilityReason;
  startsAt: Date;
  endsAt: Date | null;
}

/** Ce que voit un admin : aussi le commentaire et l'auteur. */
export interface AdminUnavailability extends PublicUnavailability {
  comment: string | null;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const PUBLIC_FIELDS = { id: true, reason: true, startsAt: true, endsAt: true } as const;
const ADMIN_FIELDS = {
  ...PUBLIC_FIELDS,
  comment: true,
  createdByEmail: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ══════════════════════════════════════════════
// RÈGLES DE LA PÉRIODE
// ══════════════════════════════════════════════

/** Un commentaire vide ou fait d'espaces est enregistré comme absent. */
const cleanComment = (comment: string | null | undefined) => (comment?.trim() ? comment.trim() : null);

/** La fin est obligatoire pour Car Booking (D59) et suit toujours le début. */
function assertValidPeriod(period: { reason: UnavailabilityReason; startsAt: Date; endsAt: Date | null }) {
  if (period.reason === "CAR_BOOKING" && !period.endsAt) {
    throw new ValidationError("Une réservation Car Booking a une date de fin.");
  }
  if (period.endsAt && period.endsAt <= period.startsAt) {
    throw new ValidationError("La fin doit suivre le début.");
  }
}

/**
 * Les trajets réservés qui empêchent la période (D60). Un trajet occupe `[départ, fin + buffer)` et la période
 * `[début, fin)` (sans fin : sans limite) : conflit si départ < fin de période et fin du trajet + buffer > début.
 * Un trajet déjà fini n'est pas listé : on ne peut plus le déplacer, et une panne peut dater d'hier ; la borne basse
 * est donc le plus tardif de l'instant présent et du début de la période.
 */
async function findConflictingTrips(
  tx: TransactionClient,
  vehicleId: string,
  period: { startsAt: Date; endsAt: Date | null },
  bufferMinutes: number
): Promise<ConflictingTripSummary[]> {
  const from = new Date(Math.max(period.startsAt.getTime(), Date.now()));
  const tripEndsAfter = addMinutes(from, -bufferMinutes);

  const trips = await tx.trip.findMany({
    where: {
      vehicleId,
      status: { not: "CANCELLED" },
      ...(period.endsAt && { departureTime: { lt: period.endsAt } }),
      OR: [
        { type: "ONE_WAY", estimatedArrivalTime: { gt: tripEndsAfter } },
        { type: { in: ["ROUND_TRIP", "ROUND_TRIP_OTHER"] }, estimatedReturnArrivalTime: { gt: tripEndsAfter } },
      ],
    },
    orderBy: { departureTime: "asc" },
    include: { originCampus: true, destinationCampus: true },
  });

  return trips.map((trip) => ({
    id: trip.id,
    departureTime: trip.departureTime,
    endTime: trip.type === "ONE_WAY" ? trip.estimatedArrivalTime : (trip.estimatedReturnArrivalTime ?? trip.estimatedArrivalTime),
    driverDisplayName: trip.driverDisplayName,
    origin: trip.originCampus?.name ?? "",
    destination: trip.destinationCampus?.name ?? trip.destinationOtherLabel ?? "Autre",
  }));
}

/** Refuse la période (409) si des trajets y sont réservés. */
async function assertNoTripsInConflict(
  tx: TransactionClient,
  vehicleId: string,
  period: { startsAt: Date; endsAt: Date | null },
  bufferMinutes: number
) {
  const conflictingTrips = await findConflictingTrips(tx, vehicleId, period, bufferMinutes);
  if (conflictingTrips.length > 0) {
    throw new UnavailabilityTripsConflictError(conflictingTrips);
  }
}

/**
 * Refuse la période (409) si elle chevauche une autre période du même véhicule (D70), quels que soient les motifs.
 * Même convention que partout : `[début, fin)`, sans fin = sans limite, deux périodes qui se touchent ne se
 * chevauchent pas. `excludeId` écarte la période qu'on modifie.
 */
async function assertNoOverlappingPeriod(
  tx: TransactionClient,
  vehicleId: string,
  period: { startsAt: Date; endsAt: Date | null },
  excludeId?: string
) {
  const overlapping = await tx.vehicleUnavailability.findMany({
    where: {
      vehicleId,
      ...(excludeId && { id: { not: excludeId } }),
      ...(period.endsAt && { startsAt: { lt: period.endsAt } }),
      OR: [{ endsAt: null }, { endsAt: { gt: period.startsAt } }],
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, reason: true, startsAt: true, endsAt: true },
  });
  if (overlapping.length > 0) {
    // Motif et dates seulement : jamais le commentaire ni l'auteur (D67)
    throw new UnavailabilityOverlapError(
      overlapping.map(({ id, reason, startsAt, endsAt }) => ({ id, reason, startsAt, endsAt }))
    );
  }
}

/** Instantané d'une période pour l'audit : dates en ISO. */
const snapshot = (period: { reason: UnavailabilityReason; startsAt: Date; endsAt: Date | null; comment: string | null }) => ({
  reason: period.reason,
  startsAt: period.startsAt.toISOString(),
  endsAt: period.endsAt?.toISOString() ?? null,
  comment: period.comment,
});

// ══════════════════════════════════════════════
// LECTURE
// ══════════════════════════════════════════════

/**
 * Les périodes d'un véhicule qui ne sont pas terminées (en cours, à venir, sans fin), par début, sans vérifier
 * que le véhicule existe (l'appelant l'a déjà lu). Un admin lit aussi le commentaire et l'auteur ; les autres, le
 * motif et les dates (D67).
 */
export async function readVehicleUnavailabilities(vehicleId: string, options: { admin: true }): Promise<AdminUnavailability[]>;
export async function readVehicleUnavailabilities(vehicleId: string, options: { admin: boolean }): Promise<PublicUnavailability[]>;
export async function readVehicleUnavailabilities(
  vehicleId: string,
  options: { admin: boolean }
): Promise<PublicUnavailability[] | AdminUnavailability[]> {
  return await prisma.vehicleUnavailability.findMany({
    where: { vehicleId, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
    orderBy: { startsAt: "asc" },
    select: options.admin ? ADMIN_FIELDS : PUBLIC_FIELDS,
  });
}

/** Comme `readVehicleUnavailabilities`, mais refuse (404) un véhicule inconnu. */
export async function listVehicleUnavailabilities(vehicleId: string, options: { admin: true }): Promise<AdminUnavailability[]>;
export async function listVehicleUnavailabilities(vehicleId: string, options: { admin: boolean }): Promise<PublicUnavailability[]>;
export async function listVehicleUnavailabilities(
  vehicleId: string,
  options: { admin: boolean }
): Promise<PublicUnavailability[] | AdminUnavailability[]> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) throw new NotFoundError("Véhicule non trouvé.");
  return await readVehicleUnavailabilities(vehicleId, options);
}

// ══════════════════════════════════════════════
// ÉCRITURE
// ══════════════════════════════════════════════

/**
 * Déclare une période d'indisponibilité : sans chevauchement avec une autre période du véhicule (D70) et sans
 * trajet réservé (D60). Transaction sérialisée : une réservation concurrente, qui revérifie les
 * périodes, ne passe pas entre le contrôle des trajets et l'écriture.
 */
export async function createUnavailability(
  input: CreateUnavailabilityInput,
  actor: UnavailabilityActor
): Promise<VehicleUnavailability> {
  const period = { reason: input.reason, startsAt: input.startsAt, endsAt: input.endsAt ?? null };
  assertValidPeriod(period);
  const bufferMinutes = await getBufferMinutes(); // lu avant la transaction, comme createTrip

  const created = await prisma.$transaction(
    async (tx) => {
      const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true } });
      if (!vehicle) throw new NotFoundError("Véhicule non trouvé.");

      await assertNoOverlappingPeriod(tx, input.vehicleId, period);
      await assertNoTripsInConflict(tx, input.vehicleId, period, bufferMinutes);

      return await tx.vehicleUnavailability.create({
        data: {
          vehicleId: input.vehicleId,
          ...period,
          comment: cleanComment(input.comment),
          createdBySub: actor.sub,
          createdByEmail: actor.email,
        },
      });
    },
    { isolationLevel: "Serializable" }
  );

  await logAudit({
    userSub: actor.sub,
    userEmail: actor.email,
    action: "VEHICLE_UNAVAILABILITY_CREATED",
    entityType: "vehicle",
    entityId: created.vehicleId,
    details: { unavailabilityId: created.id, ...snapshot(created) },
  });

  return created;
}

/**
 * Modifie une période (D68) avec les mêmes contrôles qu'à la création, sur la période fusionnée : les règles de
 * fin, puis les autres périodes du véhicule (D70) et les trajets réservés sur les nouvelles dates.
 */
export async function updateUnavailability(
  id: string,
  patch: UpdateUnavailabilityInput,
  actor: UnavailabilityActor
): Promise<VehicleUnavailability> {
  const bufferMinutes = await getBufferMinutes(); // lu avant la transaction, comme createTrip

  const { before, updated } = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.vehicleUnavailability.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError("Indisponibilité non trouvée.");

      const merged = {
        reason: patch.reason ?? existing.reason,
        startsAt: patch.startsAt ?? existing.startsAt,
        endsAt: patch.endsAt === undefined ? existing.endsAt : patch.endsAt,
      };
      assertValidPeriod(merged);
      await assertNoOverlappingPeriod(tx, existing.vehicleId, merged, id);
      await assertNoTripsInConflict(tx, existing.vehicleId, merged, bufferMinutes);

      // Seuls les champs reçus sont écrits
      const data = {
        ...(patch.reason !== undefined && { reason: patch.reason }),
        ...(patch.startsAt !== undefined && { startsAt: patch.startsAt }),
        ...(patch.endsAt !== undefined && { endsAt: patch.endsAt }),
        ...(patch.comment !== undefined && { comment: cleanComment(patch.comment) }),
      };
      const updated = await tx.vehicleUnavailability.update({ where: { id }, data });
      return { before: existing, updated };
    },
    { isolationLevel: "Serializable" }
  );

  await logAudit({
    userSub: actor.sub,
    userEmail: actor.email,
    action: "VEHICLE_UNAVAILABILITY_UPDATED",
    entityType: "vehicle",
    entityId: updated.vehicleId,
    details: { unavailabilityId: id, before: snapshot(before), after: snapshot(updated) },
  });

  return updated;
}

/** Retire une période. Un retour anticipé (panne réparée) se fait en la modifiant, ou en la supprimant. */
export async function deleteUnavailability(id: string, actor: UnavailabilityActor): Promise<void> {
  const existing = await prisma.vehicleUnavailability.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Indisponibilité non trouvée.");

  await prisma.vehicleUnavailability.delete({ where: { id } });

  await logAudit({
    userSub: actor.sub,
    userEmail: actor.email,
    action: "VEHICLE_UNAVAILABILITY_DELETED",
    entityType: "vehicle",
    entityId: existing.vehicleId,
    details: { unavailabilityId: id, ...snapshot(existing) },
  });
}
