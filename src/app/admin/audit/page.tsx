"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { ScrollText } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import { fetchJson } from "@/lib/utils/fetch-json";

/** Ligne du journal rendue par GET /api/admin/audit. */
interface AuditLogEntry {
  id: string;
  userSub: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("all");

  const searchParams = new URLSearchParams();
  searchParams.set("page", page.toString());
  searchParams.set("limit", "15");
  // La route lit `entityType` (le filtre envoyait `entity`, qu'elle ignorait)
  if (entityType !== "all") searchParams.set("entityType", entityType);

  const url = `/api/admin/audit?${searchParams.toString()}`;
  const { data, error, mutate } = useSWR<AuditResponse>(url, fetchJson);

  const renderDetails = (details: unknown) => {
    if (!details) return "-";
    try {
      return (
        <pre
          style={{
            margin: 0,
            fontSize: "0.8rem",
            whiteSpace: "pre-wrap",
            background: "var(--color-bg-secondary)",
            padding: "0.5rem",
            borderRadius: "4px",
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      );
    } catch {
      return "Données invalides";
    }
  };

  const pagination = data && data.totalPages > 1 && (
    <div
      style={{
        padding: "1rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}
    >
      <span className="text-muted" style={{ fontSize: "0.9rem" }}>
        Page {data.page} sur {data.totalPages} ({data.total} entrées)
      </span>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Précédent
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page === data.totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Suivant
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Journal d&#39;Audit</h1>

      {/* Filtres */}
      <Card style={{ marginBottom: "1.5rem", overflow: "visible" }}>
        <CardBody
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
            overflow: "visible",
          }}
        >
          <div style={{ flex: 1, minWidth: "200px" }}>
            <Select
              label="Type d&#39;entité"
              options={[
                { value: "all", label: "Tous" },
                { value: "trip", label: "Trajets" },
                { value: "vehicle", label: "Véhicules" },
                { value: "setting", label: "Paramètres" },
                { value: "person", label: "Personnes (connexions refusées)" },
              ]}
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
              style={{ width: "100%" }}
            />
          </div>
        </CardBody>
      </Card>

      {/* Liste d'audit */}
      {error ? (
        <ErrorState
          title="Impossible de charger le journal"
          description={error.message}
          onRetry={() => mutate()}
        />
      ) : !data ? (
        <LoadingState label="Chargement du journal…" />
      ) : data.logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Aucune entrée"
          description={entityType === "all" ? "Le journal d'audit est vide." : "Aucune entrée pour ce type d'entité."}
        />
      ) : (
        <Card style={{ padding: 0 }}>
            {/* Pagination TOP */}
            {pagination && <div style={{ borderBottom: "1px solid var(--color-border)" }}>{pagination}</div>}

            <div style={{ overflowX: "auto", transform: "rotateX(180deg)" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  transform: "rotateX(180deg)",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-bg-secondary)",
                    }}
                  >
                    <th style={{ padding: "1rem" }}>Date</th>
                    <th style={{ padding: "1rem" }}>Utilisateur</th>
                    <th style={{ padding: "1rem" }}>Action</th>
                    <th style={{ padding: "1rem" }}>Entité</th>
                    <th style={{ padding: "1rem" }}>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        verticalAlign: "top",
                      }}
                    >
                      <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 500 }}>
                          {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm")}
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ fontSize: "0.9rem" }}>
                          {log.userEmail}
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <div
                          className="badge badge-neutral"
                          style={{
                            fontSize: "0.75rem",
                            fontFamily: "monospace",
                          }}
                        >
                          {log.action}
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {log.entityType}
                        </span>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            fontFamily: "monospace",
                          }}
                        >
                          {log.entityId}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", maxWidth: "300px" }}>
                        {renderDetails(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination BOTTOM */}
            {pagination && <div style={{ borderTop: "1px solid var(--color-border)" }}>{pagination}</div>}
        </Card>
      )}
    </div>
  );
}
