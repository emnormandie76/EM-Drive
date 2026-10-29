"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Save, Clock } from "lucide-react";
import { Card, CardBody, CardTitle, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState } from "@/components/ui/PageState";
import { DatabaseControls } from "@/components/admin/DatabaseControls";
import { fetchJson } from "@/lib/utils/fetch-json";

/** Ligne de app_settings rendue par GET /api/admin/settings. */
interface AppSettingRow {
  key: string;
  value: string;
}

export default function AdminSettingsPage() {
  const {
    data: settings,
    error,
    mutate,
  } = useSWR<AppSettingRow[]>("/api/admin/settings", fetchJson);

  const [bufferMinutes, setBufferMinutes] = useState("30");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings && settings.length > 0) {
      const bufferSetting = settings.find(
        (s) => s.key === "buffer_minutes",
      );
      if (bufferSetting) {
        setBufferMinutes(bufferSetting.value);
      }
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "buffer_minutes", value: bufferMinutes }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Erreur lors de la sauvegarde.");
      }

      toast.success("Paramètres mis à jour avec succès.");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
    } finally {
      setIsSaving(false);
    }
  };

  if (error)
    return (
      <ErrorState
        title="Impossible de charger les paramètres"
        description={error.message}
        onRetry={() => mutate()}
      />
    );
  if (!settings) return <LoadingState label="Chargement des paramètres…" />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Paramètres Globaux</h1>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "2rem",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 min(400px, 100%)", maxWidth: "600px" }}>
          <DatabaseControls />
        </div>

        <div style={{ flex: "1 1 min(400px, 100%)", maxWidth: "600px" }}>
          <Card style={{ width: "100%" }}>
            <CardHeader>
              <CardTitle
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Clock size={24} style={{ color: "var(--color-primary)" }} />
                Configuration de la flotte
              </CardTitle>
            </CardHeader>
            <CardBody>
              <form onSubmit={handleSave}>
                <div style={{ marginBottom: "1.5rem" }}>
                  <p
                    className="text-muted"
                    style={{ fontSize: "0.9rem", marginBottom: "1rem" }}
                  >
                    C&#39;est le temps minimum nécessaire avant qu&#39;un
                    véhicule puisse être réservé à nouveau après un trajet.
                    Permet d&#39;absorber les retards et de garantir la
                    disponibilité.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                    }}
                  >
                    <Input
                      type="number"
                      label="Temps de buffer entre les réservations"
                      min="0"
                      max="120"
                      value={bufferMinutes}
                      onChange={(e) => setBufferMinutes(e.target.value)}
                      required
                      style={{ width: "150px" }}
                    />
                    <span style={{ paddingTop: "25px" }}>minutes</span>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    paddingTop: "1.5rem",
                    display: "flex",
                    justifyContent: "flex-end",
                  }}
                >
                  <Button type="submit" variant="primary" disabled={isSaving}>
                    <Save size={18} />
                    {isSaving ? "Sauvegarde..." : "Sauvegarder"}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
