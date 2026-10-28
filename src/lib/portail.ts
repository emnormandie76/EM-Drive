// src/lib/portail.ts — Adresses du portail admission, déduites de PORTAIL_ISSUER (contrat portail v1 §3.3, §3.9)
// Les routes du portail se lisent dans sa découverte : aucune n'est écrite en dur.

/** L'émetteur, sans barre finale (contrat §3.3). */
export function portalIssuer(): string {
  return (process.env.PORTAIL_ISSUER ?? "").replace(/\/+$/, "");
}

export function portalDiscoveryUrl(): string {
  return `${portalIssuer()}/.well-known/openid-configuration`;
}

/** L'accueil du portail, pour les liens des pages d'erreur et de refus ; null si l'émetteur manque. */
export function portalHomeUrl(): string | null {
  try {
    return new URL(portalIssuer()).origin;
  } catch {
    return null;
  }
}

/**
 * L'adresse de déconnexion du portail (contrat §3.8) : end_session_endpoint de la découverte, avec
 * id_token_hint, client_id et post_logout_redirect_uri. Null si le portail ne répond pas ou si l'adresse
 * lue n'est pas sur l'émetteur : la déconnexion locale a lieu quand même.
 */
export async function endSessionUrl(idToken: string, postLogoutRedirectUri: string): Promise<string | null> {
  try {
    const response = await fetch(portalDiscoveryUrl(), { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`découverte : HTTP ${response.status}`);
    const { end_session_endpoint: endpoint } = (await response.json()) as { end_session_endpoint?: unknown };
    if (typeof endpoint !== "string") throw new Error("end_session_endpoint absent de la découverte");

    const url = new URL(endpoint);
    if (url.origin !== new URL(portalIssuer()).origin) throw new Error("end_session_endpoint hors de l'émetteur");
    url.searchParams.set("id_token_hint", idToken);
    url.searchParams.set("client_id", process.env.PORTAIL_CLIENT_ID ?? "");
    url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    return url.toString();
  } catch (error) {
    console.error("[AUTH] Déconnexion du portail impossible :", error instanceof Error ? error.message : error);
    return null;
  }
}
