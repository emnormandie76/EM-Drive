"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Car,
  Plus,
  CheckCircle,
  Edit,
  Wrench,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import type { Campus, VehicleWithPosition } from "@/hooks/use-vehicles";
import { fetchJson } from "@/lib/utils/fetch-json";

const STATUS_LABELS = { AVAILABLE: "disponible", MAINTENANCE: "en maintenance" } as const;

export default function AdminVehiclesPage() {
  const {
    data: vehicles,
    error,
    mutate,
  } = useSWR<VehicleWithPosition[]>("/api/vehicles", fetchJson);
  // Les campus viennent de leur route, pas des véhicules : sans véhicule, on doit pouvoir ajouter le premier
  const { data: campuses = [] } = useSWR<Campus[]>("/api/campuses", fetchJson);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleWithPosition | null>(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const limit = 15;

  // Form states
  const [name, setName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [seats, setSeats] = useState(5);
  const [defaultCampusId, setDefaultCampusId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openNewVehicleModal = () => {
    setEditingVehicle(null);
    setName("");
    setLicensePlate("");
    setSeats(5);
    setDefaultCampusId(campuses[0]?.id || "");
    setIsModalOpen(true);
  };

  const openEditModal = (vehicle: VehicleWithPosition) => {
    setEditingVehicle(vehicle);
    setName(vehicle.name);
    setLicensePlate(vehicle.licensePlate);
    setSeats(vehicle.seats);
    setDefaultCampusId(vehicle.defaultCampusId);
    setIsModalOpen(true);
  };

  const handleToggleMaintenance = async (vehicle: VehicleWithPosition) => {
    const newStatus =
      vehicle.status === "AVAILABLE" ? "MAINTENANCE" : "AVAILABLE";

    try {
      const res = await fetch(`/api/admin/vehicles/${vehicle.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Impossible de modifier le statut.");
      }

      toast.success(`Le véhicule est désormais ${STATUS_LABELS[newStatus]}.`);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible de modifier le statut.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      name,
      licensePlate,
      seats,
      defaultCampusId,
    };

    try {
      const res = await fetch(
        editingVehicle
          ? `/api/admin/vehicles/${editingVehicle.id}`
          : "/api/admin/vehicles",
        {
          method: editingVehicle ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        // Le message du serveur, dont celui d'une plaque déjà prise (cas limite 10)
        const data = await res.json();
        throw new Error(data.message || "Erreur serveur.");
      }

      toast.success(
        editingVehicle
          ? "Véhicule modifié avec succès."
          : "Véhicule ajouté avec succès.",
      );
      setIsModalOpen(false);
      mutate();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Impossible de charger les véhicules"
        description={error.message}
        onRetry={() => mutate()}
      />
    );
  }
  if (!vehicles) return <LoadingState label="Chargement des véhicules…" />;

  const totalPages = Math.ceil(vehicles.length / limit);
  const paginatedVehicles = vehicles.slice((page - 1) * limit, page * limit);

  const pagination = totalPages > 1 && (
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
        Page {page} sur {totalPages} ({vehicles.length} véhicules)
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
          disabled={page === totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Suivant
        </Button>
      </div>
    </div>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <h1 className="text-2xl font-bold">Gestion des Véhicules</h1>
        <Button variant="primary" onClick={openNewVehicleModal}>
          <Plus size={18} />
          Ajouter un véhicule
        </Button>
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          icon={Car}
          title="Aucun véhicule enregistré"
          description="Ajoutez le premier véhicule de la flotte."
        />
      ) : (
      <Card style={{ padding: "0" }}>
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
                <th style={{ padding: "1rem" }}>Véhicule</th>
                <th style={{ padding: "1rem" }}>Immatriculation</th>
                <th style={{ padding: "1rem" }}>Places</th>
                <th style={{ padding: "1rem" }}>Campus d&#39;attache</th>
                <th style={{ padding: "1rem" }}>Statut</th>
                <th style={{ padding: "1rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVehicles.map((v) => (
                <tr
                  key={v.id}
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                >
                  <td style={{ padding: "1rem", fontWeight: "500" }}>
                    {v.name}
                  </td>
                  <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>{v.licensePlate}</td>
                  <td style={{ padding: "1rem" }}>{v.seats}</td>
                  <td style={{ padding: "1rem" }}>
                    {v.defaultCampus?.name || "-"}
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <span
                      className={`badge ${v.status === "AVAILABLE" ? "badge-success" : "badge-danger"}`}
                    >
                      {v.status === "AVAILABLE"
                        ? "Disponible"
                        : "En Maintenance"}
                    </span>
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditModal(v)}
                        title="Modifier"
                        aria-label={`Modifier ${v.name}`}
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        variant={
                          v.status === "AVAILABLE" ? "secondary" : "primary"
                        }
                        size="sm"
                        onClick={() => handleToggleMaintenance(v)}
                        title={
                          v.status === "AVAILABLE"
                            ? "Passer en maintenance"
                            : "Remettre disponible"
                        }
                        aria-label={
                          v.status === "AVAILABLE"
                            ? `Passer ${v.name} en maintenance`
                            : `Remettre ${v.name} disponible`
                        }
                      >
                        {v.status === "AVAILABLE" ? (
                          <Wrench size={16} />
                        ) : (
                          <CheckCircle size={16} />
                        )}
                      </Button>
                    </div>
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

      {isModalOpen && (
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
          <div
            className="card"
            style={{ width: "100%", maxWidth: "500px", maxHeight: "90vh", overflowY: "auto", padding: "2rem" }}
          >
            <h2 className="text-xl font-bold mb-4">
              {editingVehicle ? "Modifier le véhicule" : "Nouveau véhicule"}
            </h2>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "500",
                  }}
                >
                  Nom du véhicule
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ex: Renault Megane Grise"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "500",
                  }}
                >
                  Plaque d&#39;immatriculation
                </label>
                <Input
                  type="text"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  required
                  placeholder="AB-123-CD"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "500",
                  }}
                >
                  Nombre de places (conducteur inclus)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={9}
                  value={seats}
                  onChange={(e) => setSeats(parseInt(e.target.value, 10))}
                  required
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "500",
                  }}
                >
                  Campus d&#39;attache
                </label>
                <Select
                  value={defaultCampusId}
                  onChange={(e) => setDefaultCampusId(e.target.value)}
                  required
                  style={{ width: "100%" }}
                  options={[
                    { value: "", label: "Sélectionner un campus" },
                    ...campuses.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginTop: "1rem",
                }}
              >
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Annuler
                </Button>
                <Button variant="primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Enregistrement..."
                    : editingVehicle
                      ? "Modifier"
                      : "Ajouter"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
