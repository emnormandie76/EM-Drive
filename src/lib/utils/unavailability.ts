// src/lib/utils/unavailability.ts — Libellés et affichage des périodes d'indisponibilité (D58, D67)
// Partagé par l'écran admin, le calendrier du véhicule et le tableau de bord (composants client : aucun import
// de la base).

import { format } from "date-fns";
import { fr } from "date-fns/locale";

export type UnavailabilityReasonName = "CAR_BOOKING" | "MAINTENANCE";

/** Ce que l'API rend d'une période : le motif et les dates pour tous ; le commentaire et l'auteur aux admins (D67). */
export interface UnavailabilityItem {
  id: string;
  reason: UnavailabilityReasonName;
  startsAt: string;
  endsAt: string | null;
  comment?: string | null;
  createdByEmail?: string;
}

export const UNAVAILABILITY_LABELS: Record<UnavailabilityReasonName, string> = {
  MAINTENANCE: "Maintenance",
  CAR_BOOKING: "Réservé sur Car Booking",
};

const formatInstant = (instant: string | Date) => format(new Date(instant), "d MMM yyyy 'à' HH:mm", { locale: fr });

/** « du 5 nov. 2030 à 08:00 au 6 nov. 2030 à 18:00 », ou « depuis le … (sans date de fin) ». */
export function formatPeriod(startsAt: string | Date, endsAt: string | Date | null): string {
  return endsAt
    ? `du ${formatInstant(startsAt)} au ${formatInstant(endsAt)}`
    : `depuis le ${formatInstant(startsAt)} (sans date de fin)`;
}

/** Une période sans fin n'a pas de limite : pour la placer dans un calendrier, on la prolonge très loin. */
export const OPEN_ENDED = new Date("9999-12-31T00:00:00.000Z");

/** Le morceau d'une période sur une rangée de jours du calendrier (une semaine, ou une semaine du mois). */
export interface BarSegment {
  item: UnavailabilityItem;
  /** Première et dernière colonnes couvertes (0 = premier jour de la rangée), bornes comprises. */
  startCol: number;
  endCol: number;
  /** Voie d'empilement : 0 en haut ; des segments qui partagent une colonne ne partagent pas de voie. */
  lane: number;
  /** La période commençait avant la rangée : le bandeau porte une flèche à gauche. */
  continuesBefore: boolean;
  /** La période finit après la rangée (ou n'a pas de fin) : flèche à droite. */
  continuesAfter: boolean;
}

/**
 * Place les périodes sur une rangée de jours consécutifs (D71) : chacune en un seul bandeau continu, sur les jours
 * qu'elle couvre, et non en un bloc par jour. Les jours et les heures sont ceux du navigateur. Une période couvre
 * un jour si elle le recouvre ; sa fin est exclue (une période qui finit à minuit pile ne couvre pas le jour qui
 * commence), comme dans tout le contrôle des créneaux. Les voies s'attribuent du premier segment au dernier, dans
 * l'ordre des colonnes puis du début ; des périodes superposées (reprises avant D70) s'empilent.
 */
export function layoutUnavailabilityBars(
  days: Date[],
  items: UnavailabilityItem[]
): { segments: BarSegment[]; lanes: number } {
  const dayStarts = days.map((day) => new Date(day.getFullYear(), day.getMonth(), day.getDate()));
  const dayEnds = days.map((day) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
  const rowStart = dayStarts[0];
  const rowEnd = dayEnds[dayEnds.length - 1];

  const placed = items
    .map((item) => {
      const startsAt = new Date(item.startsAt);
      const endsAt = item.endsAt ? new Date(item.endsAt) : OPEN_ENDED;
      const covered = days.map((_, col) => col).filter((col) => startsAt < dayEnds[col] && endsAt > dayStarts[col]);
      if (covered.length === 0) return null;
      return {
        start: startsAt.getTime(),
        segment: {
          item,
          startCol: covered[0],
          endCol: covered[covered.length - 1],
          continuesBefore: startsAt < rowStart,
          continuesAfter: endsAt > rowEnd,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.segment.startCol - b.segment.startCol || a.start - b.start);

  // Première voie dont le dernier segment finit avant la colonne de début de celui-ci
  const laneEnds: number[] = [];
  const segments: BarSegment[] = placed.map(({ segment }) => {
    let lane = laneEnds.findIndex((lastCol) => lastCol < segment.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = segment.endCol;
    return { ...segment, lane };
  });

  return { segments, lanes: laneEnds.length };
}
