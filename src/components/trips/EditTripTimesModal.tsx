// src/components/trips/EditTripTimesModal.tsx — « Modifier les horaires » : départ et, pour un aller-retour, retour (D61)
// Les arrivées gardent les durées de route du trajet ; le serveur revérifie tout (conflits, véhicule, D63).

import React, { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DatePickerInput } from "@/components/ui/CustomCalendarPicker";
import type { TripDetailData } from "@/hooks/use-trips";
import { fromLocalFields, toLocalFields } from "@/lib/utils/local-datetime";

const durationMs = (from: string, to: string) => new Date(to).getTime() - new Date(from).getTime();
const formatLocal = (date: Date) => format(date, "EEEE d MMMM 'à' HH:mm", { locale: fr });

interface EditTripTimesModalProps {
  trip: TripDetailData;
  onClose: () => void;
  onSaved: () => void;
}

/** Monté à l'ouverture seulement : les champs repartent des horaires du trajet à chaque fois. */
export function EditTripTimesModal({ trip, onClose, onSaved }: EditTripTimesModalProps) {
  const hasReturn = trip.type !== "ONE_WAY" && !!trip.returnDepartureTime && !!trip.estimatedReturnArrivalTime;

  const [departureDate, setDepartureDate] = useState(() => toLocalFields(trip.departureTime).date);
  const [departureTime, setDepartureTime] = useState(() => toLocalFields(trip.departureTime).time);
  const [returnDate, setReturnDate] = useState(() => (trip.returnDepartureTime ? toLocalFields(trip.returnDepartureTime).date : ""));
  const [returnTime, setReturnTime] = useState(() => (trip.returnDepartureTime ? toLocalFields(trip.returnDepartureTime).time : ""));
  const [isSaving, setIsSaving] = useState(false);

  const departure = fromLocalFields(departureDate, departureTime);
  const arrival = departure && new Date(departure.getTime() + durationMs(trip.departureTime, trip.estimatedArrivalTime));
  const returnDeparture = hasReturn ? fromLocalFields(returnDate, returnTime) : null;
  const returnArrival =
    returnDeparture &&
    new Date(returnDeparture.getTime() + durationMs(trip.returnDepartureTime!, trip.estimatedReturnArrivalTime!));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departure || !arrival) {
      toast.error("Renseignez la date et l'heure de départ.");
      return;
    }
    if (hasReturn && !returnDeparture) {
      toast.error("Renseignez la date et l'heure de retour.");
      return;
    }
    if (returnDeparture && returnDeparture <= arrival) {
      toast.error("Le retour doit partir après l'arrivée de l'aller.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departureTime: departure.toISOString(),
          ...(returnDeparture && { returnDepartureTime: returnDeparture.toISOString() }),
        }),
      });
      if (!res.ok) {
        // Le message du serveur : conflit, véhicule indisponible ou ailleurs, règle des 48 h, trajet parti
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Impossible de modifier les horaires.");
      }
      toast.success("Horaires modifiés.");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de modifier les horaires.");
    } finally {
      setIsSaving(false);
    }
  };

  const today = toLocalFields(new Date().toISOString()).date;
  const hintStyle = { fontSize: "0.85rem", color: "var(--color-text-secondary)", fontStyle: "italic" } as const;

  return (
    <Modal isOpen onClose={onClose} title="Modifier les horaires">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid-2">
          <DatePickerInput label="Date de départ" value={departureDate} onChange={setDepartureDate} minDate={today} inline />
          <Input
            type="time"
            label="Heure de départ"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            required
          />
        </div>
        {arrival && <p style={hintStyle}>Arrivée prévue {formatLocal(arrival)}</p>}

        {hasReturn && (
          <>
            <div className="grid-2">
              <DatePickerInput
                label="Date de retour"
                value={returnDate}
                onChange={setReturnDate}
                minDate={departureDate || today}
                inline
              />
              <Input
                type="time"
                label="Heure de retour"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                required
              />
            </div>
            {returnArrival && <p style={hintStyle}>Arrivée du retour prévue {formatLocal(returnArrival)}</p>}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" isLoading={isSaving}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
