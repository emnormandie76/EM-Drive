// src/components/trips/StepSearch.tsx
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ErrorState } from "@/components/ui/PageState";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { GeoLocation, getDirections } from "@/hooks/use-geo";
import type { Campus } from "@/hooks/use-vehicles";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { DatePickerInput } from "@/components/ui/CustomCalendarPicker";
import { fetchJson } from "@/lib/utils/fetch-json";
import "./trips.css";

import useSWR from "swr";

export interface TripSearchParams {
  originCampusId: string;
  destinationText: string;
  destinationCampusId?: string;
  departureTime: Date;
  estimatedArrivalTime: Date;
  returnDepartureTime?: Date;
  estimatedReturnArrivalTime?: Date;
  isRoundTrip: boolean;
}

/** Véhicule libre rendu par GET /api/vehicles/availability. */
export interface AvailableVehicle {
  id: string;
  name: string;
  licensePlate: string;
  seats: number;
}

/** Covoiturage proposé par GET /api/vehicles/availability (dates en texte ISO, comme toute réponse JSON). */
export interface SuggestedTrip {
  id: string;
  driverDisplayName: string;
  departureTime: string;
  origin: string;
  destination: string;
  seatsAvailable: number;
}

interface AvailabilityResponse {
  availableVehicles: AvailableVehicle[];
  suggestedTrips: SuggestedTrip[];
}

interface StepSearchProps {
  onResults: (
    params: TripSearchParams,
    vehicles: AvailableVehicle[],
    suggestedTrips: SuggestedTrip[]
  ) => void;
  initialParams?: Partial<TripSearchParams>;
}

export function StepSearch({ onResults, initialParams }: StepSearchProps) {
  const { data: campuses, error: campusesError, mutate: retryCampuses } = useSWR<Campus[]>("/api/campuses", fetchJson);
  const CAMPUSES = useMemo(() => campuses ?? [], [campuses]);

  const [originCampusId, setOriginCampusId] = useState(
    initialParams?.originCampusId || ""
  );

  const [destinationMode, setDestinationMode] = useState<"CAMPUS" | "OTHER">("CAMPUS");
  const [destCampusId, setDestCampusId] = useState("");

  // Set default values once campuses are loaded
  React.useEffect(() => {
    if (CAMPUSES.length > 0) {
      if (!originCampusId) setOriginCampusId(CAMPUSES[0].id);
      if (!destCampusId) setDestCampusId(CAMPUSES[1]?.id || CAMPUSES[0].id);
    }
  }, [CAMPUSES, originCampusId, destCampusId]);
  const [destinationGeo, setDestinationGeo] = useState<GeoLocation | null>(null);

  const [isRoundTripState, setIsRoundTripState] = useState(initialParams?.isRoundTrip ?? false);
  const isRoundTrip = destinationMode === "OTHER" ? true : isRoundTripState;

  const handleIsRoundTripChange = (checked: boolean) => {
    if (destinationMode === "OTHER") return; // Forcé si "Autre"
    setIsRoundTripState(checked);
  };

  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (CAMPUSES.length === 0) return;

    if (!departureDate || !departureTime) {
      toast.error("Veuillez renseigner la date et l'heure de départ.");
      return;
    }

    setIsLoading(true);

    try {
      const originCampus = CAMPUSES.find(c => c.id === originCampusId);
      if (!originCampus) throw new Error("Campus origine invalide");

      let destLabel = "";
      let destGeoInfo: [number, number];

      if (destinationMode === "CAMPUS") {
        if (originCampusId === destCampusId) {
          toast.error("L'origine et la destination ne peuvent pas être le même campus.");
          setIsLoading(false);
          return;
        }
        const dc = CAMPUSES.find(c => c.id === destCampusId);
        if (!dc) throw new Error("Campus destination invalide");
        destLabel = dc.name;
        destGeoInfo = [dc.longitude, dc.latitude];
      } else {
        if (!destinationGeo) {
          toast.error("Veuillez sélectionner une destination valide.");
          setIsLoading(false);
          return;
        }
        destLabel = destinationGeo.label;
        destGeoInfo = [destinationGeo.longitude, destinationGeo.latitude];
      }

      // 1. Compute ETA
      const depDateObj = new Date(`${departureDate}T${departureTime}`);

      const routeStats = await getDirections(
        [originCampus.longitude, originCampus.latitude],
        destGeoInfo
      );

      const durationMs = (routeStats?.durationMin || 60) * 60000;
      const estimatedArrivalTime = new Date(depDateObj.getTime() + durationMs);

      let returnDateObj: Date | undefined;
      let estimatedReturnArrivalTime: Date | undefined;

      if (isRoundTrip) {
        if (!returnDate || !returnTime) {
          toast.error("Veuillez renseigner la date et l'heure de retour.");
          setIsLoading(false);
          return;
        }
        returnDateObj = new Date(`${returnDate}T${returnTime}`);
        if (returnDateObj <= estimatedArrivalTime) {
          toast.error("L'heure de retour doit être postérieure à l'arrivée.");
          setIsLoading(false);
          return;
        }
        estimatedReturnArrivalTime = new Date(returnDateObj.getTime() + durationMs);
      }

      const params: TripSearchParams = {
        originCampusId,
        destinationText: destLabel,
        destinationCampusId: destinationMode === "CAMPUS" ? destCampusId : undefined,
        departureTime: depDateObj,
        estimatedArrivalTime,
        returnDepartureTime: returnDateObj,
        estimatedReturnArrivalTime,
        isRoundTrip,
      };

      // 2. Fetch available vehicles
      const queryParams = new URLSearchParams({
        originCampusId: params.originCampusId,
        departureTime: params.departureTime.toISOString(),
        estimatedArrivalTime: params.estimatedArrivalTime.toISOString(),
      });
      if (params.returnDepartureTime && params.estimatedReturnArrivalTime) {
        queryParams.append("returnDepartureTime", params.returnDepartureTime.toISOString());
        queryParams.append("estimatedReturnArrivalTime", params.estimatedReturnArrivalTime.toISOString());
      }

      const response = await fetch(`/api/vehicles/availability?${queryParams.toString()}`);
      if (!response.ok) throw new Error("Erreur lors de la recherche des véhicules.");

      const data: AvailabilityResponse = await response.json();

      onResults(params, data.availableVehicles, data.suggestedTrips);

    } catch (error) {
      toast.error((error instanceof Error && error.message) || "Erreur de calcul.");
    } finally {
      setIsLoading(false);
    }
  };

  if (campusesError) {
    return (
      <ErrorState
        title="Impossible de charger les campus"
        description={campusesError.message}
        onRetry={() => retryCampuses()}
        compact
      />
    );
  }

  return (
    <form onSubmit={handleSearch} className="flex flex-col gap-4">
      {!campuses ? (
        <div className="text-center p-4 text-muted" role="status">Chargement des campus…</div>
      ) : (
        <div className="grid-2">
          <Select
            label="Campus de départ"
            options={CAMPUSES.map(c => ({ value: c.id, label: c.name }))}
            value={originCampusId}
            onChange={(e) => setOriginCampusId(e.target.value)}
            required
          />

          <div className="form-field">
            <label className="form-label">Destination</label>
            <div className="flex flex-col gap-2">
              <Select
                options={[
                  ...CAMPUSES.map(c => ({ value: c.id, label: c.name })),
                  { value: "OTHER", label: "Autre adresse externe..." }
                ]}
                value={destinationMode === "CAMPUS" ? destCampusId : "OTHER"}
                onChange={(e) => {
                  if (e.target.value === "OTHER") {
                    setDestinationMode("OTHER");
                  } else {
                    setDestinationMode("CAMPUS");
                    setDestCampusId(e.target.value);
                  }
                }}
              />
              {destinationMode === "OTHER" && (
                <div className="animate-slide-up mt-1">
                  <AddressAutocomplete
                    placeholder="Rechercher une adresse (API BAN)..."
                    onSelect={setDestinationGeo}
                    defaultValue={initialParams?.destinationText}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <DatePickerInput
          label="Date de départ"
          value={departureDate}
          onChange={setDepartureDate}
          minDate={new Date().toISOString().split('T')[0]}
        />
        <Input
          type="time"
          label="Heure de départ"
          value={departureTime}
          onChange={(e) => setDepartureTime(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-3 mt-4 mb-6">
        <div className="trip-type-toggle">
          <button
            type="button"
            className={`toggle-btn ${!isRoundTrip ? "active" : ""}`}
            onClick={() => handleIsRoundTripChange(false)}
            disabled={destinationMode === "OTHER"}
          >
            Aller simple
          </button>
          <button
            type="button"
            className={`toggle-btn ${isRoundTrip ? "active" : ""}`}
            onClick={() => handleIsRoundTripChange(true)}
            disabled={destinationMode === "OTHER"}
          >
            Aller-retour
          </button>
        </div>
      </div>

      {isRoundTrip && (
        <div className="grid-2" style={{ background: 'var(--color-background)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
          <DatePickerInput
            label="Date de retour"
            value={returnDate}
            onChange={setReturnDate}
            minDate={departureDate || new Date().toISOString().split('T')[0]}
          />
          <Input
            type="time"
            label="Heure de retour"
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
            required
          />
        </div>
      )}

      <div className="search-submit-container">
        <Button
          type="submit"
          variant="primary"
          isLoading={isLoading}
          className="search-submit-btn"
        >
          <Search size={20} className="mr-2" />
          Rechercher des véhicules disponibles
        </Button>
      </div>
    </form>
  );
}
