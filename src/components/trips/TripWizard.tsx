// src/components/trips/TripWizard.tsx
"use client";

import React, { useReducer, useState } from "react";
import { StepSearch, type AvailableVehicle, type SuggestedTrip, type TripSearchParams } from "./StepSearch";
import { StepConfirm } from "./StepConfirm";
import { initialWizardState, wizardReducer } from "./wizard-state";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageState";
import { Users, Info, Settings } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** Refus du serveur qui rendent les résultats faux : véhicule pris, en maintenance ou ailleurs (D62). */
const VEHICLE_REFUSALS = ["VEHICLE_CONFLICT", "VEHICLE_UNAVAILABLE", "VEHICLE_NOT_AT_CAMPUS"];

interface TripWizardProps {
  initialOriginCampusId?: string;
}

export function TripWizard({ initialOriginCampusId }: TripWizardProps) {
  const router = useRouter();
  const [{ step, search, selectedVehicle }, dispatch] = useReducer(wizardReducer, initialWizardState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSearchResults = (
    params: TripSearchParams,
    vehicles: AvailableVehicle[],
    trips: SuggestedTrip[]
  ) => {
    // On reste à l'étape 1 pour que l'utilisateur choisisse son véhicule
    dispatch({ type: "results", params, vehicles, suggestedTrips: trips });
  };

  const handleBookVehicle = (vehicle: AvailableVehicle) => {
    dispatch({ type: "choose", vehicle });
  };

  const handleConfirm = async (payload: unknown) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (VEHICLE_REFUSALS.includes(data.error)) {
          toast.error("Ce véhicule n'est plus disponible.", {
            description: `${data.message} Relancez la recherche.`
          });
          dispatch({ type: "vehicleTaken" });
          return;
        }
        throw new Error(data.message || "Erreur lors de la réservation.");
      }

      toast.success("Réservation confirmée !");
      router.push(`/trips/${data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la réservation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="wizard-content">
      <div className="wizard-steps">
        <div className={`wizard-step ${step >= 1 ? (step > 1 ? "completed" : "active") : ""}`}>
          <div className="wizard-step-circle">1</div>
          Recherche
        </div>
        <div className={`wizard-step ${step >= 2 ? (step > 2 ? "completed" : "active") : ""}`}>
          <div className="wizard-step-circle">2</div>
          Confirmation
        </div>
        <div className={`wizard-step ${step === 3 ? "active" : ""}`}>
          <div className="wizard-step-circle">3</div>
          Terminé
        </div>
      </div>

      {/* Toujours monté : « Retour » depuis la confirmation retrouve le formulaire rempli et ses résultats */}
      <div className="animate-fade-in" hidden={step !== 1}>
        <Card className="mb-8">
          <CardBody>
            <StepSearch
              onResults={handleSearchResults}
              onFormChange={() => dispatch({ type: "formChanged" })}
              initialParams={{
                originCampusId: initialOriginCampusId
              }}
            />
          </CardBody>
        </Card>

        {search && (
          <div className="animate-slide-up">
            {search.suggestedTrips.length > 0 && (
              <div className="carpool-suggestion">
                <h4><Users size={20} /> Covoiturage suggéré</h4>
                <p className="mb-2 text-sm" style={{ color: "var(--color-success)" }}>
                  Des trajets correspondent déjà à vos critères. Pourquoi ne pas vous joindre à eux ?
                </p>
                <div className="flex flex-col gap-2">
                  {search.suggestedTrips.map(t => (
                    <div
                      key={t.id}
                      className="bg-white p-3 rounded flex justify-between items-center gap-2"
                      style={{ color: "var(--color-text)", flexWrap: "wrap" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong>{t.origin} → {t.destination}</strong>
                        <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Conduit par {t.driverDisplayName} • {t.seatsAvailable} place(s) restante(s)</div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => router.push(`/trips/${t.id}`)}
                      >
                        Voir le trajet
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h3 className="vehicle-results-title">
              Véhicules disponibles ({search.vehicles.length})
            </h3>

            {search.vehicles.length === 0 ? (
              <EmptyState
                icon={Info}
                title="Aucun véhicule trouvé"
                description="Il n'y a aucun véhicule disponible pour ce créneau sur ce campus. Essayez un autre horaire."
              />
            ) : (
              <div className="vehicle-results-grid">
                {search.vehicles.map(veh => (
                  <div key={veh.id} className="vehicle-result-card">
                    <div className="vehicle-result-body">
                      <div className="vehicle-result-header">
                        <h3 className="vehicle-result-title">
                          {veh.name}
                        </h3>
                        <span className="vehicle-result-badge">
                          Disponible
                        </span>
                      </div>
                      <div className="vehicle-result-info">
                        <div className="vehicle-result-info-row">
                          <Settings size={16} className="vehicle-result-info-icon" />
                          <span>Immat. : <strong className="vehicle-result-info-val">{veh.licensePlate}</strong></span>
                        </div>
                        <div className="vehicle-result-info-row">
                          <Users size={16} className="vehicle-result-info-icon" />
                          <span>Capacité : <strong className="vehicle-result-info-val">{veh.seats} places</strong></span>
                        </div>
                      </div>
                    </div>
                    <div className="vehicle-result-footer">
                      <Button
                        variant="primary"
                        className="vehicle-result-select-btn"
                        onClick={() => handleBookVehicle(veh)}
                      >
                        Choisir ce véhicule
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {step === 2 && search && selectedVehicle && (
        <div className="animate-fade-in">
          <StepConfirm
            params={search.params}
            vehicle={selectedVehicle}
            onBack={() => dispatch({ type: "back" })}
            onConfirm={handleConfirm}
            isLoading={isSubmitting}
          />
        </div>
      )}

    </div>
  );
}
