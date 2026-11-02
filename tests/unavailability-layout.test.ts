// tests/unavailability-layout.test.ts — Le bandeau continu du calendrier (D71)
// Une période de plusieurs jours s'affiche en un seul bandeau sur les jours couverts, libellé une fois ; la mise en
// page (colonnes, flèches de débordement, voies d'empilement) est une fonction pure, testée ici sans écran.
// Les jours et les heures sont locaux, comme dans le navigateur : les tests ne dépendent pas du fuseau.

import { describe, expect, it } from "vitest";
import { layoutUnavailabilityBars, type UnavailabilityItem } from "@/lib/utils/unavailability";

/** Une semaine du lundi 7 au dimanche 13 janvier 2030 (dates locales). */
const week = Array.from({ length: 7 }, (_, i) => new Date(2030, 0, 7 + i));
/** Un instant local : le jour du mois de janvier 2030, à l'heure donnée. */
const local = (day: number, hour = 0, minute = 0) => new Date(2030, 0, day, hour, minute);

const period = (id: string, startsAt: Date, endsAt: Date | null, reason: "MAINTENANCE" | "CAR_BOOKING" = "MAINTENANCE"): UnavailabilityItem => ({
  id,
  reason,
  startsAt: startsAt.toISOString(),
  endsAt: endsAt ? endsAt.toISOString() : null,
});

const layout = (...items: UnavailabilityItem[]) => layoutUnavailabilityBars(week, items);

describe("layoutUnavailabilityBars : colonnes", () => {
  it("une période d'un seul jour occupe une seule colonne, sans flèche", () => {
    const { segments } = layout(period("a", local(9, 8), local(9, 18)));
    expect(segments).toEqual([
      expect.objectContaining({ startCol: 2, endCol: 2, lane: 0, continuesBefore: false, continuesAfter: false }),
    ]);
  });

  it("une période de plusieurs jours est un seul segment continu", () => {
    const { segments } = layout(period("a", local(8, 8), local(10, 18)));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startCol: 1, endCol: 3, continuesBefore: false, continuesAfter: false });
  });

  it("une période qui commence avant la semaine déborde à gauche", () => {
    const { segments } = layout(period("a", local(2, 8), local(9, 12)));
    expect(segments[0]).toMatchObject({ startCol: 0, endCol: 2, continuesBefore: true, continuesAfter: false });
  });

  it("une période qui finit après la semaine déborde à droite", () => {
    const { segments } = layout(period("a", local(12, 8), local(20, 12)));
    expect(segments[0]).toMatchObject({ startCol: 5, endCol: 6, continuesBefore: false, continuesAfter: true });
  });

  it("une période sans fin court jusqu'à la dernière colonne et déborde à droite", () => {
    const { segments } = layout(period("a", local(10, 8), null));
    expect(segments[0]).toMatchObject({ startCol: 3, endCol: 6, continuesAfter: true });
  });

  it("une période sans fin commencée avant la semaine couvre toute la semaine", () => {
    const { segments } = layout(period("a", local(1, 8), null));
    expect(segments[0]).toMatchObject({ startCol: 0, endCol: 6, continuesBefore: true, continuesAfter: true });
  });

  it("la fin est exclue : une période qui finit à minuit pile ne couvre pas le jour qui commence", () => {
    // Du mardi 8 à 8 h au jeudi 10 à minuit : mardi et mercredi (colonnes 1 et 2), pas jeudi (colonne 3)
    const { segments } = layout(period("a", local(8, 8), local(10, 0)));
    expect(segments[0]).toMatchObject({ startCol: 1, endCol: 2, continuesAfter: false });
  });

  it("un début à minuit pile couvre ce jour", () => {
    const { segments } = layout(period("a", local(10, 0), local(10, 6)));
    expect(segments[0]).toMatchObject({ startCol: 3, endCol: 3 });
  });

  it("une période hors de la semaine n'a pas de segment", () => {
    expect(layout(period("a", local(1, 8), local(6, 23, 59)), period("b", local(14, 0), local(15, 0))).segments).toEqual([]);
  });

  it("une période qui finit à minuit pile avant la semaine n'y touche pas", () => {
    expect(layout(period("a", local(5, 8), local(7, 0))).segments).toEqual([]);
  });

  it("garde l'élément d'origine, pour le libellé et le commentaire", () => {
    const item = period("a", local(8, 8), local(9, 8), "CAR_BOOKING");
    expect(layout(item).segments[0].item).toBe(item);
  });
});

describe("layoutUnavailabilityBars : voies", () => {
  it("sans période, aucune voie", () => {
    expect(layout()).toEqual({ segments: [], lanes: 0 });
  });

  it("des périodes qui ne se recouvrent pas partagent la même voie", () => {
    const { segments, lanes } = layout(period("a", local(7, 8), local(8, 18)), period("b", local(9, 8), local(10, 18)));
    expect(segments.map((s) => s.lane)).toEqual([0, 0]);
    expect(lanes).toBe(1);
  });

  it("deux périodes dont les jours se partagent une colonne s'empilent (même jour, heures différentes)", () => {
    const { segments, lanes } = layout(period("a", local(8, 8), local(8, 12)), period("b", local(8, 14), local(8, 18), "CAR_BOOKING"));
    expect(segments.map((s) => s.lane).sort()).toEqual([0, 1]);
    expect(lanes).toBe(2);
  });

  it("des périodes superposées (données reprises avant D70) s'empilent sur des voies distinctes", () => {
    const { segments, lanes } = layout(period("a", local(8, 8), local(11, 18)), period("b", local(10, 8), local(12, 18)));
    expect(new Set(segments.map((s) => s.lane)).size).toBe(2);
    expect(lanes).toBe(2);
  });

  it("rend les segments dans l'ordre des colonnes puis du début", () => {
    const { segments } = layout(period("late", local(11, 8), local(11, 12)), period("early", local(8, 8), local(8, 12)));
    expect(segments.map((s) => s.item.id)).toEqual(["early", "late"]);
  });
});
