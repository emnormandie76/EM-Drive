"use client";
// src/app/error.tsx — Erreur de rendu d'une page (D33) : la mise en page racine et la barre de navigation restent

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/PageState";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ maxWidth: "640px", margin: "3rem auto" }}>
      <ErrorState
        title="Cette page n'a pas pu s'afficher"
        description={
          error.digest
            ? `Réessayez ; si l'erreur revient, signalez-la avec ce code : ${error.digest}.`
            : "Réessayez ; si l'erreur revient, signalez-la."
        }
        onRetry={() => unstable_retry()}
        action={
          <Link href="/dashboard" className="btn btn-ghost">
            Tableau de bord
          </Link>
        }
      />
    </div>
  );
}
