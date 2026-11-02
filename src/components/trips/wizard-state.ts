// src/components/trips/wizard-state.ts — État de l'assistant de réservation
// Les résultats proposés sont toujours ceux des critères affichés : un changement du formulaire les efface,
// et seul un véhicule de la recherche en cours se choisit (sinon on réservait sur une recherche périmée).

import type { AvailableVehicle, SuggestedTrip, TripSearchParams } from "./StepSearch";

export type WizardStep = 1 | 2 | 3;

export interface WizardState {
  step: WizardStep;
  /** Dernière recherche et ses résultats ; null tant qu'aucune recherche ne correspond au formulaire. */
  search: {
    params: TripSearchParams;
    vehicles: AvailableVehicle[];
    suggestedTrips: SuggestedTrip[];
  } | null;
  selectedVehicle: AvailableVehicle | null;
}

export type WizardAction =
  | { type: "results"; params: TripSearchParams; vehicles: AvailableVehicle[]; suggestedTrips: SuggestedTrip[] }
  | { type: "formChanged" }
  | { type: "choose"; vehicle: AvailableVehicle }
  | { type: "back" }
  | { type: "vehicleTaken" };

export const initialWizardState: WizardState = { step: 1, search: null, selectedVehicle: null };

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "results":
      return {
        step: 1,
        search: { params: action.params, vehicles: action.vehicles, suggestedTrips: action.suggestedTrips },
        selectedVehicle: null,
      };
    case "formChanged":
      // Même état si rien n'est affiché : pas de rendu inutile à chaque frappe
      if (!state.search && !state.selectedVehicle) return state;
      return { ...state, search: null, selectedVehicle: null };
    case "choose":
      if (!state.search?.vehicles.some((v) => v.id === action.vehicle.id)) return state;
      return { ...state, step: 2, selectedVehicle: action.vehicle };
    case "back":
      return { ...state, step: 1 };
    case "vehicleTaken":
      // Le serveur a refusé le véhicule (pris, en maintenance, ailleurs) : les résultats ne sont plus vrais
      return initialWizardState;
  }
}
