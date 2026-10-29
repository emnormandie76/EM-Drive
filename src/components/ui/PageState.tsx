// src/components/ui/PageState.tsx — États communs des écrans : chargement, vide, erreur (D33)

import React from "react";
import { AlertTriangle, Inbox, LoaderCircle, type LucideIcon } from "lucide-react";
import { Button } from "./Button";
import "./ui.css";

interface StateProps {
  /** Texte secondaire, sous le titre. */
  description?: React.ReactNode;
  /** Liens ou boutons proposés sous le texte. */
  action?: React.ReactNode;
  /** Version resserrée, pour une section d'écran plutôt qu'un écran entier. */
  compact?: boolean;
}

export function LoadingState({ label = "Chargement…", compact }: { label?: string; compact?: boolean }) {
  return (
    <div className={`state-panel ${compact ? "state-compact" : ""}`} role="status" aria-live="polite">
      <LoaderCircle size={28} className="state-icon icon-spin" aria-hidden="true" />
      <p className="state-desc">{label}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact,
}: StateProps & { icon?: LucideIcon; title: string }) {
  return (
    <div className={`state-panel ${compact ? "state-compact" : ""}`}>
      <Icon size={40} className="state-icon" aria-hidden="true" />
      <p className="state-title">{title}</p>
      {description && <p className="state-desc">{description}</p>}
      {action && <div className="state-actions">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Impossible d'afficher ces données",
  description = "Le serveur n'a pas répondu comme prévu. Réessayez dans un instant.",
  onRetry,
  action,
  compact,
}: StateProps & { title?: string; onRetry?: () => void }) {
  return (
    <div className={`state-panel state-error ${compact ? "state-compact" : ""}`} role="alert">
      <AlertTriangle size={40} className="state-icon" aria-hidden="true" />
      <p className="state-title">{title}</p>
      {description && <p className="state-desc">{description}</p>}
      {(onRetry || action) && (
        <div className="state-actions">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Réessayer
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
