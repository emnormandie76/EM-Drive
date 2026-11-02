// tests/wizard-state.test.ts — Assistant de réservation : jamais de résultats périmés (étape 1 du chantier
// « indisponibilités et corrections »)

import { describe, expect, it } from "vitest";
import { initialWizardState, wizardReducer, type WizardState } from "@/components/trips/wizard-state";
import type { AvailableVehicle, TripSearchParams } from "@/components/trips/StepSearch";

const params: TripSearchParams = {
  originCampusId: "campus-1",
  destinationText: "Caen",
  destinationCampusId: "campus-2",
  departureTime: new Date("2026-11-10T08:00:00.000Z"),
  estimatedArrivalTime: new Date("2026-11-10T09:30:00.000Z"),
  isRoundTrip: false,
};
const zoe: AvailableVehicle = { id: "vehicle-1", name: "Zoé", licensePlate: "AB-123-CD", seats: 5 };
const clio: AvailableVehicle = { id: "vehicle-2", name: "Clio", licensePlate: "EF-456-GH", seats: 5 };

const searched: WizardState = wizardReducer(initialWizardState, {
  type: "results",
  params,
  vehicles: [zoe],
  suggestedTrips: [],
});

describe("wizardReducer", () => {
  it("garde les résultats d'une recherche, à l'étape de recherche", () => {
    expect(searched.step).toBe(1);
    expect(searched.search?.vehicles).toEqual([zoe]);
  });

  it("efface les résultats dès que le formulaire change", () => {
    const changed = wizardReducer(searched, { type: "formChanged" });
    expect(changed.search).toBeNull();
    expect(changed.selectedVehicle).toBeNull();
  });

  it("ne laisse plus choisir un véhicule de l'ancienne recherche après un changement", () => {
    const changed = wizardReducer(searched, { type: "formChanged" });
    const chosen = wizardReducer(changed, { type: "choose", vehicle: zoe });
    expect(chosen.step).toBe(1);
    expect(chosen.selectedVehicle).toBeNull();
  });

  it("passe à la confirmation avec un véhicule de la recherche en cours", () => {
    const chosen = wizardReducer(searched, { type: "choose", vehicle: zoe });
    expect(chosen.step).toBe(2);
    expect(chosen.selectedVehicle).toEqual(zoe);
  });

  it("refuse un véhicule absent des résultats", () => {
    const chosen = wizardReducer(searched, { type: "choose", vehicle: clio });
    expect(chosen.step).toBe(1);
    expect(chosen.selectedVehicle).toBeNull();
  });

  it("« Retour » depuis la confirmation garde la recherche et ses résultats", () => {
    const back = wizardReducer(wizardReducer(searched, { type: "choose", vehicle: zoe }), { type: "back" });
    expect(back.step).toBe(1);
    expect(back.search?.vehicles).toEqual([zoe]);
  });

  it("un véhicule devenu indisponible efface les résultats et ramène à la recherche", () => {
    const taken = wizardReducer(wizardReducer(searched, { type: "choose", vehicle: zoe }), { type: "vehicleTaken" });
    expect(taken.step).toBe(1);
    expect(taken.search).toBeNull();
    expect(taken.selectedVehicle).toBeNull();
  });
});
