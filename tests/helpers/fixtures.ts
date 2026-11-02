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

/** Un véhicule de 5 places, disponible, rattaché au campus de départ des trajets de test. */
export function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: "vehicle-1",
    seats: 5,
    status: "AVAILABLE" as const,
    defaultCampusId: "campus-1",
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
