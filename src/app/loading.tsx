// src/app/loading.tsx — Chargement d'une page pendant la navigation (D33)

import { LoadingState } from "@/components/ui/PageState";

export default function Loading() {
  return (
    <div style={{ maxWidth: "640px", margin: "3rem auto" }}>
      <LoadingState label="Chargement de la page…" />
    </div>
  );
}
