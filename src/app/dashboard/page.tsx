"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useVehicles } from "@/hooks/use-vehicles";
import { useMyTrips } from "@/hooks/use-trips";
import { FleetOverview } from "@/components/dashboard/FleetOverview";
import { VehicleCard } from "@/components/dashboard/VehicleCard";
import { UpcomingTrips } from "@/components/dashboard/UpcomingTrips";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import { Car, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import "@/components/dashboard/dashboard.css";

export default function DashboardPage() {
  const { data: session, status } = useSession({ required: true });
  const { vehicles, isLoading: loadingVehicles, isError: vehiclesError, mutate: mutateVehicles } = useVehicles();
  const { myTrips, isLoading: loadingTrips, isError: tripsError, mutate: mutateTrips } = useMyTrips();

  const handleRefresh = () => {
    mutateVehicles();
    mutateTrips();
  };

  if (status === "loading") {
    return <LoadingState />;
  }

  return (
    <div className="dashboard-page animate-fade-in">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Tableau de bord</h1>
          <p>Bienvenue sur EM Drive, {session?.user?.name || "..."}</p>
        </div>
        <Button variant="ghost" onClick={handleRefresh} title="Actualiser les données" aria-label="Actualiser les données" className="btn-icon">
          <RefreshCw size={20} className={(loadingVehicles || loadingTrips) ? "icon-spin" : ""} />
        </Button>
      </div>

      {/* Mes Trajets */}
      <section className="dashboard-section">
        <h2 className="section-title">Mes trajets à venir</h2>

        {loadingTrips ? (
          <LoadingState label="Chargement de vos trajets…" compact />
        ) : tripsError ? (
          <ErrorState
            title="Impossible de charger vos trajets"
            description={tripsError.message}
            onRetry={() => mutateTrips()}
            compact
          />
        ) : (
          <UpcomingTrips trips={myTrips} />
        )}
      </section>

      {/* Flotte */}
      <section className="dashboard-section">
        <h2 className="section-title">État de la flotte locale</h2>

        {loadingVehicles ? (
          <LoadingState label="Chargement de la flotte…" compact />
        ) : vehiclesError ? (
          <ErrorState
            title="Impossible de charger la flotte"
            description={vehiclesError.message}
            onRetry={() => mutateVehicles()}
            compact
          />
        ) : vehicles.length === 0 ? (
          <EmptyState icon={Car} title="Aucun véhicule" description="Aucun véhicule n'est enregistré dans la flotte." compact />
        ) : (
          <>
            <FleetOverview vehicles={vehicles} />

            <div className="grid-3 break-words">
              {vehicles.map(vehicle => (
                <div key={vehicle.id} className="animate-slide-up" style={{ animationFillMode: "both" }}>
                  <VehicleCard vehicle={vehicle} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
