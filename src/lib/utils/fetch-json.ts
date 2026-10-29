// src/lib/utils/fetch-json.ts — Lecture JSON des routes API par les écrans (SWR)
// Une réponse d'erreur (`{ error, message }`, statut 4xx ou 5xx) devient une erreur, et non des données :
// l'écran affiche alors son état d'erreur au lieu d'une liste vide.

export class FetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "FetchError";
  }
}

type ErrorBody = { error?: string; message?: string };

export async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // Réseau coupé ou serveur arrêté : le navigateur ne donne qu'un « Failed to fetch » en anglais
    throw new FetchError("Le serveur ne répond pas. Vérifiez votre connexion, puis réessayez.", 0);
  }
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const { error, message } = (body ?? {}) as ErrorBody;
    throw new FetchError(message || "Le serveur n'a pas répondu comme prévu.", res.status, error);
  }

  return body as T;
}
