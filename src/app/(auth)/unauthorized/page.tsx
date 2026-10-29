// src/app/(auth)/unauthorized/page.tsx — Connexion refusée par EM Drive (contrat portail v1 §3.2, D20, D22)
// Cible du rappel signIn quand le compte du portail ne peut pas être rattaché : adresse déjà liée à un
// autre sub (adresse réattribuée), rôle non déclaré. Le refus d'accès lui-même s'affiche sur le portail.

import Link from "next/link";
import { portalHomeUrl } from "@/lib/portail";

export default function UnauthorizedPage() {
  const portalUrl = portalHomeUrl();

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🔒</div>
          <h1>Connexion refusée</h1>
          <p>
            EM Drive ne peut pas ouvrir de session avec ce compte. Contactez l&apos;administrateur du
            portail.
          </p>
        </div>

        <div className="unauthorized-actions">
          {portalUrl && (
            <a href={portalUrl} className="login-button">
              Retour au portail
            </a>
          )}
          <Link href="/login" className="login-link">
            Page de connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
