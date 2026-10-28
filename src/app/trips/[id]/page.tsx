"use client";

import React, { use } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { TripDetail } from '@/components/trips/TripDetail';
import { PassengerList } from '@/components/trips/PassengerList';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: session } = useSession();

  const { data: trip, error, isLoading, mutate } = useSWR(
    `/api/trips/${resolvedParams.id}`,
    fetcher
  );

  if (isLoading) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
        <div style={{ height: '400px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', animation: 'pulse 1.5s infinite' }} />
      </div>
    );
  }

  if (error || (trip && trip.error)) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px', textAlign: 'center', color: 'var(--color-danger)' }}>
        <h1>Erreur</h1>
        <p>{trip?.message || "Impossible de charger les détails du trajet."}</p>
        <Link href="/trips" className="btn btn-secondary" style={{ marginTop: '16px', display: 'inline-block' }}>
          Retour à la liste
        </Link>
      </div>
    );
  }

  const currentUserId = session?.user?.sub || "";
  const isDriver = trip.driverSub === currentUserId;
  const isAdmin = session?.user?.isAdmin || false;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/trips" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontWeight: 500, textDecoration: 'none' }}>
          <ArrowLeft size={18} /> Retour aux trajets
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <TripDetail
            trip={trip}
            currentUserId={currentUserId}
            onMutate={mutate}
          />
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
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
      </div>
    </div>
  );
}
