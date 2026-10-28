// src/hooks/use-trips.ts
import useSWR from "swr";
import { TripType, TripStatus } from "@/generated/prisma/enums";

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

export interface TripsResponse {
  trips: DashboardTrip[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useUpcomingTrips() {
  const { data, error, isLoading, mutate } = useSWR<TripsResponse>(
    "/api/trips?status=upcoming&limit=5",
    fetcher,
    {
      refreshInterval: 30000,
    }
  );

  return {
    trips: data?.trips || [],
    isLoading,
    isError: error,
    mutate,
  };
}

export function useMyTrips(userSub?: string) {
  // It's better to fetch upcoming, the backend filters if needed or we filter here.
  // Actually the backend GET /api/trips currently fetches all or filtered by campus/vehicle. 
  // It does not filter by userSub yet. Let's fetch upcoming and filter locally for the dashboard, 
  // or just use upcoming trips for the dashboard widget.
  
  const { trips, isLoading, isError, mutate } = useUpcomingTrips();
  
  // Filter locally for the user's trips (driver or passenger)
  const myTrips = trips.filter(trip => 
    trip.driverSub === userSub ||
    trip.passengers.some(p => p.userSub === userSub)
  );

  return {
    myTrips,
    isLoading,
    isError,
    mutate
  };
}
