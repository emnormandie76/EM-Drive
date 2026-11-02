// src/components/admin/VehicleUnavailabilitiesModal.tsx — Indisponibilités d'un véhicule : maintenance et Car Booking (D58)
// Liste des périodes en cours et à venir, ajout, modification (D68) et retrait. Les heures se saisissent en heure
// locale et partent en ISO (piège 3). Le serveur revérifie tout : un créneau où des trajets sont réservés est
// refusé avec leur liste (409, D60), affichée ici avec un lien vers chacun.

import React, { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Edit, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DatePickerInput } from "@/components/ui/CustomCalendarPicker";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import { fetchJson } from "@/lib/utils/fetch-json";
import { fromLocalFields, toLocalFields } from "@/lib/utils/local-datetime";
import {
  formatPeriod,
  UNAVAILABILITY_LABELS,
  type UnavailabilityItem,
  type UnavailabilityReasonName,
} from "@/lib/utils/unavailability";

/** Un trajet réservé qui empêche la période, tel que le serveur le liste (409 UNAVAILABILITY_TRIPS_CONFLICT). */
interface ConflictingTrip {
  id: string;
  departureTime: string;
  endTime: string;
  driverDisplayName: string;
  origin: string;
  destination: string;
}

/** Une période du véhicule qui chevauche celle qu'on enregistre (409 UNAVAILABILITY_OVERLAP, D70). */
interface OverlappingPeriod {
  id: string;
  reason: UnavailabilityReasonName;
  startsAt: string;
  endsAt: string | null;
}

const formatTrip = (instant: string) => format(new Date(instant), "d MMM 'à' HH:mm", { locale: fr });

const REASON_OPTIONS = (Object.keys(UNAVAILABILITY_LABELS) as UnavailabilityReasonName[]).map((reason) => ({
  value: reason,
  label: UNAVAILABILITY_LABELS[reason],
}));

// ══════════════════════════════════════════════
// FORMULAIRE
// ══════════════════════════════════════════════

interface UnavailabilityFormProps {
  vehicleId: string;
  /** La période à modifier ; absente : une nouvelle. */
  item: UnavailabilityItem | null;
  onCancel: () => void;
  onSaved: () => void;
}

/** Monté à l'ouverture seulement : les champs repartent de la période à chaque fois. */
function UnavailabilityForm({ vehicleId, item, onCancel, onSaved }: UnavailabilityFormProps) {
  const [reason, setReason] = useState<UnavailabilityReasonName>(item?.reason ?? "MAINTENANCE");
  const [startDate, setStartDate] = useState(() => toLocalFields(item?.startsAt ?? new Date()).date);
  const [startTime, setStartTime] = useState(() => toLocalFields(item?.startsAt ?? new Date()).time);
  const [openEnded, setOpenEnded] = useState(item ? item.endsAt === null : false);
  const [endDate, setEndDate] = useState(() => (item?.endsAt ? toLocalFields(item.endsAt).date : ""));
  const [endTime, setEndTime] = useState(() => (item?.endsAt ? toLocalFields(item.endsAt).time : ""));
  const [comment, setComment] = useState(item?.comment ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictingTrip[]>([]);
  const [overlaps, setOverlaps] = useState<OverlappingPeriod[]>([]);

  // La fin est facultative pour une maintenance seulement (D59)
  const canBeOpenEnded = reason === "MAINTENANCE";
  const hasNoEnd = canBeOpenEnded && openEnded;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const startsAt = fromLocalFields(startDate, startTime);
    const endsAt = hasNoEnd ? null : fromLocalFields(endDate, endTime);
    if (!startsAt) {
      toast.error("Renseignez la date et l'heure de début.");
      return;
    }
    if (!hasNoEnd && !endsAt) {
      toast.error(canBeOpenEnded ? "Renseignez la date et l'heure de fin, ou cochez « Sans date de fin »." : "Renseignez la date et l'heure de fin.");
      return;
    }
    if (endsAt && endsAt <= startsAt) {
      toast.error("La fin doit suivre le début.");
      return;
    }

    setIsSaving(true);
    setConflicts([]);
    setOverlaps([]);
    try {
      const res = await fetch(item ? `/api/admin/unavailabilities/${item.id}` : `/api/admin/vehicles/${vehicleId}/unavailabilities`, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt ? endsAt.toISOString() : null,
          comment: comment.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.error === "UNAVAILABILITY_TRIPS_CONFLICT") setConflicts(data.conflictingTrips ?? []);
        if (data?.error === "UNAVAILABILITY_OVERLAP") setOverlaps(data.overlappingPeriods ?? []);
        throw new Error(data?.message || "Impossible d'enregistrer cette indisponibilité.");
      }
      toast.success(item ? "Indisponibilité modifiée." : "Indisponibilité déclarée.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'enregistrer cette indisponibilité.");
    } finally {
      setIsSaving(false);
    }
  };

  const today = toLocalFields(new Date()).date;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Select
        label="Motif"
        value={reason}
        onChange={(e) => setReason(e.target.value as UnavailabilityReasonName)}
        options={REASON_OPTIONS}
      />

      <div className="grid-2">
        {/* Un début passé est permis : une panne peut dater d'hier */}
        <DatePickerInput label="Date de début" value={startDate} onChange={setStartDate} allowPastDates inline />
        <Input type="time" label="Heure de début" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
      </div>

      {canBeOpenEnded && (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
          Sans date de fin (durée de la panne inconnue)
        </label>
      )}

      {!hasNoEnd && (
        <div className="grid-2">
          <DatePickerInput label="Date de fin" value={endDate} onChange={setEndDate} minDate={startDate || today} allowPastDates inline />
          <Input type="time" label="Heure de fin" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </div>
      )}

      <div className="form-field">
        <label className="form-label">Commentaire (visible des administrateurs seulement)</label>
        <textarea
          className="form-input"
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ex : révision au garage, réservation de la direction…"
        />
      </div>

      {overlaps.length > 0 && (
        <div role="alert" style={{ padding: "12px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-danger-bg)", border: "1px solid var(--color-danger)" }}>
          <p style={{ fontWeight: 600, marginBottom: "8px" }}>
            Ce véhicule a déjà une indisponibilité sur cette période. Modifiez-la ou retirez-la d&apos;abord :
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {overlaps.map((period) => (
              <li key={period.id}>
                {UNAVAILABILITY_LABELS[period.reason]} · {formatPeriod(period.startsAt, period.endsAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {conflicts.length > 0 && (
        <div role="alert" style={{ padding: "12px", borderRadius: "var(--radius-sm)", backgroundColor: "var(--color-danger-bg)", border: "1px solid var(--color-danger)" }}>
          <p style={{ fontWeight: 600, marginBottom: "8px" }}>
            Des trajets sont déjà réservés sur cette période. Déplacez-les ou annulez-les d&apos;abord :
          </p>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {conflicts.map((trip) => (
              <li key={trip.id}>
                <Link href={`/trips/${trip.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)", fontWeight: 500 }}>
                  {formatTrip(trip.departureTime)} → {formatTrip(trip.endTime)}
                </Link>{" "}
                · {trip.origin} → {trip.destination} · {trip.driverDisplayName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" isLoading={isSaving}>
          {item ? "Enregistrer" : "Déclarer"}
        </Button>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════
// MODALE
// ══════════════════════════════════════════════

interface VehicleUnavailabilitiesModalProps {
  vehicle: { id: string; name: string };
  onClose: () => void;
  /** Appelé après chaque écriture : l'écran des véhicules relit leur statut. */
  onChanged: () => void;
}

export function VehicleUnavailabilitiesModal({ vehicle, onClose, onChanged }: VehicleUnavailabilitiesModalProps) {
  const { data: periods, error, mutate } = useSWR<UnavailabilityItem[]>(
    `/api/admin/vehicles/${vehicle.id}/unavailabilities`,
    fetchJson
  );
  // « new » : le formulaire d'une nouvelle période ; une période : sa modification ; null : la liste
  const [editing, setEditing] = useState<UnavailabilityItem | "new" | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleSaved = () => {
    setEditing(null);
    mutate();
    onChanged();
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/unavailabilities/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Impossible de retirer cette indisponibilité.");
      }
      toast.success("Indisponibilité retirée.");
      setConfirmingId(null);
      mutate();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de retirer cette indisponibilité.");
    }
  };

  const title = `Indisponibilités — ${vehicle.name}`;

  if (editing) {
    return (
      <Modal isOpen onClose={onClose} title={editing === "new" ? `Nouvelle indisponibilité — ${vehicle.name}` : title}>
        <UnavailabilityForm
          vehicleId={vehicle.id}
          item={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={handleSaved}
        />
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-muted" style={{ fontSize: "0.9rem" }}>
          Périodes en cours et à venir. EM Drive ne propose plus ce véhicule sur ces créneaux ; une réservation sur Car Booking
          s&apos;y déclare à la main.
        </p>

        {error ? (
          <ErrorState compact title="Impossible de charger les indisponibilités" description={error.message} onRetry={() => mutate()} />
        ) : !periods ? (
          <LoadingState compact label="Chargement des indisponibilités…" />
        ) : periods.length === 0 ? (
          <EmptyState compact title="Aucune indisponibilité" description="Ce véhicule n'a aucune indisponibilité en cours ni à venir." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
            {periods.map((period) => {
              const isCurrent = new Date(period.startsAt) <= new Date();
              return (
                <li
                  key={period.id}
                  className="unavailability-item"
                  style={{ padding: "12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <Badge variant={period.reason === "MAINTENANCE" ? "danger" : "warning"}>
                          {UNAVAILABILITY_LABELS[period.reason]}
                        </Badge>
                        {isCurrent && <Badge variant="info">En cours</Badge>}
                      </div>
                      <span>{formatPeriod(period.startsAt, period.endsAt)}</span>
                      {period.comment && <span className="text-muted">{period.comment}</span>}
                      {period.createdByEmail && (
                        <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                          Déclarée par {period.createdByEmail}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {confirmingId === period.id ? (
                        <>
                          <span style={{ fontSize: "0.9rem" }}>Retirer ?</span>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(period.id)}>
                            Oui, retirer
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setConfirmingId(null)}>
                            Non
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing(period)}
                            title="Modifier"
                            aria-label={`Modifier l'indisponibilité ${formatPeriod(period.startsAt, period.endsAt)}`}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmingId(period.id)}
                            title="Retirer"
                            aria-label={`Retirer l'indisponibilité ${formatPeriod(period.startsAt, period.endsAt)}`}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button variant="primary" onClick={() => setEditing("new")}>
            <Plus size={18} />
            Ajouter une indisponibilité
          </Button>
        </div>
      </div>
    </Modal>
  );
}
