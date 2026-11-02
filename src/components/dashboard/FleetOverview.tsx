// src/components/dashboard/FleetOverview.tsx
import React, { useMemo } from "react";
import { VehicleWithPosition } from "@/hooks/use-vehicles";
import { Car, CheckCircle2, AlertTriangle, Wrench } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import "./dashboard.css";

interface FleetOverviewProps {
  vehicles: VehicleWithPosition[];
}

export function FleetOverview({ vehicles }: FleetOverviewProps) {
  const stats = useMemo(() => {
    return {
      total: vehicles.length,
      available: vehicles.filter((v) => v.displayStatus === "available").length,
      inTrip: vehicles.filter((v) => v.displayStatus === "in_trip" || v.displayStatus === "fully_booked").length,
      // Maintenance et réservations Car Booking, regroupées (D69)
      unavailable: vehicles.filter((v) => v.displayStatus === "maintenance" || v.displayStatus === "car_booking").length,
    };
  }, [vehicles]);

  return (
    <div className="grid-4">
      <Card>
        <CardBody className="stat-card-body">
          <div className="stat-icon primary">
            <Car size={24} />
          </div>
          <div>
            <p className="stat-label">Flotte Totale</p>
            <p className="stat-value">{stats.total}</p>
          </div>
        </CardBody>
      </Card>
      
      <Card>
        <CardBody className="stat-card-body">
          <div className="stat-icon success">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="stat-label">Disponibles</p>
            <p className="stat-value">{stats.available}</p>
          </div>
        </CardBody>
      </Card>
      
      <Card>
        <CardBody className="stat-card-body">
          <div className="stat-icon info">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="stat-label">En Trajet</p>
            <p className="stat-value">{stats.inTrip}</p>
          </div>
        </CardBody>
      </Card>
      
      <Card>
        <CardBody className="stat-card-body">
          <div className="stat-icon danger">
            <Wrench size={24} />
          </div>
          <div>
            <p className="stat-label">Indisponibles</p>
            <p className="stat-value">{stats.unavailable}</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
