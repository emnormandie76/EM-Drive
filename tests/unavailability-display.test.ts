// tests/unavailability-display.test.ts — Libellés des périodes et conversion de l'heure locale (D58, D67, piège 3)

import { describe, expect, it } from "vitest";
import { formatPeriod, UNAVAILABILITY_LABELS } from "@/lib/utils/unavailability";
import { fromLocalFields, toLocalFields } from "@/lib/utils/local-datetime";

describe("libellés des motifs", () => {
  it("nomme la maintenance et la réservation Car Booking", () => {
    expect(UNAVAILABILITY_LABELS.MAINTENANCE).toBe("Maintenance");
    expect(UNAVAILABILITY_LABELS.CAR_BOOKING).toBe("Réservé sur Car Booking");
  });
});

describe("formatPeriod", () => {
  it("donne le début et la fin d'une période datée", () => {
    const text = formatPeriod("2030-11-05T08:00:00.000Z", "2030-11-06T17:00:00.000Z");
    expect(text).toMatch(/^du .* au .*$/);
    expect(text).not.toMatch(/sans date de fin/);
  });

  it("dit « sans date de fin » pour une période ouverte", () => {
    const text = formatPeriod("2030-11-05T08:00:00.000Z", null);
    expect(text).toMatch(/^depuis le .* \(sans date de fin\)$/);
  });
});

describe("heure locale des formulaires", () => {
  it("lit les champs comme un instant, et les écrit de nouveau à l'identique (à la minute)", () => {
    for (const iso of ["2030-01-15T08:30:00.000Z", "2030-03-31T00:30:00.000Z", "2030-10-27T00:30:00.000Z"]) {
      const { date, time } = toLocalFields(iso);
      expect(fromLocalFields(date, time)?.toISOString()).toBe(iso);
    }
  });

  it("accepte un instant déjà converti en Date", () => {
    const instant = new Date("2030-06-01T10:15:00.000Z");
    expect(toLocalFields(instant)).toEqual(toLocalFields(instant.toISOString()));
  });

  it("rend null quand un champ manque", () => {
    expect(fromLocalFields("", "08:00")).toBeNull();
    expect(fromLocalFields("2030-01-15", "")).toBeNull();
    expect(fromLocalFields("pas-une-date", "08:00")).toBeNull();
  });
});
