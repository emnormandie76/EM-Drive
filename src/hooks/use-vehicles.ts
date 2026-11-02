// src/hooks/use-vehicles.ts
import useSWR from "swr";
import { fetchJson } from "@/lib/utils/fetch-json";
import type { UnavailabilityReasonName } from "@/lib/utils/unavailability";

export type VehicleDisplayStatus = "available" | "in_trip" | "maintenance" | "car_booking" | "fully_booked";

export interface Campus {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface VehicleWithPosition {
  id: string;
  name: string;
  licensePlate: string;
  seats: number;
  defaultCampusId: string;
  defaultCampus: Campus;
  currentCampus: Campus;
  displayStatus: VehicleDisplayStatus;
  /** La période d'indisponibilité en cours (motif et dates, jamais le commentaire, D67) ; null si aucune. */
  currentUnavailability: { reason: UnavailabilityReasonName; startsAt: string; endsAt: string | null } | null;
  nextTrip: {
    id: string;
    departureTime: string;
    destination: string;
  } | null;
}

export function useVehicles(options?: { refreshInterval?: number }) {
  const { data, error, isLoading, mutate } = useSWR<VehicleWithPosition[]>(
    "/api/vehicles",
    fetchJson,
    {
      refreshInterval: options?.refreshInterval ?? 30000, // 30s polling by default
    }
  );

  return {
    vehicles: Array.isArray(data) ? data : [],
    isLoading,
    isError: error,
    mutate,
  };
}
