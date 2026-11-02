// tests/helpers/fixtures.ts — Données de test : trajets et passagers

export const DRIVER = "driver-id";
export const PASSENGER = "passenger-id";
export const OTHER = "other-id";

export function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export interface PassengerFixture {
  id: string;
  tripId: string;
  userSub: string;
  userEmail: string;
  userDisplayName: string;
  addedBy: "SELF" | "DRIVER";
}

export function makePassenger(overrides: Partial<PassengerFixture> = {}): PassengerFixture {
  return {
    id: "passenger-row-1",
    tripId: "trip-1",
    userSub: PASSENGER,
    userEmail: "passenger@em-normandie.fr",
    userDisplayName: "Passager",
    addedBy: "SELF",
    ...overrides,
  };
}

/**
 * Un véhicule de 5 places, rattaché au campus de départ des trajets de test. Il n'a plus de statut : sa
 * disponibilité vient de ses périodes d'indisponibilité (D58, D59).
 */
export function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "vehicle-1",
    seats: 5,
    defaultCampusId: "campus-1",
    ...overrides,
  };
}

/** Une période d'indisponibilité du véhicule `vehicle-1` ; sans fin par défaut, comme une panne de durée inconnue. */
export function makeUnavailability(overrides: Record<string, unknown> = {}) {
  return {
    id: "unavailability-1",
    vehicleId: "vehicle-1",
    reason: "MAINTENANCE" as "MAINTENANCE" | "CAR_BOOKING",
    startsAt: new Date("2030-01-01T10:00:00.000Z"),
    endsAt: null as Date | null,
    comment: null as string | null,
    createdBySub: "admin-id",
    createdByEmail: "admin@em-normandie.fr",
    createdAt: new Date("2029-12-01T09:00:00.000Z"),
    updatedAt: new Date("2029-12-01T09:00:00.000Z"),
    ...overrides,
  };
}

/** Un aller simple dans 72 h, de campus-1 à campus-2, véhicule de 5 places, sans passager. */
export function makeTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: "trip-1",
    vehicleId: "vehicle-1",
    driverSub: DRIVER,
    driverEmail: "driver@em-normandie.fr",
    driverDisplayName: "Conducteur",
    type: "ONE_WAY" as const,
    status: "SCHEDULED" as const,
    originCampusId: "campus-1",
    destinationCampusId: "campus-2" as string | null,
    returnCampusId: null as string | null,
    departureTime: hoursFromNow(72),
    estimatedArrivalTime: hoursFromNow(74),
    returnDepartureTime: null as Date | null,
    estimatedReturnArrivalTime: null as Date | null,
    passengers: [] as PassengerFixture[],
    vehicle: { id: "vehicle-1", seats: 5 },
    ...overrides,
  };
}
