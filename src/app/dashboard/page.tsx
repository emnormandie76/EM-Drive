/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useVehicles } from "@/hooks/use-vehicles";
import { useMyTrips } from "@/hooks/use-trips";
import { FleetOverview } from "@/components/dashboard/FleetOverview";
import { VehicleCard } from "@/components/dashboard/VehicleCard";
import { UpcomingTrips } from "@/components/dashboard/UpcomingTrips";
import { Car, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import "@/components/dashboard/dashboard.css";

export default function DashboardPage() {
  const { data: session, status } = useSession({ required: true });
  const { vehicles, isLoading: loadingVehicles, mutate: mutateVehicles } = useVehicles();
  const { myTrips, isLoading: loadingTrips, mutate: mutateTrips } = useMyTrips(
    (session?.user as any)?.sub
  );

  const handleRefresh = () => {
    mutateVehicles();
    mutateTrips();
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="spinner text-primary text-2xl">⏳</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page animate-fade-in">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Tableau de bord</h1>
          <p>Bienvenue sur ResaVroom, {session?.user?.name || "..."}</p>
        </div>
        <Button variant="ghost" onClick={handleRefresh} title="Actualiser les données" className="btn-icon">
          <RefreshCw size={20} className={(loadingVehicles || loadingTrips) ? "icon-spin" : ""} />
        </Button>
      </div>

      {/* Mes Trajets */}
      <section className="dashboard-section">
        <h2 className="section-title">Mes trajets à venir</h2>
        
        {loadingTrips ? (
          <div className="ds-loading">
            <span className="spinner text-primary text-xl">⏳ Chargement...</span>
          </div>
        ) : (
          <UpcomingTrips trips={myTrips} />
        )}
      </section>

      {/* Flotte */}
      <section className="dashboard-section">
        <h2 className="section-title">État de la flotte locale</h2>
        
        {loadingVehicles ? (
          <div className="ds-loading">
            <span className="spinner text-primary text-xl">⏳ Chargement...</span>
          </div>
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
            {vehicles.length === 0 && (
              <div className="ds-empty-state">
                <Car size={48} className="ds-empty-icon" />
                <p className="ds-empty-desc">Aucun véhicule enregistré dans la flotte locale.</p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
