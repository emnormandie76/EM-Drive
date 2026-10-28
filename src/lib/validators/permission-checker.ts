// src/lib/validators/permission-checker.ts — Règles de permission (SAD 7.7)

import { MIN_HOURS_BEFORE_MODIFICATION } from "@/lib/utils/constants";
import type { Passenger } from "@/generated/prisma/client";

// ══════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface TripWithPassengers {
  driverSub: string;
  departureTime: Date;
  passengers: Pick<Passenger, "addedBy">[];
}

// ══════════════════════════════════════════════
// RÈGLES DE SUPPRESSION
// ══════════════════════════════════════════════

/**
 * Vérifie si un utilisateur peut SUPPRIMER un trajet.
 *
 * Règles :
 * - Un admin peut toujours supprimer.
 * - Seul le conducteur peut supprimer son trajet.
 * - Si des passagers SELF existent → interdit (doit contacter un admin).
 * - Si aucun passager SELF → autorisé.
 */
export function canDeleteTrip(
  trip: TripWithPassengers,
  userSub: string,
  userIsAdmin: boolean
): PermissionResult {
  if (userIsAdmin) return { allowed: true };

  if (trip.driverSub !== userSub) {
    return {
      allowed: false,
      reason: "Seul le conducteur ou un admin peut supprimer ce trajet.",
    };
  }

  const hasSelfPassengers = trip.passengers.some((p) => p.addedBy === "SELF");
  if (hasSelfPassengers) {
    return {
      allowed: false,
      reason:
        "Ce trajet a des passagers inscrits. Contactez un administrateur pour le supprimer.",
    };
  }

  return { allowed: true };
}

// ══════════════════════════════════════════════
// RÈGLES DE MODIFICATION
// ══════════════════════════════════════════════

/**
 * Vérifie si un utilisateur peut MODIFIER l'heure de départ d'un trajet.
 *
 * Règles :
 * - Un admin peut toujours modifier.
 * - Seul le conducteur peut modifier son trajet.
 * - Si des passagers SELF existent → modification possible uniquement si 48h+
 *   avant le départ.
 * - Si aucun passager SELF → modification libre.
 */
export function canModifyDepartureTime(
  trip: TripWithPassengers,
  userSub: string,
  userIsAdmin: boolean
): PermissionResult {
  if (userIsAdmin) return { allowed: true };

  if (trip.driverSub !== userSub) {
    return {
      allowed: false,
      reason: "Seul le conducteur ou un admin peut modifier ce trajet.",
    };
  }

  const hasSelfPassengers = trip.passengers.some((p) => p.addedBy === "SELF");
  if (hasSelfPassengers) {
    const hoursUntilDeparture =
      (trip.departureTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilDeparture < MIN_HOURS_BEFORE_MODIFICATION) {
      return {
        allowed: false,
        reason: `Modification impossible moins de ${MIN_HOURS_BEFORE_MODIFICATION}h avant le départ quand des passagers se sont inscrits.`,
      };
    }
  }

  return { allowed: true };
}

// ══════════════════════════════════════════════
// RÈGLES PASSAGERS
// ══════════════════════════════════════════════

/**
 * Vérifie si un utilisateur peut REJOINDRE un trajet comme passager.
 *
 * Règles :
 * - Le conducteur ne peut pas être passager de son propre trajet.
 * - Le trajet doit avoir des places disponibles.
 * - Le trajet ne doit pas être dans le passé.
 * - Le trajet doit être SCHEDULED.
 */
export function canJoinAsPassenger(
  trip: TripWithPassengers & { status: string; vehicleSeats: number },
  userSub: string
): PermissionResult {
  if (trip.status !== "SCHEDULED") {
    return { allowed: false, reason: "Ce trajet n'est plus disponible." };
  }

  if (trip.departureTime < new Date()) {
    return { allowed: false, reason: "Ce trajet est déjà en cours ou terminé." };
  }

  if (trip.driverSub === userSub) {
    return {
      allowed: false,
      reason: "Vous êtes le conducteur de ce trajet.",
    };
  }

  const currentPassengerCount = trip.passengers.length;
  const maxPassengers = trip.vehicleSeats - 1; // -1 pour le conducteur
  if (currentPassengerCount >= maxPassengers) {
    return { allowed: false, reason: "Ce trajet est complet." };
  }

  return { allowed: true };
}

/**
 * Vérifie si un passager peut SE RETIRER d'un trajet.
 *
 * Règles :
 * - Un passager peut toujours se retirer avant le départ.
 * - Un admin peut retirer n'importe quel passager.
 */
export function canLeaveTrip(
  trip: Pick<TripWithPassengers, "departureTime">,
  userIsAdmin: boolean
): PermissionResult {
  if (userIsAdmin) return { allowed: true };

  if (trip.departureTime < new Date()) {
    return { allowed: false, reason: "Ce trajet est déjà en cours ou terminé." };
  }

  return { allowed: true };
}
