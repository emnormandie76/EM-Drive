/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/trips/StepConfirm.tsx
import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { TripSearchParams } from "./StepSearch";
import { Car, MapPin, Calendar, Clock, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useSession } from "next-auth/react";
import {
  UserSearchAutocomplete,
  UserSuggestion,
} from "@/components/ui/UserSearchAutocomplete";

interface StepConfirmVehicle {
  id: string;
  name: string;
  licensePlate: string;
  seats: number;
}

interface StepConfirmProps {
  params: TripSearchParams;
  vehicle: StepConfirmVehicle;
  onBack: () => void;
  onConfirm: (payload: any) => Promise<void>;
  isLoading: boolean;
}

export function StepConfirm({
  params,
  vehicle,
  onBack,
  onConfirm,
  isLoading,
}: StepConfirmProps) {
  const [comment, setComment] = useState("");
  // Passagers choisis dans l'annuaire du portail (cas limite 11, D27)
  const [passengers, setPassengers] = useState<UserSuggestion[]>([]);

  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.isAdmin === true;
  const [isForMe, setIsForMe] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<UserSuggestion | null>(
    null,
  );
  const driverSub = isForMe ? session?.user?.sub : selectedDriver?.sub;

  /** Le conducteur ne peut pas être passager (D27) : s'il figurait parmi eux, il en sort, avec un message. */
  const assignDriver = (newDriverSub: string | undefined) => {
    const former = passengers.find((p) => p.sub === newDriverSub);
    if (!former) return;
    setPassengers(passengers.filter((p) => p.sub !== newDriverSub));
    toast.info(`${former.name} conduit ce trajet et ne figure plus parmi les passagers.`);
  };

  const handleAddPassenger = (user: UserSuggestion | null) => {
    // Le conducteur et les passagers déjà choisis ne sont pas proposés (excludeSubs)
    if (!user || user.sub === driverSub || passengers.some((p) => p.sub === user.sub)) return;
    // La limite de passagers dépend du véhicule (si seats = 5, on a le conducteur + 4 passagers)
    if (passengers.length >= vehicle.seats - 1) {
      toast.error(
        `La capacité maximale du véhicule (${vehicle.seats} places) est atteinte.`,
      );
      return;
    }
    setPassengers([...passengers, user]);
  };

  const handleRemovePassenger = (index: number) => {
    setPassengers(passengers.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    // API Expects `originCampusId`, `destinationCampusId` or `destinationOtherLabel`.
    const payload = {
      vehicleId: vehicle.id,
      type: params.isRoundTrip ? "ROUND_TRIP" : "ONE_WAY",
      originCampusId: params.originCampusId,
      destinationCampusId: params.destinationCampusId,
      destinationOtherLabel: params.destinationCampusId
        ? undefined
        : params.destinationText,
      // returnCampusId ? si pas renseigné le backend assume l'origine. On passe l'origine.
      returnCampusId: params.isRoundTrip ? params.originCampusId : undefined,
      departureTime: params.departureTime.toISOString(),
      estimatedArrivalTime: params.estimatedArrivalTime.toISOString(),
      returnDepartureTime: params.returnDepartureTime?.toISOString(),
      estimatedReturnArrivalTime:
        params.estimatedReturnArrivalTime?.toISOString(),
      comment,
      // Le sub et l'adresse seulement : le serveur relit le nom et l'adresse dans l'annuaire (D24)
      driverSub:
        !isForMe && selectedDriver ? selectedDriver.sub : undefined,
      driverEmail:
        !isForMe && selectedDriver ? selectedDriver.email : undefined,
      passengers: passengers.map((p) => ({
        userSub: p.sub,
        userEmail: p.email,
      })),
    };

    if (!isForMe && !selectedDriver) {
      toast.error("Veuillez sélectionner un conducteur pour ce trajet.");
      return;
    }

    onConfirm(payload);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "1rem",
            }}
          >
            <Info
              size={22}
              color="var(--color-primary)"
              style={{ display: "block" }}
            />
            <h3
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                margin: 0,
                lineHeight: 1,
                color: "var(--color-text)",
              }}
            >
              Récapitulatif de la réservation
            </h3>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: "1.5rem",
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                }}
              >
                Véhicule
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                }}
              >
                <Car size={16} /> {vehicle.name} ({vehicle.licensePlate})
              </div>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                }}
              >
                Destination
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                }}
              >
                <MapPin size={16} /> {params.destinationText}
              </div>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--color-text)",
                }}
              >
                Départ
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                }}
              >
                <Calendar size={16} />{" "}
                {format(params.departureTime, "dd MMM yyyy à HH:mm", {
                  locale: fr,
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.85rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                <Clock size={14} /> Arrivée estimée :{" "}
                {format(params.estimatedArrivalTime, "HH:mm")}
              </div>
            </div>

            {params.isRoundTrip &&
              params.returnDepartureTime &&
              params.estimatedReturnArrivalTime && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--color-text)",
                    }}
                  >
                    Retour
                  </span>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <Calendar size={16} />{" "}
                    {format(params.returnDepartureTime, "dd MMM yyyy à HH:mm", {
                      locale: fr,
                    })}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "0.85rem",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    <Clock size={14} /> Fin estimée :{" "}
                    {format(params.estimatedReturnArrivalTime, "HH:mm")}
                  </div>
                </div>
              )}
          </div>
        </CardBody>
      </Card>

      {isAdmin && (
        <div style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
          <h4 className="font-semibold mb-3">
            Délégation de réservation (Admin)
          </h4>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "1rem",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={isForMe}
              onChange={(e) => {
                setIsForMe(e.target.checked);
                assignDriver(e.target.checked ? session?.user?.sub : selectedDriver?.sub);
              }}
              style={{ width: "16px", height: "16px" }}
            />
            <span>Ce trajet est pour vous</span>
          </label>

          {!isForMe && (
            <div className="animate-fade-in mt-2">
              <label className="form-label block mb-2 font-medium">
                Rechercher le conducteur assigné
              </label>
              <UserSearchAutocomplete
                placeholder="Ex: Jean Dupont"
                onSelect={(user) => {
                  setSelectedDriver(user);
                  assignDriver(user?.sub);
                }}
              />
              <p
                className="text-sm"
                style={{
                  color: "var(--color-text-muted, #545454ff)",
                  opacity: 0.7,
                  fontStyle: "italic",
                  marginTop: "-1rem",
                }}
              >
                Un email lui sera envoyé pour lui notifier sa prise en charge.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="form-field">
        <label className="form-label">Motif du déplacement (facultatif)</label>
        <Input
          placeholder="Ex: Conférence EMN..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      <div className="p-4 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)]">
        <h4 className="font-semibold mb-3">
          Passagers ({passengers.length} / {vehicle.seats - 1})
        </h4>

        {passengers.map((p, i) => (
          <div
            key={p.sub}
            className="flex justify-between items-center bg-[var(--color-surface)] p-2 mb-2 rounded border border-[var(--color-border)]"
          >
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-[var(--color-text-secondary)]">
                {p.email}
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleRemovePassenger(i)}
            >
              Retirer
            </Button>
          </div>
        ))}

        {passengers.length < vehicle.seats - 1 && (
          <div className="mt-4">
            <UserSearchAutocomplete
              placeholder="Ajouter un passager : nom ou adresse"
              excludeSubs={[
                ...(driverSub ? [driverSub] : []),
                ...passengers.map((p) => p.sub),
              ]}
              clearOnSelect
              onSelect={handleAddPassenger}
            />
          </div>
        )}
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="ghost" onClick={onBack} disabled={isLoading}>
          Retour
        </Button>
        <Button variant="primary" onClick={handleSubmit} isLoading={isLoading}>
          Confirmer la réservation
        </Button>
      </div>
    </div>
  );
}
