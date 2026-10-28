/* eslint-disable @typescript-eslint/no-unused-vars */
// src/lib/services/trip-service.ts — Service CRUD des trajets (SAD 7.4, 7.5)
// Implémente la création en transaction sérialisée avec vérifications de conflits.

import { prisma } from "@/lib/prisma";
import { addMinutes, getBufferMinutes } from "@/lib/utils/dates";
import {
  VehicleConflictError,
  DriverOverlapError,
  PassengerOverlapError,
  PermissionError,
  ValidationError,
  BusinessError,
} from "@/lib/utils/errors";
import { findVehicleConflict } from "./vehicle-service";
import { logAudit } from "./audit-service";
import {
  canDeleteTrip,
  canJoinAsPassenger,
  canLeaveTrip,
  canModifyDepartureTime,
} from "@/lib/validators/permission-checker";
import type { UpdateTripInput } from "@/lib/validators/request-schemas";
import type { Trip, TripType } from "@/generated/prisma/client";

// ══════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════

export interface CreateTripInput {
  status?: "SCHEDULED" | "CANCELLED";
  vehicleId: string;
  driverEntraId: string;
  driverEmail: string;
  driverDisplayName: string;
  type: TripType;
  originCampusId: string;
  destinationCampusId?: string;
  destinationOtherLabel?: string;
  destinationOtherLat?: number;
  destinationOtherLng?: number;
  returnCampusId?: string;
  departureTime: Date;
  estimatedArrivalTime: Date;
  returnDepartureTime?: Date;
  estimatedReturnArrivalTime?: Date;
  comment?: string;
  passengers?: Array<{
    userEntraId: string;
    userEmail: string;
    userDisplayName: string;
  }>;
}

// Type pour le client transactionnel Prisma
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ══════════════════════════════════════════════
// DÉTECTION DE CONFLITS PERSONNES (SAD 7.5)
// ══════════════════════════════════════════════

/**
 * Cherche un trajet qui chevauche le créneau pour une personne
 * (en tant que conducteur OU passager).
 */
export async function findPersonConflict(
  tx: TransactionClient,
  userEntraId: string,
  start: Date,
  end: Date,
  excludeTripId?: string
): Promise<{ id: string } | null> {
  const baseWhere = {
    status: { not: "CANCELLED" as const },
    departureTime: { lt: end },
    ...(excludeTripId && { id: { not: excludeTripId } }),
    OR: [
      { type: "ONE_WAY" as const, estimatedArrivalTime: { gt: start } },
      {
        type: { in: ["ROUND_TRIP" as const, "ROUND_TRIP_OTHER" as const] },
        estimatedReturnArrivalTime: { gt: start },
      },
    ],
  };

  // Vérifier en tant que conducteur
  const asDriver = await tx.trip.findFirst({
    where: { ...baseWhere, driverEntraId: userEntraId },
    select: { id: true },
  });
  if (asDriver) return asDriver;

  // Vérifier en tant que passager
  const asPassenger = await tx.trip.findFirst({
    where: { ...baseWhere, passengers: { some: { userEntraId } } },
    select: { id: true },
  });

  return asPassenger;
}

// ══════════════════════════════════════════════
// CRÉATION DE TRAJET (SAD 7.4)
// ══════════════════════════════════════════════

/**
 * Crée un trajet dans une transaction sérialisée.
 *
 * Étapes :
 * 0. Vérifier les passagers : places du véhicule, conducteur absent de la liste
 * 1. Re-vérifier la disponibilité du véhicule (race condition)
 * 2. Vérifier le chevauchement du conducteur
 * 3. Vérifier le chevauchement de chaque passager
 * 4. Créer le trajet + les passagers
 *
 * Post-transaction : audit + mail (hors transaction).
 */
export async function createTrip(input: CreateTripInput): Promise<Trip> {
  const bufferMinutes = await getBufferMinutes();
  const endTimeWithBuffer = addMinutes(
    input.estimatedReturnArrivalTime ?? input.estimatedArrivalTime,
    bufferMinutes
  );

  const trip = await prisma.$transaction(
    async (tx) => {
      // ── VÉRIF 0 : Passagers compatibles avec le véhicule (cas limite 1) ──
      if (input.passengers?.length) {
        const vehicle = await tx.vehicle.findUniqueOrThrow({
          where: { id: input.vehicleId },
          select: { seats: true },
        });
        if (input.passengers.length > vehicle.seats - 1) {
          throw new ValidationError(
            `Ce véhicule n'accepte que ${vehicle.seats - 1} passagers en plus du conducteur.`
          );
        }
        if (input.passengers.some((p) => p.userEntraId === input.driverEntraId)) {
          throw new ValidationError("Le conducteur ne peut pas être passager de son propre trajet.");
        }
      }

      // ── VÉRIF 1 : Véhicule toujours disponible ──
      const vehicleConflict = await findVehicleConflict(
        input.vehicleId,
        input.departureTime,
        endTimeWithBuffer,
        tx
      );
      if (vehicleConflict) {
        throw new VehicleConflictError(
          "Ce véhicule vient d'être réservé par un autre utilisateur.",
          vehicleConflict.id
        );
      }

      // ── VÉRIF 2 : Conducteur pas de chevauchement ──
      const driverConflict = await findPersonConflict(
        tx,
        input.driverEntraId,
        input.departureTime,
        endTimeWithBuffer
      );
      if (driverConflict) {
        throw new DriverOverlapError(
          "Vous avez déjà un trajet sur ce créneau.",
          driverConflict.id
        );
      }

      // ── VÉRIF 3 : Passagers pas de chevauchement ──
      if (input.passengers) {
        for (const passenger of input.passengers) {
          const passengerConflict = await findPersonConflict(
            tx,
            passenger.userEntraId,
            input.departureTime,
            endTimeWithBuffer
          );
          if (passengerConflict) {
            throw new PassengerOverlapError(
              `Le passager ${passenger.userDisplayName} a déjà un trajet sur ce créneau.`,
              passengerConflict.id,
              passenger.userDisplayName
            );
          }
        }
      }

      // ── CRÉATION ──
      return await tx.trip.create({
        data: {
          vehicleId: input.vehicleId,
          driverEntraId: input.driverEntraId,
          driverEmail: input.driverEmail,
          driverDisplayName: input.driverDisplayName,
          type: input.type,
          originCampusId: input.originCampusId,
          destinationCampusId: input.destinationCampusId,
          destinationOtherLabel: input.destinationOtherLabel,
          destinationOtherLat: input.destinationOtherLat,
          destinationOtherLng: input.destinationOtherLng,
          returnCampusId: input.returnCampusId,
          departureTime: input.departureTime,
          estimatedArrivalTime: input.estimatedArrivalTime,
          returnDepartureTime: input.returnDepartureTime,
          estimatedReturnArrivalTime: input.estimatedReturnArrivalTime,
          comment: input.comment,
          passengers: input.passengers
            ? {
                createMany: {
                  data: input.passengers.map((p) => ({
                    userEntraId: p.userEntraId,
                    userEmail: p.userEmail,
                    userDisplayName: p.userDisplayName,
                    addedBy: "DRIVER" as const,
                  })),
                },
              }
            : undefined,
        },
        include: { passengers: true },
      });
    },
    { isolationLevel: "Serializable" }
  );

  // ── HORS TRANSACTION : Audit ──
  await logAudit({
    userEntraId: input.driverEntraId,
    userEmail: input.driverEmail,
    action: "TRIP_CREATED",
    entityType: "trip",
    entityId: trip.id,
    details: { type: input.type, vehicleId: input.vehicleId },
  });

  return trip;
}

// ══════════════════════════════════════════════
// ANNULATION DE TRAJET (soft delete)
// ══════════════════════════════════════════════

/**
 * Annule un trajet (soft delete → statut CANCELLED).
 * Vérifie les permissions avant l'annulation.
 */
export async function cancelTrip(
  tripId: string,
  userEntraId: string,
  userEmail: string,
  userIsAdmin: boolean
): Promise<Trip> {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { passengers: true },
  });

  // Vérification des permissions
  const permission = canDeleteTrip(trip, userEntraId, userIsAdmin);
  if (!permission.allowed) {
    throw new PermissionError(permission.reason!);
  }

  // Annulation
  const cancelled = await prisma.trip.update({
    where: { id: tripId },
    data: { status: "CANCELLED" },
    include: { passengers: true },
  });

  // Audit
  const action = userIsAdmin ? "TRIP_FORCE_DELETED" : "TRIP_CANCELLED";
  await logAudit({
    userEntraId,
    userEmail,
    action,
    entityType: "trip",
    entityId: tripId,
    details: {
      driverEntraId: trip.driverEntraId,
      passengerCount: trip.passengers.length,
    },
  });

  return cancelled;
}

// ══════════════════════════════════════════════
// MODIFICATION DE L'HEURE DE DÉPART
// ══════════════════════════════════════════════

/**
 * Modifie l'heure de départ d'un trajet.
 * Recalcule les heures dérivées en décalant du même delta, puis revérifie dans une
 * transaction sérialisée que le véhicule, le conducteur et chaque passager sont libres
 * sur le nouveau créneau, buffer compris (cas limite 3).
 */
export async function updateDepartureTime(
  tripId: string,
  newDepartureTime: Date,
  userEntraId: string,
  userEmail: string,
  userIsAdmin: boolean
): Promise<Trip> {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { passengers: true },
  });

  // Vérification des permissions
  const permission = canModifyDepartureTime(trip, userEntraId, userIsAdmin);
  if (!permission.allowed) {
    throw new PermissionError(permission.reason!);
  }

  // Calcul du delta pour décaler toutes les dates
  const deltaMs = newDepartureTime.getTime() - trip.departureTime.getTime();
  const shift = (date: Date) => new Date(date.getTime() + deltaMs);

  const newArrivalTime = shift(trip.estimatedArrivalTime);
  const newReturnArrivalTime = trip.estimatedReturnArrivalTime && shift(trip.estimatedReturnArrivalTime);
  const bufferMinutes = await getBufferMinutes();
  const newEndTimeWithBuffer = addMinutes(newReturnArrivalTime ?? newArrivalTime, bufferMinutes);

  const updated = await prisma.$transaction(
    async (tx) => {
      // ── VÉRIF 1 : Véhicule libre sur le nouveau créneau ──
      const vehicleConflict = await findVehicleConflict(
        trip.vehicleId,
        newDepartureTime,
        newEndTimeWithBuffer,
        tx,
        tripId
      );
      if (vehicleConflict) {
        throw new VehicleConflictError(
          "Ce véhicule est déjà réservé sur ce nouveau créneau.",
          vehicleConflict.id
        );
      }

      // ── VÉRIF 2 : Conducteur libre ──
      const driverConflict = await findPersonConflict(
        tx,
        trip.driverEntraId,
        newDepartureTime,
        newEndTimeWithBuffer,
        tripId
      );
      if (driverConflict) {
        throw new DriverOverlapError(
          "Le conducteur a déjà un trajet sur ce nouveau créneau.",
          driverConflict.id
        );
      }

      // ── VÉRIF 3 : Chaque passager libre ──
      for (const passenger of trip.passengers) {
        const passengerConflict = await findPersonConflict(
          tx,
          passenger.userEntraId,
          newDepartureTime,
          newEndTimeWithBuffer,
          tripId
        );
        if (passengerConflict) {
          throw new PassengerOverlapError(
            `Le passager ${passenger.userDisplayName} a déjà un trajet sur ce nouveau créneau.`,
            passengerConflict.id,
            passenger.userDisplayName
          );
        }
      }

      return await tx.trip.update({
        where: { id: tripId },
        data: {
          departureTime: newDepartureTime,
          estimatedArrivalTime: newArrivalTime,
          ...(trip.returnDepartureTime && {
            returnDepartureTime: shift(trip.returnDepartureTime),
          }),
          ...(newReturnArrivalTime && {
            estimatedReturnArrivalTime: newReturnArrivalTime,
          }),
        },
      });
    },
    { isolationLevel: "Serializable" }
  );

  // Audit
  await logAudit({
    userEntraId,
    userEmail,
    action: "TRIP_UPDATED",
    entityType: "trip",
    entityId: tripId,
    details: {
      oldDepartureTime: trip.departureTime.toISOString(),
      newDepartureTime: newDepartureTime.toISOString(),
    },
  });

  return updated;
}

export async function updateTripInfo(
  tripId: string,
  data: UpdateTripInput,
  actorEntraId: string,
  actorEmail: string,
  actorIsAdmin: boolean
): Promise<Trip> {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { passengers: true },
  });

  if (!actorIsAdmin) {
    throw new PermissionError("Seul un administrateur peut modifier librement toutes les informations d'un trajet.");
  }

  const bufferMinutes = await getBufferMinutes();
  
  // Simulation des nouvelles informations du trajet pour vérifier les conflits
  const newDepartureTime = data.departureTime ? new Date(data.departureTime) : trip.departureTime;
  const newRawEndTime = data.type === "ONE_WAY" || (data.type === undefined && trip.type === "ONE_WAY")
      ? (data.estimatedArrivalTime ? new Date(data.estimatedArrivalTime) : trip.estimatedArrivalTime)
      : (data.estimatedReturnArrivalTime ? new Date(data.estimatedReturnArrivalTime) : (trip.estimatedReturnArrivalTime || trip.estimatedArrivalTime));
  const newEndTimeWithBuffer = addMinutes(newRawEndTime, bufferMinutes);
  const newVehicleId = data.vehicleId || trip.vehicleId;
  const newDriverEntraId = data.driverEntraId || trip.driverEntraId;

  // On re-vérifie dans une transaction
  const updated = await prisma.$transaction(async (tx) => {
    // ── VÉRIF 1 : Véhicule pas en conflit (excluant ce trajet précis) ──
    const vehicleConflict = await tx.trip.findFirst({
        where: {
          id: { not: tripId },
          vehicleId: newVehicleId,
          status: { not: "CANCELLED" },
          departureTime: { lt: newEndTimeWithBuffer },
          OR: [
            { type: "ONE_WAY", estimatedArrivalTime: { gt: newDepartureTime } },
            {
              type: { in: ["ROUND_TRIP", "ROUND_TRIP_OTHER"] },
              estimatedReturnArrivalTime: { gt: newDepartureTime },
            },
          ],
        },
        select: { id: true },
    });
    if (vehicleConflict) {
      throw new VehicleConflictError(
        "Ce véhicule est déjà réservé par un autre utilisateur sur ce nouveau créneau.",
        vehicleConflict.id
      );
    }

    // ── VÉRIF 2 : Conducteur pas en conflit ──
    const driverConflict = await findPersonConflict(
      tx,
      newDriverEntraId,
      newDepartureTime,
      newEndTimeWithBuffer,
      tripId
    );

    if (driverConflict) {
        throw new DriverOverlapError(
            "Le conducteur a déjà un trajet existant sur ce nouveau créneau.",
            driverConflict.id
        );
    }

    // ── MISE À JOUR ──
    return await tx.trip.update({
        where: { id: tripId },
        data: {
          status: data.status !== undefined ? data.status : undefined,
          driverEntraId: data.driverEntraId !== undefined ? data.driverEntraId : undefined,
          driverEmail: data.driverEmail !== undefined ? data.driverEmail : undefined,
          driverDisplayName: data.driverDisplayName !== undefined ? data.driverDisplayName : undefined,
          vehicleId: data.vehicleId !== undefined ? data.vehicleId : undefined,
          type: data.type !== undefined ? data.type : undefined,
          originCampusId: data.originCampusId !== undefined ? data.originCampusId : undefined,
          destinationCampusId: data.destinationCampusId !== undefined ? data.destinationCampusId : undefined,
          destinationOtherLabel: data.destinationOtherLabel !== undefined ? data.destinationOtherLabel : undefined,
          destinationOtherLat: data.destinationOtherLat !== undefined ? data.destinationOtherLat : undefined,
          destinationOtherLng: data.destinationOtherLng !== undefined ? data.destinationOtherLng : undefined,
          returnCampusId: data.returnCampusId !== undefined ? data.returnCampusId : undefined,
          departureTime: data.departureTime ? new Date(data.departureTime) : undefined,
          estimatedArrivalTime: data.estimatedArrivalTime ? new Date(data.estimatedArrivalTime) : undefined,
          returnDepartureTime: data.returnDepartureTime !== undefined ? (data.returnDepartureTime === null ? null : new Date(data.returnDepartureTime)) : undefined,
          estimatedReturnArrivalTime: data.estimatedReturnArrivalTime !== undefined ? (data.estimatedReturnArrivalTime === null ? null : new Date(data.estimatedReturnArrivalTime)) : undefined,
          comment: data.comment !== undefined ? data.comment : undefined,
        },
    });
  }, { isolationLevel: "Serializable" });

  await logAudit({
    userEntraId: actorEntraId,
    userEmail: actorEmail,
    action: "TRIP_UPDATED",
    entityType: "trip",
    entityId: tripId,
    details: { message: "Admin modified trip details" },
  });

  return updated;
}
// ══════════════════════════════════════════════

/**
 * Ajoute un passager à un trajet (inscription SELF ou ajout par le conducteur).
 *
 * Règles (cas limite 1), vérifiées dans une transaction sérialisée pour que deux
 * inscriptions simultanées ne dépassent pas les places :
 * - un ajout DRIVER est réservé au conducteur du trajet ou à un admin ;
 * - le trajet doit être prévu, futur, avec une place libre, et le passager ne doit
 *   pas en être le conducteur (canJoinAsPassenger) ;
 * - le passager ne doit pas avoir d'autre trajet sur le créneau.
 */
export async function addPassenger(
  tripId: string,
  userEntraId: string,
  userEmail: string,
  userDisplayName: string,
  addedBy: "SELF" | "DRIVER",
  actorEntraId: string,
  actorEmail: string,
  actorIsAdmin: boolean
): Promise<void> {
  const bufferMinutes = await getBufferMinutes();

  await prisma.$transaction(async (tx) => {
    const trip = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { passengers: true, vehicle: true },
    });

    if (addedBy === "DRIVER" && !actorIsAdmin && trip.driverEntraId !== actorEntraId) {
      throw new PermissionError("Seul le conducteur ou un admin peut ajouter un passager à ce trajet.");
    }

    const permission = canJoinAsPassenger({ ...trip, vehicleSeats: trip.vehicle.seats }, userEntraId);
    if (!permission.allowed) {
      throw new PermissionError(permission.reason!);
    }

    const endTimeWithBuffer = addMinutes(
      trip.estimatedReturnArrivalTime ?? trip.estimatedArrivalTime,
      bufferMinutes
    );
    const conflict = await findPersonConflict(
      tx,
      userEntraId,
      trip.departureTime,
      endTimeWithBuffer
    );
    if (conflict) {
      throw new PassengerOverlapError(
        `${userDisplayName} a déjà un trajet sur ce créneau.`,
        conflict.id,
        userDisplayName
      );
    }

    await tx.passenger.create({
      data: {
        tripId,
        userEntraId,
        userEmail,
        userDisplayName,
        addedBy,
      },
    });
  }, { isolationLevel: "Serializable" });

  // Audit
  await logAudit({
    userEntraId: actorEntraId,
    userEmail: actorEmail,
    action: "PASSENGER_ADDED",
    entityType: "trip",
    entityId: tripId,
    details: { passengerEntraId: userEntraId, addedBy },
  });
}

/**
 * Retire un passager d'un trajet (cas limite 2, SAD « retirer un passager ») :
 * - un admin peut retirer n'importe qui, à tout moment ;
 * - le passager peut se retirer lui-même, avant le départ ;
 * - le conducteur peut retirer un passager qu'il a ajouté (DRIVER), avant le départ.
 */
export async function removePassenger(
  tripId: string,
  passengerId: string,
  actorEntraId: string,
  actorEmail: string,
  actorIsAdmin: boolean
): Promise<void> {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
  });

  const passenger = await prisma.passenger.findUnique({
    where: { id: passengerId }
  });

  if (!passenger || passenger.tripId !== tripId) {
    throw new BusinessError("Passager introuvable sur ce trajet.", "PASSENGER_NOT_FOUND");
  }

  if (!actorIsAdmin) {
    const isSelf = passenger.userEntraId.trim().toLowerCase() === actorEntraId.trim().toLowerCase();
    const isDriver = trip.driverEntraId.trim().toLowerCase() === actorEntraId.trim().toLowerCase();

    if (!isSelf && !(isDriver && passenger.addedBy === "DRIVER")) {
      throw new PermissionError(
        isDriver
          ? "Un passager inscrit lui-même ne peut être retiré que par lui-même ou par un admin."
          : "Vous n'avez pas le droit de retirer ce passager."
      );
    }

    const permission = canLeaveTrip(trip, actorIsAdmin);
    if (!permission.allowed) {
      throw new PermissionError(permission.reason!);
    }
  }

  await prisma.passenger.delete({
    where: {
      id: passengerId,
    },
  });

  // Audit
  await logAudit({
    userEntraId: actorEntraId,
    userEmail: actorEmail,
    action: "PASSENGER_REMOVED",
    entityType: "trip",
    entityId: tripId,
    details: { removedPassengerEntraId: passenger.userEntraId },
  });
}

// ══════════════════════════════════════════════
// LECTURE
// ══════════════════════════════════════════════

/**
 * Récupère un trajet par ID avec toutes les relations.
 */
export async function getTripById(tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      vehicle: true,
      originCampus: true,
      destinationCampus: true,
      returnCampus: true,
      passengers: true,
    },
  });
}

/**
 * Récupère les trajets d'un utilisateur (comme conducteur ou passager).
 */
export async function getUserTrips(userEntraId: string) {
  return prisma.trip.findMany({
    where: {
      OR: [
        { driverEntraId: userEntraId },
        { passengers: { some: { userEntraId } } },
      ],
    },
    include: {
      vehicle: true,
      originCampus: true,
      destinationCampus: true,
      passengers: true,
    },
    orderBy: { departureTime: "desc" },
  });
}
