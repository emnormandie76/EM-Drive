import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  UserSearchAutocomplete,
  UserSuggestion,
} from "@/components/ui/UserSearchAutocomplete";
import { DatePickerInput } from "@/components/ui/CustomCalendarPicker";
import { getDirections } from "@/hooks/use-geo";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AdminEditTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trip: any; // The trip object to edit
  onSuccess: () => void;
}

export function AdminEditTripModal({
  isOpen,
  onClose,
  trip,
  onSuccess,
}: AdminEditTripModalProps) {
  const { data: campuses } = useSWR<any[]>("/api/campuses", fetcher);
  const { data: vehicles } = useSWR<any[]>("/api/vehicles", fetcher);

  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [vehicleId, setVehicleId] = useState("");
  const [type, setType] = useState("");
  const [originCampusId, setOriginCampusId] = useState("");
  const [destinationCampusId, setDestinationCampusId] = useState("");
  const [destinationOtherLabel, setDestinationOtherLabel] = useState("");
  const [destinationOtherLat, setDestinationOtherLat] = useState<number | null>(
    null,
  );
  const [destinationOtherLng, setDestinationOtherLng] = useState<number | null>(
    null,
  );
  const [status, setStatus] = useState("SCHEDULED");

  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState("");

  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [estimatedReturnArrivalTime, setEstimatedReturnArrivalTime] =
    useState("");

  const [driver, setDriver] = useState<UserSuggestion | null>(null);

  useEffect(() => {
    if (trip && isOpen) {
      setVehicleId(trip.vehicleId || "");
      setType(trip.type || "ONE_WAY");
      setOriginCampusId(trip.originCampusId || "");
      setDestinationCampusId(trip.destinationCampusId || "");
      setDestinationOtherLabel(trip.destinationOtherLabel || "");

      const toLocalDate = (dateStr: string) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
      };

      const toLocalTime = (dateStr: string) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().slice(11, 16);
      };

      const toLocalDatetime = (dateStr: string) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      };

      setDepartureDate(toLocalDate(trip.departureTime));
      setDepartureTime(toLocalTime(trip.departureTime));
      setEstimatedArrivalTime(toLocalDatetime(trip.estimatedArrivalTime));

      setReturnDate(toLocalDate(trip.returnDepartureTime));
      setReturnTime(toLocalTime(trip.returnDepartureTime));
      setEstimatedReturnArrivalTime(
        toLocalDatetime(trip.estimatedReturnArrivalTime),
      );

      setDestinationOtherLat(trip.destinationOtherLat || null);
      setDestinationOtherLng(trip.destinationOtherLng || null);
      setStatus(trip.status || "SCHEDULED");

      if (trip.driverSub) {
        setDriver({
          sub: trip.driverSub,
          displayName: trip.driverDisplayName || "",
          email: trip.driverEmail || "",
        });
      } else {
        setDriver(null);
      }
    }
  }, [trip, isOpen]);

  useEffect(() => {
    if (
      !originCampusId ||
      !departureDate ||
      !departureTime ||
      campuses?.length === 0
    )
      return;

    const computeETA = async () => {
      const originCampus = campuses?.find((c) => c.id === originCampusId);
      if (!originCampus) return;

      let destGeoInfo: [number, number] | null = null;
      if (destinationCampusId) {
        const destCampus = campuses?.find((c) => c.id === destinationCampusId);
        if (destCampus)
          destGeoInfo = [destCampus.longitude, destCampus.latitude];
      } else if (destinationOtherLng && destinationOtherLat) {
        destGeoInfo = [destinationOtherLng, destinationOtherLat];
      } else if (trip && trip.destinationOtherLng && trip.destinationOtherLat) {
        destGeoInfo = [trip.destinationOtherLng, trip.destinationOtherLat];
      }

      if (!destGeoInfo) return;

      const depDateObj = new Date(`${departureDate}T${departureTime}`);

      const routeStats = await getDirections(
        [originCampus.longitude, originCampus.latitude],
        destGeoInfo,
      );

      const durationMs = (routeStats?.durationMin || 60) * 60000;
      const arrTime = new Date(depDateObj.getTime() + durationMs);

      const tzOffset = arrTime.getTimezoneOffset() * 60000;
      setEstimatedArrivalTime(
        new Date(arrTime.getTime() - tzOffset).toISOString().slice(0, 16),
      );

      if (type !== "ONE_WAY" && returnDate && returnTime) {
        const retDateObj = new Date(`${returnDate}T${returnTime}`);
        const retArrTime = new Date(retDateObj.getTime() + durationMs);
        const tzOffsetRet = retArrTime.getTimezoneOffset() * 60000;
        setEstimatedReturnArrivalTime(
          new Date(retArrTime.getTime() - tzOffsetRet)
            .toISOString()
            .slice(0, 16),
        );
      }
    };

    computeETA();
  }, [
    originCampusId,
    destinationCampusId,
    destinationOtherLat,
    destinationOtherLng,
    departureDate,
    departureTime,
    returnDate,
    returnTime,
    type,
    campuses,
    trip,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const depDateObj = new Date(`${departureDate}T${departureTime}`);

    const payload: any = {
      vehicleId,
      type,
      originCampusId,
      departureTime: depDateObj.toISOString(),
      estimatedArrivalTime: new Date(estimatedArrivalTime).toISOString(),
      status,
    };

    if (driver) {
      payload.driverSub = driver.sub;
      payload.driverEmail = driver.email;
      payload.driverDisplayName = driver.displayName;
    }

    if (destinationCampusId) {
      payload.destinationCampusId = destinationCampusId;
      payload.destinationOtherLabel = null;
    } else {
      payload.destinationCampusId = null;
      payload.destinationOtherLabel = destinationOtherLabel;
    }

    if (type !== "ONE_WAY") {
      if (!returnDate || !returnTime || !estimatedReturnArrivalTime) {
        toast.error("Veuillez spécifier les dates de retour.");
        setIsLoading(false);
        return;
      }
      const retDateObj = new Date(`${returnDate}T${returnTime}`);
      payload.returnDepartureTime = retDateObj.toISOString();
      payload.estimatedReturnArrivalTime = new Date(
        estimatedReturnArrivalTime,
      ).toISOString();
    } else {
      payload.returnDepartureTime = null;
      payload.estimatedReturnArrivalTime = null;
    }

    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur lors de la modification.");
      }

      toast.success("Trajet modifié avec succès.");
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Modifier le trajet (Admin)">
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: "500",
            }}
          >
            Conducteur
          </label>
          <UserSearchAutocomplete
            placeholder="Rechercher un conducteur..."
            defaultValue={
              trip?.driverDisplayName
                ? `${trip.driverDisplayName} (${trip.driverEmail})`
                : ""
            }
            onSelect={(user) => setDriver(user)}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: "500",
            }}
          >
            Véhicule
          </label>
          <Select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            options={[
              { value: "", label: "Sélectionner un véhicule" },
              ...(vehicles || []).map((v: any) => ({
                value: v.id,
                label: `${v.name} (${v.licensePlate})`,
              })),
            ]}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: "500",
            }}
          >
            Statut
          </label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "SCHEDULED", label: "Planifié" },
              { value: "CANCELLED", label: "Annulé" },
            ]}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              marginBottom: "0.5rem",
              fontWeight: "500",
            }}
          >
            Type de trajet
          </label>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              { value: "ONE_WAY", label: "Aller simple" },
              { value: "ROUND_TRIP", label: "Aller-retour" },
              { value: "ROUND_TRIP_OTHER", label: "Aller-retour prolongé" },
            ]}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Origine
            </label>
            <Select
              value={originCampusId}
              onChange={(e) => setOriginCampusId(e.target.value)}
              options={[
                { value: "", label: "Sélectionner un campus" },
                ...(campuses || []).map((c: any) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
              required
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Destination Campus
            </label>
            <Select
              value={destinationCampusId}
              onChange={(e) => {
                setDestinationCampusId(e.target.value);
                if (e.target.value) setDestinationOtherLabel("");
              }}
              options={[
                { value: "", label: "Autre destination..." },
                ...(campuses || []).map((c: any) => ({
                  value: c.id,
                  label: c.name,
                })),
              ]}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {!destinationCampusId && (
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Destination (Autre)
            </label>
            <Input
              type="text"
              value={destinationOtherLabel}
              onChange={(e) => setDestinationOtherLabel(e.target.value)}
              placeholder="Adresse ou nom du lieu"
              required={!destinationCampusId}
              style={{ width: "100%" }}
            />
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "flex-start",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "1rem",
              width: "100%",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: 1 }}>
              <DatePickerInput
                label="Date de départ"
                value={departureDate}
                onChange={setDepartureDate}
                minDate={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                label="Heure de départ"
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>
          </div>
          {estimatedArrivalTime && (
            <span
              style={{
                fontSize: "0.85rem",
                color: "var(--color-text-secondary)",
                fontStyle: "italic",
                marginTop: "-0.5rem",
              }}
            >
              Information calculée automatiquement : arrivée le{" "}
              {new Date(estimatedArrivalTime).toLocaleDateString("fr-FR")} vers{" "}
              {new Date(estimatedArrivalTime).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {type !== "ONE_WAY" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              backgroundColor: "var(--color-bg-secondary)",
              borderRadius: "10px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "1rem",
                width: "100%",
                alignItems: "flex-end",
              }}
            >
              <div style={{ flex: 1 }}>
                <DatePickerInput
                  label="Date de retour"
                  value={returnDate}
                  onChange={setReturnDate}
                  minDate={
                    departureDate || new Date().toISOString().split("T")[0]
                  }
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  label="Heure de retour"
                  type="time"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  required
                  style={{ width: "100%" }}
                />
              </div>
            </div>
            {estimatedReturnArrivalTime && (
              <span
                style={{
                  fontSize: "0.85rem",
                  color: "var(--color-text-secondary)",
                  fontStyle: "italic",
                  marginTop: "-0.5rem",
                }}
              >
                Information calculée automatiquement : fin estimée le{" "}
                {new Date(estimatedReturnArrivalTime).toLocaleDateString(
                  "fr-FR",
                )}{" "}
                vers{" "}
                {new Date(estimatedReturnArrivalTime).toLocaleTimeString(
                  "fr-FR",
                  { hour: "2-digit", minute: "2-digit" },
                )}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
            disabled={isLoading}
          >
            Annuler
          </Button>
          <Button variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
