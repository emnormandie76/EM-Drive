// src/app/(auth)/login/page.tsx — Page de connexion : par le portail admission (contrat portail v1 §3.6)
// Un bouton lance la connexion ; la page ne la relance jamais d'elle-même. Une erreur OIDC revient ici
// avec ?error=… (pages.error) : message neutre et lien vers le portail, sans boucle.

import { portalHomeUrl } from "@/lib/portail";
import { PortalSignInButton } from "./PortalSignInButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const hasError = params.error !== undefined;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/dashboard";
  const portalUrl = portalHomeUrl();

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo / Titre */}
        <div className="login-header">
          <div className="login-logo">🚗</div>
          <h1>EM Drive</h1>
          <p>Réservation de véhicules inter-campus</p>
        </div>

        {/* Message d'erreur neutre : le détail reste dans les journaux du serveur */}
        {hasError && (
          <div className="login-error" role="alert">
            La connexion n&apos;a pas abouti. Vous pouvez réessayer, ou passer par le portail.
          </div>
        )}

        <div className="unauthorized-actions">
          <PortalSignInButton callbackUrl={callbackUrl} />
          {portalUrl && (
            <a href={portalUrl} className="login-link">
              Ouvrir le portail
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
