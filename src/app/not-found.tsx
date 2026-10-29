// src/app/not-found.tsx — Page 404 de toute adresse inconnue (D33)

import Link from "next/link";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/PageState";

export default function NotFound() {
  return (
    <div style={{ maxWidth: "640px", margin: "3rem auto" }}>
      <EmptyState
        icon={Compass}
        title="Page introuvable"
        description="L'adresse demandée n'existe pas, ou elle a changé."
        action={
          <Link href="/dashboard" className="btn btn-primary">
            Retour au tableau de bord
          </Link>
        }
      />
    </div>
  );
}
