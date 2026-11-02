// src/components/vehicles/VehicleStatusBadge.tsx — Statut d'affichage d'un véhicule : tableau de bord et administration
// Le statut vient des trajets en cours et des périodes d'indisponibilité en cours (D58, D69), plus de la colonne
// `status` du véhicule (D59).

import React from "react";
import { Badge } from "@/components/ui/Badge";
import type { VehicleDisplayStatus } from "@/hooks/use-vehicles";

export function VehicleStatusBadge({ status }: { status: VehicleDisplayStatus }) {
  switch (status) {
    case "available":
      return <Badge variant="success">Disponible</Badge>;
    case "in_trip":
      return <Badge variant="info">En trajet</Badge>;
    case "maintenance":
      return <Badge variant="danger">Maintenance</Badge>;
    case "car_booking":
      return <Badge variant="warning">Car Booking</Badge>;
    case "fully_booked":
      return <Badge variant="warning">Complet</Badge>;
    default:
      return <Badge variant="default">Inconnu</Badge>;
  }
}
