// src/lib/utils/local-datetime.ts — Date et heure saisies dans l'heure du navigateur (piège 3)
// Les formulaires saisissent une date (AAAA-MM-JJ) et une heure (HH:MM) locales (Europe/Paris) ; elles partent au
// serveur en ISO UTC (`Date.toISOString()`). Le décalage du changement d'heure est celui de l'instant lu.

/** Date (AAAA-MM-JJ) et heure (HH:MM) locales d'un instant, pour les champs du formulaire. */
export function toLocalFields(instant: string | Date) {
  const d = new Date(instant);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** Instant saisi dans les champs (heure locale du navigateur) ; null si un champ manque ou n'est pas une date. */
export function fromLocalFields(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return isNaN(value.getTime()) ? null : value;
}
