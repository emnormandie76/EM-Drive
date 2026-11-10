// src/lib/utils/errors.ts — Classes d'erreurs métier

/**
 * Classe de base pour les erreurs métier.
 * Fournit un code d'erreur, un message actionnable, et optionnellement
 * l'ID du trajet conflictuel (pour redirection côté UI).
 */
export class BusinessError extends Error {
  constructor(
    message: string,
    public code: string,
    public conflictingTripId?: string,
    public statusCode: number = 409
  ) {
    super(message);
    this.name = "BusinessError";
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      conflictingTripId: this.conflictingTripId,
    };
  }
}

/**
 * Le véhicule est déjà réservé sur ce créneau.
 * → L'utilisateur peut rejoindre le trajet concurrent.
 */
export class VehicleConflictError extends BusinessError {
  constructor(message: string, conflictingTripId: string) {
    super(message, "VEHICLE_CONFLICT", conflictingTripId);
    this.name = "VehicleConflictError";
  }
}

/**
 * Le conducteur a déjà un trajet qui chevauche ce créneau.
 * → Lien vers le trajet existant du conducteur.
 */
export class DriverOverlapError extends BusinessError {
  constructor(message: string, conflictingTripId: string) {
    super(message, "DRIVER_OVERLAP", conflictingTripId);
    this.name = "DriverOverlapError";
  }
}

/**
 * Un passager a déjà un trajet qui chevauche ce créneau.
 * → Lien vers le trajet existant du passager.
 */
export class PassengerOverlapError extends BusinessError {
  public passengerName: string;

  constructor(message: string, conflictingTripId: string, passengerName: string) {
    super(message, "PASSENGER_OVERLAP", conflictingTripId);
    this.name = "PassengerOverlapError";
    this.passengerName = passengerName;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      passengerName: this.passengerName,
    };
  }
}

/**
 * Le véhicule ne peut pas être réservé sur ce créneau : une période d'indisponibilité le couvre, maintenance
 * ou réservation Car Booking (D58, D62).
 */
export class VehicleUnavailableError extends BusinessError {
  constructor(message = "Ce véhicule est indisponible sur ce créneau : il ne peut pas être réservé.") {
    super(message, "VEHICLE_UNAVAILABLE");
    this.name = "VehicleUnavailableError";
  }
}

/** Un trajet réservé qui empêche de déclarer une indisponibilité, tel que l'écran l'affiche (D60). */
export interface ConflictingTripSummary {
  id: string;
  departureTime: Date;
  /** Arrivée du trajet : celle du retour pour un aller-retour. */
  endTime: Date;
  driverDisplayName: string;
  origin: string;
  destination: string;
}

/**
 * Des trajets sont déjà réservés sur la période d'indisponibilité demandée (D60) : l'admin les déplace ou les
 * annule d'abord. Le corps de la réponse porte la liste.
 */
export class UnavailabilityTripsConflictError extends BusinessError {
  constructor(public conflictingTrips: ConflictingTripSummary[]) {
    super(
      "Des trajets sont déjà réservés sur cette période : déplacez-les ou annulez-les d'abord.",
      "UNAVAILABILITY_TRIPS_CONFLICT"
    );
    this.name = "UnavailabilityTripsConflictError";
  }

  toJSON() {
    return { ...super.toJSON(), conflictingTrips: this.conflictingTrips };
  }
}

/** Une période d'indisponibilité en cause dans un chevauchement : motif et dates seulement (D67). */
export interface OverlappingPeriodSummary {
  id: string;
  reason: "CAR_BOOKING" | "MAINTENANCE";
  startsAt: Date;
  endsAt: Date | null;
}

/**
 * Le véhicule a déjà une indisponibilité qui chevauche la période demandée (D70) : deux périodes d'un même
 * véhicule ne se recouvrent pas, quels que soient leurs motifs. Le corps de la réponse porte la liste.
 */
export class UnavailabilityOverlapError extends BusinessError {
  constructor(public overlappingPeriods: OverlappingPeriodSummary[]) {
    super(
      "Ce véhicule a déjà une indisponibilité sur cette période : modifiez-la ou retirez-la d'abord.",
      "UNAVAILABILITY_OVERLAP"
    );
    this.name = "UnavailabilityOverlapError";
  }

  toJSON() {
    return { ...super.toJSON(), overlappingPeriods: this.overlappingPeriods };
  }
}

/**
 * La ressource demandée n'existe pas (véhicule ou période d'indisponibilité inconnus).
 */
export class NotFoundError extends BusinessError {
  constructor(message: string) {
    super(message, "NOT_FOUND", undefined, 404);
    this.name = "NotFoundError";
  }
}

/**
 * Le véhicule ne sera pas au campus de départ à l'heure du départ (D62).
 */
export class VehicleNotAtCampusError extends BusinessError {
  constructor() {
    super("Ce véhicule ne sera pas au campus de départ à l'heure prévue.", "VEHICLE_NOT_AT_CAMPUS");
    this.name = "VehicleNotAtCampusError";
  }
}

/**
 * La plaque d'immatriculation est déjà portée par un autre véhicule (cas limite 10, D34).
 */
export class LicensePlateTakenError extends BusinessError {
  constructor() {
    super("Cette plaque d'immatriculation est déjà utilisée par un autre véhicule.", "LICENSE_PLATE_TAKEN");
    this.name = "LicensePlateTakenError";
  }
}

/**
 * L'utilisateur n'a pas la permission d'effectuer cette action.
 */
export class PermissionError extends BusinessError {
  constructor(message: string) {
    super(message, "PERMISSION_DENIED", undefined, 403);
    this.name = "PermissionError";
  }
}

/**
 * Erreur de validation des données d'entrée.
 */
export class ValidationError extends BusinessError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", undefined, 400);
    this.name = "ValidationError";
  }
}

/**
 * L'annuaire du portail ne répond pas : fermé sur ce client, jeton refusé, panne ou délai dépassé (D25).
 */
export class DirectoryUnavailableError extends BusinessError {
  constructor() {
    super(
      "La recherche de collègues est indisponible : l'annuaire de l'Espace Admission ne répond pas. Réessayez plus tard.",
      "DIRECTORY_UNAVAILABLE",
      undefined,
      503
    );
    this.name = "DirectoryUnavailableError";
  }
}

/**
 * L'annuaire du portail limite le nombre de requêtes (D25).
 */
export class DirectoryRateLimitedError extends BusinessError {
  constructor() {
    super(
      "Trop de recherches dans l'annuaire de l'Espace Admission : réessayez dans un instant.",
      "DIRECTORY_RATE_LIMITED",
      undefined,
      429
    );
    this.name = "DirectoryRateLimitedError";
  }
}

/**
 * La personne choisie par un écran n'est pas (ou plus) dans l'annuaire d'EM Drive (D24).
 */
export class UnknownPersonError extends BusinessError {
  constructor() {
    super(
      "Cette personne n'a pas (ou plus) accès à EM Drive : choisissez-la de nouveau dans la recherche.",
      "PERSON_NOT_IN_DIRECTORY",
      undefined,
      400
    );
    this.name = "UnknownPersonError";
  }
}
