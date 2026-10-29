"use client";

import React, { use } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { TripDetail } from '@/components/trips/TripDetail';
import { PassengerList } from '@/components/trips/PassengerList';
import { ErrorState } from '@/components/ui/PageState';
import type { TripDetailData } from '@/hooks/use-trips';
import { FetchError, fetchJson } from '@/lib/utils/fetch-json';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import '@/components/trips/trips.css';

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: session } = useSession();

  const { data: trip, error, isLoading, mutate } = useSWR<TripDetailData>(
    `/api/trips/${resolvedParams.id}`,
    fetchJson
  );

  const backLink = (
    <Link href="/trips" className="btn btn-secondary">
      Retour à la liste
    </Link>
  );

  if (isLoading) {
    return (
      <div className="trip-detail-page" role="status" aria-label="Chargement du trajet">
        <div className="skeleton" style={{ height: '400px' }} />
      </div>
    );
  }

  if (error || !trip) {
    const notFound = error instanceof FetchError && error.status === 404;
    return (
      <div className="trip-detail-page">
        <ErrorState
          title={notFound ? "Trajet introuvable" : "Impossible de charger ce trajet"}
          description={notFound ? "Ce trajet n'existe pas, ou il a été supprimé." : error?.message}
          onRetry={notFound ? undefined : () => mutate()}
          action={backLink}
        />
      </div>
    );
  }

  const currentUserId = session?.user?.sub || "";
  const isDriver = trip.driverSub === currentUserId;
  const isAdmin = session?.user?.isAdmin || false;

  return (
    <div className="trip-detail-page">
      <div style={{ marginBottom: '24px' }}>
        <Link href="/trips" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontWeight: 500, textDecoration: 'none' }}>
          <ArrowLeft size={18} /> Retour aux trajets
        </Link>
      </div>

      <TripDetail trip={trip} />

      <PassengerList
        passengers={trip.passengers}
        tripId={trip.id}
        maxPassengers={trip.vehicle.seats - 1}
        currentUserId={currentUserId}
        isDriver={isDriver}
        isAdmin={isAdmin}
        canJoin={trip.permissions.canJoinAsPassenger}
        onMutate={mutate}
      />
    </div>
  );
}
