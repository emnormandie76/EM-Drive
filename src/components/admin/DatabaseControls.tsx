"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Database, Trash2, RefreshCw } from "lucide-react";
import { Card, CardBody, CardTitle, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  getNeonMetrics,
  cleanupDatabase,
  type CleanupTarget,
  type CleanupTripStatus,
  type NeonMetrics,
  type UsageMetric,
} from "@/app/admin/settings/actions";

/** Mot à taper pour confirmer une suppression définitive (cas limite 8). */
const CONFIRMATION_WORD = "SUPPRIMER";

const TRIP_STATUS_LABELS: Record<CleanupTripStatus, string> = {
  ALL: "Tous les statuts",
  CANCELLED: "Annulés uniquement",
  SCHEDULED: "Terminés (non annulés)",
};

function MetricCard({
  title,
  data,
  unit,
}: {
  title: string;
  data: UsageMetric;
  unit: string;
}) {
  const isDanger = data.percent >= 80;

  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h5
        style={{
          margin: 0,
          fontSize: "0.85rem",
          color: "var(--color-text-secondary)",
        }}
      >
        {title}
      </h5>
      <div
        style={{
          marginTop: "0.5rem",
          fontSize: "1.4rem",
          fontWeight: "bold",
          color: isDanger
            ? "var(--color-danger, #ef4444)"
            : "var(--color-success, #22c55e)",
        }}
      >
        {data.value}{" "}
        <span
          style={{
            fontSize: "0.85rem",
            color: "var(--color-text-tertiary)",
            fontWeight: "normal",
          }}
        >
          / {data.limit} {unit}
        </span>
      </div>
      <div
        style={{
          marginTop: "0.5rem",
          height: "4px",
          width: "100%",
          backgroundColor: "var(--color-border)",
          borderRadius: "2px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(data.percent, 100)}%`,
            height: "100%",
            backgroundColor: isDanger
              ? "var(--color-danger, #ef4444)"
              : "var(--color-success, #22c55e)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

export function DatabaseControls() {
  const [metrics, setMetrics] = useState<NeonMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleaningTarget, setCleaningTarget] = useState<CleanupTarget>("TRIPS");
  const [tripStatus, setTripStatus] = useState<CleanupTripStatus>("ALL");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  // Appel à l'API Neon (à quota) : seulement sur demande, jamais à l'ouverture de la page (D35, règle 7)
  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const m = await getNeonMetrics();
      if ("configured" in m) {
        toast.info("Métriques Neon non configurées sur cet environnement : consultez la console Neon.");
        return;
      }
      setMetrics(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de charger les métriques.");
    } finally {
      setLoadingMetrics(false);
    }
  };

  const openConfirmation = () => {
    setConfirmation("");
    setConfirmOpen(true);
  };

  const handleCleanup = async () => {
    if (confirmation !== CONFIRMATION_WORD) return;

    setIsCleaning(true);
    try {
      const count = await cleanupDatabase(cleaningTarget, tripStatus);
      toast.success(`${count} enregistrement(s) supprimé(s).`);
      setConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Le nettoyage a échoué.");
    } finally {
      setIsCleaning(false);
    }
  };

  const cleanupDescription =
    cleaningTarget === "TRIPS"
      ? `Les trajets terminés depuis plus d'un mois (${TRIP_STATUS_LABELS[tripStatus].toLowerCase()}) et leurs passagers seront supprimés définitivement.`
      : "Les journaux d'audit enregistrés il y a plus d'un mois seront supprimés définitivement.";

  return (
    <Card style={{ width: "100%" }}>
      <CardHeader
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <CardTitle
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            margin: 0,
          }}
        >
          <Database size={24} style={{ color: "var(--color-primary)" }} />
          Base de données & Stockage
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchMetrics}
          disabled={loadingMetrics}
        >
          <RefreshCw
            size={16}
            className={loadingMetrics ? "animate-spin" : ""}
            style={{ marginRight: "8px" }}
          />
          {metrics ? "Actualiser" : "Charger les métriques"}
        </Button>
      </CardHeader>
      <CardBody>
        {!metrics && (
          <p
            className="text-muted"
            style={{
              textAlign: "center",
              padding: "1rem",
              fontSize: "0.9rem",
            }}
          >
            {loadingMetrics
              ? "Chargement des métriques Neon..."
              : "Les métriques Neon ne sont chargées qu'à la demande (appel à l'API Neon)."}
          </p>
        )}

        {metrics && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <MetricCard title="Compute" data={metrics.compute} unit="CU-hrs" />
            <MetricCard
              title="Stockage données"
              data={metrics.storage}
              unit="GB"
            />
            <MetricCard
              title="Réseau sortant"
              data={metrics.network}
              unit="GB"
            />
            <MetricCard
              title="Branches actives"
              data={metrics.branches}
              unit=""
            />
          </div>
        )}

        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: "1.5rem",
          }}
        >
          <h4 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            Nettoyage Périodique
          </h4>
          <p
            className="text-muted"
            style={{ fontSize: "0.9rem", marginBottom: "1rem" }}
          >
            Supprimez les trajets terminés depuis <strong>plus d&#39;un mois</strong>, ou les journaux
            d&#39;audit de plus d&#39;un mois, pour libérer de l&#39;espace.
          </p>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: "150px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                  fontWeight: "500",
                }}
              >
                Cible à nettoyer
              </label>
              <Select
                value={cleaningTarget}
                onChange={(e) =>
                  setCleaningTarget(e.target.value as CleanupTarget)
                }
                options={[
                  { value: "TRIPS", label: "Trajets (et réservations)" },
                  { value: "AUDIT_LOGS", label: "Journaux d'audit" },
                ]}
                style={{ width: "100%" }}
              />
            </div>

            {cleaningTarget === "TRIPS" && (
              <div style={{ flex: 1, minWidth: "150px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontSize: "0.9rem",
                    fontWeight: "500",
                  }}
                >
                  Statut des trajets
                </label>
                <Select
                  value={tripStatus}
                  onChange={(e) => setTripStatus(e.target.value as CleanupTripStatus)}
                  options={Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <Button variant="danger" disabled={isCleaning} onClick={openConfirmation}>
                <Trash2 size={16} style={{ marginRight: "8px" }} />
                Nettoyer
              </Button>
            </div>
          </div>
        </div>
      </CardBody>

      <Modal
        isOpen={confirmOpen}
        onClose={() => !isCleaning && setConfirmOpen(false)}
        title="Confirmer le nettoyage"
      >
        <p style={{ marginBottom: "1rem" }}>{cleanupDescription}</p>
        <p className="text-muted" style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>
          Cette suppression est irréversible. Pour confirmer, tapez <strong>{CONFIRMATION_WORD}</strong>.
        </p>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={CONFIRMATION_WORD}
          aria-label="Mot de confirmation"
          autoComplete="off"
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={isCleaning}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={handleCleanup}
            disabled={confirmation !== CONFIRMATION_WORD}
            isLoading={isCleaning}
          >
            Supprimer définitivement
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
