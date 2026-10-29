// src/components/dashboard/UpcomingTrips.tsx
import React from "react";
import { DashboardTrip } from "@/hooks/use-trips";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageState";
import { Calendar, Users, Car } from "lucide-react";
import Link from "next/link";
import "./dashboard.css";

interface UpcomingTripsProps {
  trips: DashboardTrip[];
}

export function UpcomingTrips({ trips }: UpcomingTripsProps) {
  if (trips.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="Aucun trajet à venir"
        description="Vous n'avez aucun trajet prévu, ni comme conducteur ni comme passager."
        action={
          <Link href="/trips/new" className="btn btn-primary">
            Réserver un véhicule
          </Link>
        }
        compact
      />
    );
  }

  return (
    <div className="grid-3 break-words">
      {trips.map((trip) => (
        <Card key={trip.id} hover className="vehicle-card">
          <CardHeader className="trip-card-header">
            <Badge variant={trip.displayStatus === "in_progress" ? "info" : "default"}>
              {trip.displayStatus === "in_progress" ? "En cours" : "Planifié"}
            </Badge>
            <div className="trip-time">
              {format(new Date(trip.departureTime), "dd MMM HH:mm", { locale: fr })}
            </div>
          </CardHeader>

          <CardBody className="trip-details">
            <div className="trip-route">
              {trip.originCampus.name} → {trip.destinationCampus?.name || trip.destinationOtherLabel}
            </div>
            <div className="vc-info-row">
              <Car size={16} />
              <span>{trip.vehicle.name} ({trip.vehicle.licensePlate})</span>
            </div>
            <div className="vc-info-row">
              <Users size={16} />
              <span>
                {trip.passengers.length} passager{trip.passengers.length > 1 ? "s" : ""} / {trip.vehicle.seats - 1} places
              </span>
            </div>
            <div className="trip-actions">
              <Link href={`/trips/${trip.id}`} className="btn btn-secondary w-full">
                Détails du trajet
              </Link>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
