// src/lib/validators/request-schemas.ts — Validation des corps de requête (cas limite 6)
// Chaque route d'écriture lit son corps par parseJsonBody : un corps invalide donne
// une ValidationError (400) au lieu d'une erreur 500. Les champs inconnus sont ignorés.

import { z } from "zod";
import { ValidationError } from "@/lib/utils/errors";

// Messages d'erreur en français
z.config(z.locales.fr());

// ══════════════════════════════════════════════
// BRIQUES
// ══════════════════════════════════════════════

const id = z.string().trim().min(1);
const displayName = z.string().trim().min(1).max(200);
const tripType = z.enum(["ONE_WAY", "ROUND_TRIP", "ROUND_TRIP_OTHER"]);

/** Date et heure ISO (« 2026-11-02T08:00:00.000Z »), convertie en Date. Refuse null et les dates invalides. */
const dateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const passenger = z.object({
  userEntraId: id,
  userEmail: z.email(),
  userDisplayName: displayName,
});

// ══════════════════════════════════════════════
// TRAJETS
// ══════════════════════════════════════════════

/** POST /api/trips */
export const createTripSchema = z
  .object({
    vehicleId: id,
    type: tripType,
    originCampusId: id,
    destinationCampusId: id.optional(),
    destinationOtherLabel: z.string().trim().min(1).max(200).optional(),
    destinationOtherLat: z.number().min(-90).max(90).optional(),
    destinationOtherLng: z.number().min(-180).max(180).optional(),
    returnCampusId: id.optional(),
    departureTime: dateTime,
    estimatedArrivalTime: dateTime,
    returnDepartureTime: dateTime.optional(),
    estimatedReturnArrivalTime: dateTime.optional(),
    comment: z.string().max(1000).optional(),
    // Pris en compte seulement pour un admin (POST /api/trips)
    driverEntraId: id.optional(),
    driverEmail: z.email().optional(),
    driverDisplayName: displayName.optional(),
    passengers: z.array(passenger).max(8).optional(),
  })
  .refine((trip) => trip.destinationCampusId || trip.destinationOtherLabel, {
    message: "Une destination (campus ou adresse) est requise.",
    path: ["destinationCampusId"],
  })
  .refine((trip) => trip.estimatedArrivalTime > trip.departureTime, {
    message: "L'arrivée prévue doit suivre le départ.",
    path: ["estimatedArrivalTime"],
  })
  .refine(
    (trip) =>
      !trip.returnDepartureTime ||
      !trip.estimatedReturnArrivalTime ||
      trip.estimatedReturnArrivalTime > trip.returnDepartureTime,
    { message: "L'arrivée du retour doit suivre son départ.", path: ["estimatedReturnArrivalTime"] }
  );

/** PATCH /api/trips/[id] : horaire (conducteur) ou modification libre (admin). Null efface un champ. */
export const updateTripSchema = z.object({
  vehicleId: id.optional(),
  type: tripType.optional(),
  status: z.enum(["SCHEDULED", "CANCELLED"]).optional(),
  originCampusId: id.optional(),
  destinationCampusId: id.nullable().optional(),
  destinationOtherLabel: z.string().trim().max(200).nullable().optional(),
  destinationOtherLat: z.number().min(-90).max(90).nullable().optional(),
  destinationOtherLng: z.number().min(-180).max(180).nullable().optional(),
  returnCampusId: id.nullable().optional(),
  departureTime: dateTime.optional(),
  estimatedArrivalTime: dateTime.optional(),
  returnDepartureTime: dateTime.nullable().optional(),
  estimatedReturnArrivalTime: dateTime.nullable().optional(),
  comment: z.string().max(1000).nullable().optional(),
  driverEntraId: id.optional(),
  driverEmail: z.email().optional(),
  driverDisplayName: displayName.optional(),
});

export type UpdateTripInput = z.output<typeof updateTripSchema>;

/** POST /api/trips/[id]/passengers : sans addedBy, l'utilisateur s'inscrit lui-même. */
export const addPassengerSchema = z
  .object({
    addedBy: z.enum(["SELF", "DRIVER"]).default("SELF"),
    userEntraId: id.optional(),
    userEmail: z.email().optional(),
    userDisplayName: displayName.optional(),
  })
  .refine((body) => body.addedBy === "SELF" || (body.userEntraId && body.userEmail && body.userDisplayName), {
    message: "userEntraId, userEmail et userDisplayName sont requis pour addedBy=DRIVER.",
    path: ["addedBy"],
  });

// ══════════════════════════════════════════════
// VÉHICULES ET PARAMÈTRES
// ══════════════════════════════════════════════

/** POST /api/admin/vehicles. Places conducteur compris : 2 à 9 (permis B). */
export const createVehicleSchema = z.object({
  name: displayName,
  licensePlate: z.string().trim().min(1).max(20),
  seats: z.coerce.number().int().min(2).max(9),
  defaultCampusId: id,
  status: z.enum(["AVAILABLE", "MAINTENANCE"]).optional(),
});

/** PATCH /api/admin/vehicles/[id] */
export const updateVehicleSchema = createVehicleSchema.partial();

/** PATCH /api/admin/settings : seule la clé buffer_minutes existe ; valeur en minutes (0 à 1440). */
export const updateSettingSchema = z.object({
  key: z.literal("buffer_minutes"),
  value: z
    .union([z.number(), z.string().trim().regex(/^\d+$/, "Nombre entier de minutes attendu.")])
    .transform(Number)
    .pipe(z.number().int().min(0).max(1440))
    .transform(String),
});

// ══════════════════════════════════════════════
// LECTURE DU CORPS
// ══════════════════════════════════════════════

/**
 * Lit le corps JSON d'une requête et le valide.
 * Lève une ValidationError (400) si le JSON est mal formé ou si un champ est invalide.
 */
export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema
): Promise<z.output<Schema>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Le corps de la requête n'est pas un JSON valide.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    throw new ValidationError(field ? `${field} : ${issue.message}` : issue.message);
  }
  return result.data;
}
