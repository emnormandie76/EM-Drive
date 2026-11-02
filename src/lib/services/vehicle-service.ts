// src/lib/services/vehicle-service.ts — Service de gestion des véhicules
// Implémente les algorithmes SAD 7.1 (position) et 7.2 (disponibilité)

import { prisma } from "@/lib/prisma";
import { addMinutes, getBufferMinutes } from "@/lib/utils/dates";
import { VehicleNotAtCampusError, VehicleUnavailableError } from "@/lib/utils/errors";
import type { Vehicle, Campus, UnavailabilityReason } from "@/generated/prisma/client";

// ══════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════

// Type pour le client transactionnel Prisma
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Période d'indisponibilité telle que tout utilisateur la voit : motif et dates, jamais le commentaire (D67). */
export interface UnavailabilityPeriod {
  reason: UnavailabilityReason;
  startsAt: Date;
  /** Absente : sans limite (maintenance dont la fin est inconnue). */
  endsAt: Date | null;
}

export interface VehicleWithPosition extends Vehicle {
  currentCampus: Campus;
  displayStatus: "available" | "in_trip" | "maintenance" | "car_booking" | "fully_booked";
  /** La période d'indisponibilité en cours, la maintenance avant Car Booking (D69) ; null si aucune. */
  currentUnavailability: UnavailabilityPeriod | null;
  nextTrip: {
    id: string;
    departureTime: Date;
    destination: string;
  } | null;
}

export interface AvailabilityQuery {
  originCampusId: string;
  departureTime: Date;
  estimatedArrivalTime: Date;
  returnDepartureTime?: Date;
  estimatedReturnArrivalTime?: Date;
}

export interface AvailableVehicle {
  id: string;
  name: string;
  licensePlate: string;
  seats: number;
}

export interface SuggestedTrip {
  id: string;
  driverDisplayName: string;
  departureTime: Date;
  origin: string;
  destination: string;
  seatsAvailable: number;
}

// ══════════════════════════════════════════════
// POSITION DU VÉHICULE (SAD 7.1)
// ══════════════════════════════════════════════

/**
 * Calcule le campus où se trouve le véhicule `vehicleId` à l'instant `atTime`.
 *
 * Algorithme :
 * 1. Récupérer le dernier trajet non-annulé dont la fin ≤ atTime
 * 2. Selon le type :
 *    - ONE_WAY → véhicule au destinationCampusId
 *    - ROUND_TRIP → véhicule au originCampusId (il est revenu)
 *    - ROUND_TRIP_OTHER → véhicule au returnCampusId
 * 3. Si aucun trajet → véhicule au defaultCampusId
 *
 * `excludeTripId` écarte le trajet qu'on modifie : son ancien horaire ne doit pas servir à situer le véhicule.
 */
export async function getVehiclePosition(
  vehicleId: string,
  atTime: Date,
  tx?: TransactionClient,
  excludeTripId?: string
): Promise<string> {
  const db = tx ?? prisma;
  const lastTrip = await db.trip.findFirst({
    where: {
      vehicleId,
      ...(excludeTripId && { id: { not: excludeTripId } }),
      status: { not: "CANCELLED" },
      OR: [
        {
          type: "ONE_WAY",
          estimatedArrivalTime: { lte: atTime },
        },
        {
          type: { in: ["ROUND_TRIP", "ROUND_TRIP_OTHER"] },
          estimatedReturnArrivalTime: { lte: atTime },
        },
      ],
    },
    orderBy: [
      { estimatedReturnArrivalTime: { sort: "desc", nulls: "last" } },
      { estimatedArrivalTime: "desc" },
    ],
    select: {
      type: true,
      originCampusId: true,
      destinationCampusId: true,
      returnCampusId: true,
    },
  });

  if (!lastTrip) {
    const vehicle = await db.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { defaultCampusId: true },
    });
    return vehicle.defaultCampusId;
  }

  switch (lastTrip.type) {
    case "ONE_WAY":
      return lastTrip.destinationCampusId || lastTrip.originCampusId;
    case "ROUND_TRIP":
      return lastTrip.originCampusId;
    case "ROUND_TRIP_OTHER":
      return lastTrip.returnCampusId || lastTrip.originCampusId;
  }
}

/** Libellé du refus d'un créneau, selon le motif de la période qui le couvre (D58). */
const UNAVAILABLE_MESSAGES: Record<UnavailabilityReason, string> = {
  MAINTENANCE: "Ce véhicule est en maintenance sur ce créneau : il ne peut pas être réservé.",
  CAR_BOOKING: "Ce véhicule est réservé sur Car Booking sur ce créneau : il ne peut pas être réservé.",
};

/**
 * Vérifie, dans la transaction de l'écriture, que le véhicule peut partir de `originCampusId` à `departureTime`
 * et rouler jusqu'à `endTimeWithBuffer` (D62) : aucune période d'indisponibilité ne couvre le créneau entier
 * `[départ, fin + buffer)`, et il sera à ce campus à cette heure. C'est le point unique qui dit si un véhicule
 * peut partir (D62) : la recherche, la création, le changement d'horaire et la modification admin le suivent.
 * La colonne `vehicles.status` n'est plus lue (D59). `excludeTripId` écarte le trajet qu'on modifie.
 */
export async function assertVehicleBookable(
  vehicleId: string,
  originCampusId: string,
  departureTime: Date,
  endTimeWithBuffer: Date,
  tx?: TransactionClient,
  excludeTripId?: string
): Promise<void> {
  const unavailability = await findVehicleUnavailability(vehicleId, departureTime, endTimeWithBuffer, tx);
  if (unavailability) {
    throw new VehicleUnavailableError(UNAVAILABLE_MESSAGES[unavailability.reason]);
  }

  const campusId = await getVehiclePosition(vehicleId, departureTime, tx, excludeTripId);
  if (campusId !== originCampusId) {
    throw new VehicleNotAtCampusError();
  }
}

/**
 * Récupère la position actuelle d'un véhicule avec les infos du campus.
 */
export async function getVehicleCurrentCampus(vehicleId: string): Promise<Campus> {
  const campusId = await getVehiclePosition(vehicleId, new Date());
  
  if (!campusId) {
    // Sécurité fallback si les données du trajet sont manquantes (cas limite legacy)
    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { defaultCampusId: true }
    });
    return prisma.campus.findUniqueOrThrow({ where: { id: vehicle.defaultCampusId } });
  }

  return prisma.campus.findUniqueOrThrow({ where: { id: campusId } });
}

// ══════════════════════════════════════════════
// DISPONIBILITÉ (SAD 7.2)
// ══════════════════════════════════════════════

/**
 * Cherche un trajet qui chevauche le créneau [start, end] pour un véhicule.
 * Retourne le trajet conflictuel ou null. `excludeTripId` écarte le trajet qu'on modifie.
 */
export async function findVehicleConflict(
  vehicleId: string,
  start: Date,
  end: Date,
  tx?: TransactionClient,
  excludeTripId?: string
): Promise<{ id: string } | null> {
  const db = tx ?? prisma;
  return await db.trip.findFirst({
    where: {
      vehicleId,
      ...(excludeTripId && { id: { not: excludeTripId } }),
      status: { not: "CANCELLED" },
      departureTime: { lt: end },
      OR: [
        { type: "ONE_WAY", estimatedArrivalTime: { gt: start } },
        {
          type: { in: ["ROUND_TRIP", "ROUND_TRIP_OTHER"] },
          estimatedReturnArrivalTime: { gt: start },
        },
      ],
    },
    select: { id: true },
  });
}

/**
 * Cherche une période d'indisponibilité du véhicule qui chevauche le créneau `[start, end)`, `end` étant la fin du
 * trajet plus le buffer. Une période occupe `[début, fin)`, et sans fin elle n'a pas de limite : il y a conflit
 * si début < `end` et fin > `start`. Deux créneaux qui se touchent ne sont pas en conflit (piège 4, comme
 * `findVehicleConflict`). Seul lecteur des périodes pour les décisions de réservation (D58).
 */
export async function findVehicleUnavailability(
  vehicleId: string,
  start: Date,
  end: Date,
  tx?: TransactionClient
): Promise<{ id: string; reason: UnavailabilityReason; startsAt: Date; endsAt: Date | null } | null> {
  const db = tx ?? prisma;
  return await db.vehicleUnavailability.findFirst({
    where: {
      vehicleId,
      startsAt: { lt: end },
      OR: [{ endsAt: null }, { endsAt: { gt: start } }],
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, reason: true, startsAt: true, endsAt: true },
  });
}

/**
 * Retourne la liste des véhicules disponibles pour le créneau demandé.
 *
 * Un véhicule est disponible si :
 * 1. Aucune période d'indisponibilité (maintenance, Car Booking) ne couvre le créneau (buffer inclus), D59
 * 2. Il SERA au campus de départ à l'heure de départ
 * 3. Il n'a PAS de trajet qui chevauche le créneau (buffer inclus)
 */
export async function getAvailableVehicles(
  query: AvailabilityQuery
): Promise<AvailableVehicle[]> {
  const bufferMinutes = await getBufferMinutes();
  const endTimeWithBuffer = addMinutes(
    query.estimatedReturnArrivalTime ?? query.estimatedArrivalTime,
    bufferMinutes
  );

  const vehicles = await prisma.vehicle.findMany();

  const available: AvailableVehicle[] = [];

  for (const vehicle of vehicles) {
    // Les mêmes périodes que celles que `assertVehicleBookable` revérifiera à l'écriture
    const unavailability = await findVehicleUnavailability(vehicle.id, query.departureTime, endTimeWithBuffer);
    if (unavailability) continue;

    // Vérifier la position à l'heure de départ
    const positionCampusId = await getVehiclePosition(vehicle.id, query.departureTime);
    if (positionCampusId !== query.originCampusId) continue;

    // Vérifier l'absence de chevauchement
    const conflict = await findVehicleConflict(vehicle.id, query.departureTime, endTimeWithBuffer);
    if (conflict) continue;

    available.push({
      id: vehicle.id,
      name: vehicle.name,
      licensePlate: vehicle.licensePlate,
      seats: vehicle.seats,
    });
  }

  return available;
}

/**
 * Retourne les trajets existants partant du même campus vers la même destination,
 * autour de la même date, avec des places disponibles.
 * Utilisé pour la suggestion de covoiturage.
 */
export async function getSuggestedTrips(
  originCampusId: string,
  destinationCampusId: string | null,
  departureTime: Date
): Promise<SuggestedTrip[]> {
  // Chercher les trajets ±2h autour de l'heure demandée
  const windowStart = addMinutes(departureTime, -120);
  const windowEnd = addMinutes(departureTime, 120);

  const trips = await prisma.trip.findMany({
    where: {
      status: "SCHEDULED",
      originCampusId,
      ...(destinationCampusId && { destinationCampusId }),
      departureTime: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    include: {
      passengers: true,
      originCampus: true,
      destinationCampus: true,
      vehicle: true,
    },
  });

  return trips
    .filter((trip) => {
      const passengerCount = trip.passengers.length;
      return passengerCount < trip.vehicle.seats - 1; // -1 pour le conducteur
    })
    .map((trip) => ({
      id: trip.id,
      driverDisplayName: trip.driverDisplayName,
      departureTime: trip.departureTime,
      origin: trip.originCampus.name,
      destination: trip.destinationCampus?.name ?? trip.destinationOtherLabel ?? "Autre",
      seatsAvailable: trip.vehicle.seats - 1 - trip.passengers.length,
    }));
}

// ══════════════════════════════════════════════
// LISTE DES VÉHICULES AVEC POSITION (Dashboard)
// ══════════════════════════════════════════════

/**
 * Retourne tous les véhicules avec leur position actuelle et statut d'affichage.
 * Utilisé pour le dashboard.
 */
export async function getAllVehiclesWithPositions(): Promise<VehicleWithPosition[]> {
  const vehicles = await prisma.vehicle.findMany({
    include: { defaultCampus: true },
  });

  const now = new Date();
  const result: VehicleWithPosition[] = [];

  // Périodes en cours, de tous les véhicules, en une requête ; sans commentaire ni auteur (D67)
  const currentPeriods = await prisma.vehicleUnavailability.findMany({
    where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { startsAt: "asc" },
    select: { vehicleId: true, reason: true, startsAt: true, endsAt: true },
  });

  for (const vehicle of vehicles) {
    // La maintenance l'emporte sur Car Booking quand les deux couvrent l'instant (D69)
    const mine = currentPeriods.filter((period) => period.vehicleId === vehicle.id);
    const current = mine.find((period) => period.reason === "MAINTENANCE") ?? mine[0];
    const currentUnavailability: UnavailabilityPeriod | null = current
      ? { reason: current.reason, startsAt: current.startsAt, endsAt: current.endsAt }
      : null;

    // Position actuelle (une indisponibilité ne la déplace pas, D66)
    const currentCampus = await getVehicleCurrentCampus(vehicle.id);

    // Prochain trajet
    const nextTrip = await prisma.trip.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: "SCHEDULED",
        departureTime: { gt: now },
      },
      orderBy: { departureTime: "asc" },
      include: { destinationCampus: true },
    });

    // Trajet en cours ?
    const currentTrip = await prisma.trip.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: "SCHEDULED",
        departureTime: { lte: now },
        OR: [
          { type: "ONE_WAY", estimatedArrivalTime: { gt: now } },
          {
            type: { in: ["ROUND_TRIP", "ROUND_TRIP_OTHER"] },
            estimatedReturnArrivalTime: { gt: now },
          },
        ],
      },
    });

    // Calcul du displayStatus
    let displayStatus: VehicleWithPosition["displayStatus"];
    if (currentUnavailability?.reason === "MAINTENANCE") {
      displayStatus = "maintenance";
    } else if (currentUnavailability?.reason === "CAR_BOOKING") {
      displayStatus = "car_booking";
    } else if (currentTrip) {
      displayStatus = "in_trip";
    } else {
      displayStatus = "available";
    }

    result.push({
      ...vehicle,
      currentCampus,
      displayStatus,
      currentUnavailability,
      nextTrip: nextTrip
        ? {
            id: nextTrip.id,
            departureTime: nextTrip.departureTime,
            destination:
              nextTrip.destinationCampus?.name ??
              nextTrip.destinationOtherLabel ??
              "Autre",
          }
        : null,
    });
  }

  return result;
}
