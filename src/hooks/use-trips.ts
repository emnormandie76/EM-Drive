// src/hooks/use-trips.ts
import useSWR from "swr";
import { TripType, TripStatus } from "@/generated/prisma/enums";
import { fetchJson } from "@/lib/utils/fetch-json";

export interface DashboardTrip {
  id: string;
  vehicle: {
    id: string;
    name: string;
    licensePlate: string;
    seats: number;
  };
  driverSub: string;
  driverEmail: string;
  driverDisplayName: string;
  type: TripType;
  originCampus: { id: string; name: string };
  destinationCampus: { id: string; name: string } | null;
  destinationOtherLabel: string | null;
  returnCampus: { id: string; name: string } | null;
  departureTime: string;
  estimatedArrivalTime: string;
  returnDepartureTime: string | null;
  estimatedReturnArrivalTime: string | null;
  status: TripStatus;
  displayStatus: "scheduled" | "in_progress" | "completed" | "cancelled";
  seatsAvailable: number;
  passengers: Array<{
    id: string;
    userSub: string;
    userEmail: string;
    userDisplayName: string;
    addedBy: "SELF" | "DRIVER";
  }>;
}

/** Réponse de GET /api/trips/[id] : le trajet, son commentaire et les droits calculés pour l'appelant. */
export interface TripDetailData extends DashboardTrip {
  comment: string | null;
  permissions: {
    canDelete: boolean;
    canModifyDeparture: boolean;
    canJoinAsPassenger: boolean;
  };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TripsResponse {
  trips: DashboardTrip[];
  pagination: Pagination;
}

/** Trajet de GET /api/admin/trips : la ligne complète, colonnes de référence comprises. */
export interface AdminTrip extends DashboardTrip {
  vehicleId: string;
  originCampusId: string;
  destinationCampusId: string | null;
  destinationOtherLat: number | null;
  destinationOtherLng: number | null;
  returnCampusId: string | null;
  comment: string | null;
}

export interface AdminTripsResponse {
  trips: AdminTrip[];
  pagination: Pagination;
}

/**
 * Les cinq prochains trajets de l'appelant (conducteur ou passager). Le serveur filtre avant la limite
 * (`mine=true`) et lit l'identité dans la session (D32).
 */
export function useMyTrips() {
  const { data, error, isLoading, mutate } = useSWR<TripsResponse>(
    "/api/trips?status=upcoming&mine=true&limit=5",
    fetchJson,
    {
      refreshInterval: 30000,
    }
  );

  return {
    myTrips: data?.trips ?? [],
    isLoading,
    isError: error,
    mutate,
  };
}
