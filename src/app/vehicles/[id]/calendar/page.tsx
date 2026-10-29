"use client";

import React, { use } from 'react';
import useSWR from 'swr';
import { VehicleCalendar } from '@/components/vehicles/VehicleCalendar';
import { ErrorState } from '@/components/ui/PageState';
import { ArrowLeft, Car } from 'lucide-react';
import Link from 'next/link';
import type { TripsResponse } from '@/hooks/use-trips';
import type { VehicleWithPosition } from '@/hooks/use-vehicles';
import { FetchError, fetchJson } from '@/lib/utils/fetch-json';

type VehicleData = Pick<VehicleWithPosition, 'id' | 'name' | 'licensePlate'>;

export default function VehicleCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);

  // Détail du véhicule, et ses trajets à venir par l'API des trajets filtrée sur le véhicule
  const { data: vehicleData, error: vehicleError, isLoading: vehicleLoading, mutate: mutateVehicle } = useSWR<VehicleData>(
    `/api/vehicles/${resolvedParams.id}`,
    fetchJson
  );

  const { data: tripsData, error: tripsError, isLoading: tripsLoading, mutate: mutateTrips } = useSWR<TripsResponse>(
    `/api/trips?vehicleId=${resolvedParams.id}&status=upcoming`, // Ideally we fetch all or a date range
    fetchJson
  );

  const backLink = (
    <Link href="/dashboard" className="btn btn-secondary">
      Retour au tableau de bord
    </Link>
  );

  if (vehicleLoading || tripsLoading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 0' }} role="status" aria-label="Chargement du calendrier">
        <div className="skeleton" style={{ height: '600px' }} />
      </div>
    );
  }

  if (vehicleError || tripsError || !vehicleData) {
    const notFound = vehicleError instanceof FetchError && vehicleError.status === 404;
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 0' }}>
        <ErrorState
          title={notFound ? "Véhicule introuvable" : "Impossible de charger le calendrier de ce véhicule"}
          description={notFound ? "Ce véhicule n'existe pas, ou il a été supprimé." : (vehicleError ?? tripsError)?.message}
          onRetry={notFound ? undefined : () => { mutateVehicle(); mutateTrips(); }}
          action={backLink}
        />
      </div>
    );
  }

  const trips = tripsData?.trips ?? [];

  // Format trips for the calendar component
  const calendarTrips = trips.map((t) => ({
    id: t.id,
    departureTime: t.departureTime,
    endTime: t.estimatedReturnArrivalTime || t.estimatedArrivalTime, // Needs to account for buffers ideally
    type: t.type,
    driverName: t.driverDisplayName,
    destination: t.type === 'ROUND_TRIP_OTHER' ? t.destinationOtherLabel || "" : t.destinationCampus?.name || ""
  }));

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 0' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontWeight: 500, textDecoration: 'none', marginBottom: '16px' }}>
          <ArrowLeft size={18} /> Retour au tableau de bord
        </Link>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <Car size={32} /> Calendrier - {vehicleData.name}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem' }}>
          Immatriculation : {vehicleData.licensePlate}
        </p>
        {trips.length === 0 && (
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            Aucun trajet à venir pour ce véhicule.
          </p>
        )}
      </div>

      <VehicleCalendar trips={calendarTrips} />
    </div>
  );
}
