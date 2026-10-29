// src/app/trips/new/page.tsx
"use client";

import React, { Suspense } from "react";
import { TripWizard } from "@/components/trips/TripWizard";
import { LoadingState } from "@/components/ui/PageState";
import { useSearchParams } from "next/navigation";
import "@/components/dashboard/dashboard.css";

function TripWizardWrapper() {
  const searchParams = useSearchParams();
  const originCampusId = searchParams.get("originCampusId") || undefined;

  return <TripWizard initialOriginCampusId={originCampusId} />;
}

export default function NewTripPage() {
  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-header">
        <div>
          <h1>Réserver un véhicule</h1>
          <p>Trouvez un véhicule disponible ou rejoignez un covoiturage en cours.</p>
        </div>
      </div>

      <section className="dashboard-section">
        {/* Next.js utilise useSearchParams, il faut l'envelopper dans Suspense sinon
           le composant force le rendu dynamique sur toute la route au moment du build */}
        <Suspense fallback={<LoadingState label="Chargement du formulaire…" />}>
          <TripWizardWrapper />
        </Suspense>
      </section>
    </div>
  );
}
