"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Trash2,
  AlertTriangle,
  ArrowRight,
  ArrowLeftRight,
  Edit,
  SearchX,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Select } from "@/components/ui/Select";
import { DatePickerInput } from "@/components/ui/CustomCalendarPicker";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import { AdminEditTripModal } from "@/components/admin/AdminEditTripModal";
import type { AdminTrip, AdminTripsResponse } from "@/hooks/use-trips";
import { fetchJson } from "@/lib/utils/fetch-json";

export default function AdminTripsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all"); // all, SCHEDULED, CANCELLED
  const [dateFilter, setDateFilter] = useState("");

  // Construit les paramètres de l'URL
  const searchParams = new URLSearchParams();
  searchParams.set("page", page.toString());
  searchParams.set("limit", "15");
  if (statusFilter !== "all") searchParams.set("status", statusFilter);
  if (dateFilter) searchParams.set("date", dateFilter);

  const url = `/api/admin/trips?${searchParams.toString()}`;
  const { data, error, mutate } = useSWR<AdminTripsResponse>(url, fetchJson);

  // Etat pour la modale de confirmation
  const [tripToDelete, setTripToDelete] = useState<AdminTrip | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Etat pour la modale d'édition
  const [tripToEdit, setTripToEdit] = useState<AdminTrip | null>(null);

  const resetFilters = () => {
    setStatusFilter("all");
    setDateFilter("");
    setPage(1);
  };

  const handleDelete = async () => {
    if (!tripToDelete) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/trips/${tripToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || "Erreur lors de la suppression.");
      }

      toast.success("Le trajet a été annulé.");
      setTripToDelete(null);
      mutate();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || "Une erreur est survenue.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Gestion des Trajets</h1>

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
              label="Statut"
              options={[
                { value: "all", label: "Tous" },
                { value: "SCHEDULED", label: "Planifiés/En cours" },
                { value: "CANCELLED", label: "Annulés" },
              ]}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: "200px", zIndex: 10 }}>
            <DatePickerInput
              label="Date exacte"
              value={dateFilter}
              onChange={(v) => {
                setDateFilter(v);
                setPage(1);
              }}
              allowPastDates={true}
            />
          </div>
          <Button
            variant="ghost"
            onClick={resetFilters}
            title="Réinitialiser les filtres"
            style={{ marginBottom: "1rem" }}
          >
            Réinitialiser
          </Button>
        </CardBody>
      </Card>

      {/* Liste des trajets */}
      {error ? (
        <ErrorState
          title="Impossible de charger les trajets"
          description={error.message}
          onRetry={() => mutate()}
        />
      ) : !data ? (
        <LoadingState label="Chargement des trajets…" />
      ) : data.trips.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Aucun trajet ne correspond à ces critères"
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Réinitialiser les filtres
            </Button>
          }
        />
      ) : (
        <Card style={{ padding: 0 }}>
            {/* Pagination TOP */}
            {data.pagination.totalPages > 1 && (
              <div
                style={{
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span className="text-muted" style={{ fontSize: "0.9rem" }}>
                  Page {data.pagination.page} sur {data.pagination.totalPages} (
                  {data.pagination.total} trajets)
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
                    disabled={page === data.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}

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
                    <th style={{ padding: "1rem" }}>Date & Heure</th>
                    <th style={{ padding: "1rem" }}>Conducteur</th>
                    <th style={{ padding: "1rem" }}>Véhicule</th>
                    <th style={{ padding: "1rem" }}>Itinéraire</th>
                    <th style={{ padding: "1rem" }}>Type</th>
                    <th style={{ padding: "1rem" }}>Passagers</th>
                    <th style={{ padding: "1rem" }}>Statut</th>
                    <th style={{ padding: "1rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trips.map((trip) => (
                    <tr
                      key={trip.id}
                      style={{ borderBottom: "1px solid var(--color-border)" }}
                    >
                      <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 500 }}>
                          {format(new Date(trip.departureTime), "dd MMM yyyy", {
                            locale: fr,
                          })}
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: "0.85rem" }}
                        >
                          {format(new Date(trip.departureTime), "HH:mm")}
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ fontWeight: 500 }}>
                          {trip.driverDisplayName}
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: "0.85rem" }}
                        >
                          {trip.driverEmail}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>
                        <div
                          className="badge badge-outline"
                          style={{ display: "inline-flex" }}
                        >
                          {trip.vehicle.licensePlate}
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <div
                          style={{
                            fontSize: "0.9rem",
                            maxWidth: "200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <strong>{trip.originCampus.name}</strong>
                          {" → "}
                          <strong>
                            {trip.destinationCampus?.name ||
                              trip.destinationOtherLabel}
                          </strong>
                        </div>
                      </td>
                      <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>
                        {trip.type === "ONE_WAY" ? (
                          <span
                            className="badge badge-info"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            Aller simple <ArrowRight size={12} />
                          </span>
                        ) : (
                          <span
                            className="badge badge-info"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              backgroundColor: "var(--color-primary)",
                              color: "white",
                            }}
                          >
                            Aller-retour <ArrowLeftRight size={12} />
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "center" }}>
                        <div className="badge badge-neutral">
                          {trip.passengers.length}
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        {trip.status === "CANCELLED" ? (
                          <span className="badge badge-danger">Annulé</span>
                        ) : (
                          <span
                            className={`badge ${trip.displayStatus === "completed" ? "badge-neutral" : trip.displayStatus === "in_progress" ? "badge-warning" : "badge-success"}`}
                          >
                            {trip.displayStatus === "completed"
                              ? "Terminé"
                              : trip.displayStatus === "in_progress"
                                ? "En cours"
                                : "Planifié"}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "1rem" }}>
                        {trip.status !== "CANCELLED" && (
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTripToEdit(trip)}
                              title="Modifier ce trajet"
                            >
                              <Edit size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              style={{ color: "var(--color-danger)" }}
                              onClick={() => setTripToDelete(trip)}
                              title="Forcer l'annulation"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination BOTTOM */}
            {data.pagination.totalPages > 1 && (
              <div
                style={{
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                <span className="text-muted" style={{ fontSize: "0.9rem" }}>
                  Page {data.pagination.page} sur {data.pagination.totalPages} (
                  {data.pagination.total} trajets)
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
                    disabled={page === data.pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
        </Card>
      )}

      {/* Modale de confirmation de suppression */}
      {tripToDelete && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <Card style={{ width: "100%", maxWidth: "450px" }}>
            <CardBody>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                  color: "var(--color-danger)",
                }}
              >
                <AlertTriangle size={24} />
                <h2 className="text-xl font-bold" style={{ color: "inherit" }}>
                  Forcer l&#39;annulation
                </h2>
              </div>

              <p style={{ marginBottom: "1rem", lineHeight: 1.5 }}>
                Êtes-vous sûr de vouloir annuler ce trajet du{" "}
                <strong>
                  {format(
                    new Date(tripToDelete.departureTime),
                    "dd/MM/yyyy à HH:mm",
                  )}
                </strong>{" "}
                ?
              </p>
              <p
                style={{
                  marginBottom: "1.5rem",
                  fontSize: "0.9rem",
                  color: "var(--color-text-muted)",
                }}
              >
                Le trajet passera au statut « Annulé » pour son conducteur et
                ses {tripToDelete.passengers.length} passager(s). Cette action
                est irréversible.
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <Button
                  variant="ghost"
                  onClick={() => setTripToDelete(null)}
                  disabled={isDeleting}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  style={{
                    backgroundColor: "var(--color-danger)",
                    color: "white",
                  }}
                >
                  {isDeleting ? "Annulation..." : "Confirmer l'annulation"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tripToEdit && (
        <AdminEditTripModal
          isOpen={true}
          onClose={() => setTripToEdit(null)}
          trip={tripToEdit}
          onSuccess={() => mutate()}
        />
      )}
    </div>
  );
}
