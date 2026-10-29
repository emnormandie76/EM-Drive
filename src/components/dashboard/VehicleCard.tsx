// src/components/dashboard/VehicleCard.tsx
import React from "react";
import { Car, MapPin, Users, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { VehicleWithPosition } from "@/hooks/use-vehicles";
import "./dashboard.css";

interface VehicleCardProps {
  vehicle: VehicleWithPosition;
  hideActions?: boolean;
}

export function VehicleCard({ vehicle, hideActions = false }: VehicleCardProps) {
  const getStatusBadge = () => {
    switch (vehicle.displayStatus) {
      case "available":
        return <Badge variant="success">Disponible</Badge>;
      case "in_trip":
        return <Badge variant="info">En trajet</Badge>;
      case "maintenance":
        return <Badge variant="danger">Maintenance</Badge>;
      case "fully_booked":
        return <Badge variant="warning">Complet</Badge>;
      default:
        return <Badge variant="default">Inconnu</Badge>;
    }
  };

  return (
    <Card hover className="vehicle-card">
      <CardHeader className="vc-header">
        <div>
          <CardTitle className="vc-title">
            <Car size={20} />
            {vehicle.name}
          </CardTitle>
          <div className="vc-plate">
            {vehicle.licensePlate}
          </div>
        </div>
        {getStatusBadge()}
      </CardHeader>
      
      <CardBody className="vc-body">
        <div className="vc-info-row">
          <MapPin size={16} />
          <span>Position actuelle : <strong>{vehicle.currentCampus.name}</strong></span>
        </div>
        <div className="vc-info-row">
          <Users size={16} />
          <span>Places totales : <strong>{vehicle.seats}</strong></span>
        </div>
        
        {vehicle.nextTrip && (
          <div className="vc-next-trip">
            <div className="vc-next-trip-title">
              <Calendar size={14} />
              Prochain trajet
            </div>
            <div className="vc-next-trip-desc">
              Vers <strong>{vehicle.nextTrip.destination}</strong> le {new Date(vehicle.nextTrip.departureTime).toLocaleDateString("fr-FR", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}
      </CardBody>
      
      {!hideActions && (
        <CardFooter>
          <div className="vc-actions">
            <Link href={`/vehicles/${vehicle.id}/calendar`} className="btn btn-secondary w-full">
              Calendrier
            </Link>
            {/* En maintenance, pas de lien : un bouton désactivé dans un lien laisse passer le clic */}
            {vehicle.displayStatus === "maintenance" ? (
              <Button variant="primary" className="w-full" disabled>
                Réserver
              </Button>
            ) : (
              <Link href={`/trips/new?vehicleId=${vehicle.id}&originCampusId=${vehicle.currentCampus.id}`} className="btn btn-primary w-full">
                Réserver
              </Link>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
