"use client";
// src/app/global-error.tsx — Erreur de la mise en page racine elle-même (D33).
// Elle remplace cette mise en page : elle porte ses propres <html> et <body> et importe les styles globaux.

import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="fr">
      <body>
        <title>ResaVroom — Erreur</title>
        <div className="login-container">
          <div className="login-card" role="alert">
            <div className="login-header">
              <div className="login-logo">🚗</div>
              <h1>ResaVroom</h1>
              <p>L&#39;application n&#39;a pas pu s&#39;afficher.</p>
            </div>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem", textAlign: "center" }}>
              {error.digest
                ? `Réessayez ; si l'erreur revient, signalez-la avec ce code : ${error.digest}.`
                : "Réessayez ; si l'erreur revient, signalez-la."}
            </p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
              <button type="button" className="login-button" onClick={() => unstable_retry()}>
                Réessayer
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
