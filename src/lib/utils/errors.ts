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
      "La recherche de collègues est indisponible : l'annuaire du portail ne répond pas. Réessayez plus tard.",
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
    super("Trop de recherches dans l'annuaire du portail : réessayez dans un instant.", "DIRECTORY_RATE_LIMITED", undefined, 429);
    this.name = "DirectoryRateLimitedError";
  }
}

/**
 * La personne choisie par un écran n'est pas (ou plus) dans l'annuaire de ResaVroom (D24).
 */
export class UnknownPersonError extends BusinessError {
  constructor() {
    super(
      "Cette personne n'a pas (ou plus) accès à ResaVroom : choisissez-la de nouveau dans la recherche.",
      "PERSON_NOT_IN_DIRECTORY",
      undefined,
      400
    );
    this.name = "UnknownPersonError";
  }
}
