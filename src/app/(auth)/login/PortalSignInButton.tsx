// src/app/(auth)/login/PortalSignInButton.tsx — Bouton « Se connecter avec l'Espace Admission »
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function PortalSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    // Redirige vers le portail (fournisseur « portail ») ; le retour se fait sur /api/auth/callback/portail
    void signIn("portail", { callbackUrl });
  };

  return (
    <button type="button" className="login-button" onClick={handleClick} disabled={loading}>
      {loading ? "Redirection vers l'Espace Admission..." : "Se connecter avec l'Espace Admission"}
    </button>
  );
}
