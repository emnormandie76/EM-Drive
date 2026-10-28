// tests/request-schemas.test.ts — Validation des corps de requête (cas limite 6)
// Les exemples valides reprennent ce qu'envoie l'interface (StepConfirm, AdminEditTripModal, admin).

import { describe, expect, it } from "vitest";
import {
  addPassengerSchema,
  createTripSchema,
  createVehicleSchema,
  parseJsonBody,
  updateSettingSchema,
  updateTripSchema,
  updateVehicleSchema,
} from "@/lib/validators/request-schemas";
import { ValidationError } from "@/lib/utils/errors";

const departure = "2026-11-02T08:00:00.000Z";
const arrival = "2026-11-02T10:00:00.000Z";

/** Corps envoyé par StepConfirm pour un aller-retour entre campus. */
const stepConfirmBody = {
  vehicleId: "vehicle-1",
  type: "ROUND_TRIP",
  originCampusId: "campus-1",
  destinationCampusId: "campus-2",
  returnCampusId: "campus-1",
  departureTime: departure,
  estimatedArrivalTime: arrival,
  returnDepartureTime: "2026-11-02T16:00:00.000Z",
  estimatedReturnArrivalTime: "2026-11-02T18:00:00.000Z",
  comment: "",
  passengers: [],
};

function jsonRequest(body: string) {
  return new Request("http://localhost/api/test", { method: "POST", body });
}

describe("createTripSchema", () => {
  it("accepte le corps de StepConfirm et convertit les dates", () => {
    const parsed = createTripSchema.parse(stepConfirmBody);
    expect(parsed.departureTime).toEqual(new Date(departure));
    expect(parsed.estimatedReturnArrivalTime).toBeInstanceOf(Date);
  });

  it("accepte une destination libre sans campus", () => {
    const body = { ...stepConfirmBody, type: "ONE_WAY", destinationCampusId: undefined, destinationOtherLabel: "Rouen" };
    expect(createTripSchema.safeParse(body).success).toBe(true);
  });

  it("refuse une date invalide", () => {
    expect(createTripSchema.safeParse({ ...stepConfirmBody, departureTime: "pas-une-date" }).success).toBe(false);
  });

  it("refuse une date nulle (qui deviendrait le 1er janvier 1970)", () => {
    expect(createTripSchema.safeParse({ ...stepConfirmBody, departureTime: null }).success).toBe(false);
  });

  it("refuse une arrivée avant le départ", () => {
    expect(createTripSchema.safeParse({ ...stepConfirmBody, estimatedArrivalTime: "2026-11-02T07:00:00.000Z" }).success).toBe(false);
  });

  it("refuse un trajet sans destination", () => {
    expect(createTripSchema.safeParse({ ...stepConfirmBody, destinationCampusId: undefined }).success).toBe(false);
  });

  it("refuse un type inconnu", () => {
    expect(createTripSchema.safeParse({ ...stepConfirmBody, type: "TELEPORT" }).success).toBe(false);
  });

  it("exige l'identité de chaque passager (cas limite 11 : StepConfirm envoie nom et e-mail seuls)", () => {
    const body = { ...stepConfirmBody, passengers: [{ userEmail: "p@em-normandie.fr", userDisplayName: "P" }] };
    expect(createTripSchema.safeParse(body).success).toBe(false);
  });

  it("ignore les champs inconnus", () => {
    const parsed = createTripSchema.parse({ ...stepConfirmBody, isAdmin: true });
    expect(parsed).not.toHaveProperty("isAdmin");
  });
});

describe("updateTripSchema", () => {
  it("accepte le corps d'AdminEditTripModal, avec ses champs à null", () => {
    const body = {
      vehicleId: "vehicle-1",
      type: "ONE_WAY",
      originCampusId: "campus-1",
      departureTime: departure,
      estimatedArrivalTime: arrival,
      status: "SCHEDULED",
      destinationCampusId: null,
      destinationOtherLabel: "Rouen",
      returnDepartureTime: null,
      estimatedReturnArrivalTime: null,
    };
    const parsed = updateTripSchema.parse(body);
    expect(parsed.returnDepartureTime).toBeNull();
    expect(parsed.departureTime).toEqual(new Date(departure));
  });

  it("n'ajoute pas les champs absents (le PATCH horaire reste un PATCH horaire)", () => {
    expect(Object.keys(updateTripSchema.parse({ departureTime: departure }))).toEqual(["departureTime"]);
  });

  it("refuse un statut inconnu", () => {
    expect(updateTripSchema.safeParse({ status: "DONE" }).success).toBe(false);
  });
});

describe("addPassengerSchema", () => {
  it("considère un corps vide comme une inscription de soi-même", () => {
    expect(addPassengerSchema.parse({})).toEqual({ addedBy: "SELF" });
  });

  it("exige l'identité du passager pour un ajout par le conducteur", () => {
    expect(addPassengerSchema.safeParse({ addedBy: "DRIVER" }).success).toBe(false);
  });

  it("accepte un ajout complet par le conducteur", () => {
    const body = { addedBy: "DRIVER", userSub: "u1", userEmail: "u1@em-normandie.fr", userDisplayName: "U1" };
    expect(addPassengerSchema.safeParse(body).success).toBe(true);
  });

  it("refuse une autre valeur de addedBy", () => {
    expect(addPassengerSchema.safeParse({ addedBy: "ADMIN" }).success).toBe(false);
  });
});

describe("schémas des véhicules", () => {
  const vehicle = { name: "Zoé", licensePlate: "AB-123-CD", seats: 5, defaultCampusId: "campus-1" };

  it("accepte le corps du formulaire d'ajout", () => {
    expect(createVehicleSchema.parse(vehicle)).toMatchObject({ seats: 5 });
  });

  it("refuse un nombre de places qui n'est pas un entier", () => {
    expect(createVehicleSchema.safeParse({ ...vehicle, seats: "abc" }).success).toBe(false);
  });

  it("refuse moins de 2 ou plus de 9 places (conducteur compris)", () => {
    expect(createVehicleSchema.safeParse({ ...vehicle, seats: 1 }).success).toBe(false);
    expect(createVehicleSchema.safeParse({ ...vehicle, seats: 10 }).success).toBe(false);
  });

  it("accepte une modification partielle (passage en maintenance)", () => {
    expect(updateVehicleSchema.parse({ status: "MAINTENANCE" })).toEqual({ status: "MAINTENANCE" });
  });

  it("refuse un statut inconnu", () => {
    expect(updateVehicleSchema.safeParse({ status: "BROKEN" }).success).toBe(false);
  });
});

describe("updateSettingSchema", () => {
  it("accepte buffer_minutes envoyé en texte par la page des paramètres", () => {
    expect(updateSettingSchema.parse({ key: "buffer_minutes", value: "45" })).toEqual({ key: "buffer_minutes", value: "45" });
  });

  it("refuse une clé inconnue", () => {
    expect(updateSettingSchema.safeParse({ key: "admin_password", value: "x" }).success).toBe(false);
  });

  it("refuse une valeur qui n'est pas un nombre entier de minutes", () => {
    expect(updateSettingSchema.safeParse({ key: "buffer_minutes", value: "-5" }).success).toBe(false);
    expect(updateSettingSchema.safeParse({ key: "buffer_minutes", value: "trente" }).success).toBe(false);
  });
});

describe("parseJsonBody", () => {
  it("rend le corps validé", async () => {
    await expect(parseJsonBody(jsonRequest("{}"), addPassengerSchema)).resolves.toEqual({ addedBy: "SELF" });
  });

  it("lève une ValidationError sur un JSON mal formé", async () => {
    await expect(parseJsonBody(jsonRequest("{oups"), addPassengerSchema)).rejects.toBeInstanceOf(ValidationError);
  });

  it("lève une ValidationError qui nomme le champ fautif", async () => {
    const error = await parseJsonBody(jsonRequest(JSON.stringify({ addedBy: "ADMIN" })), addPassengerSchema).catch((e) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toContain("addedBy");
  });
});
