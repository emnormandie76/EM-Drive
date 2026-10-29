"use client";

import React, { useState } from 'react';
import useSWR from 'swr';
import { SearchX } from 'lucide-react';
import { TripCard } from '@/components/trips/TripCard';
import { DatePickerInput } from '@/components/ui/CustomCalendarPicker';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState } from '@/components/ui/PageState';
import type { Campus } from '@/hooks/use-vehicles';
import type { TripsResponse } from '@/hooks/use-trips';
import { fetchJson } from '@/lib/utils/fetch-json';

// Une carte fait 320 px au plus étroit, sauf sur un écran plus étroit qu'elle
const CARD_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
  gap: '24px',
};

export default function TripsPage() {
  const [statusFilter, setStatusFilter] = useState('upcoming');
  const [campusFilter, setCampusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Sans campus (erreur de lecture), le filtre ne propose que « Tous les campus »
  const { data: campuses = [] } = useSWR<Campus[]>('/api/campuses', fetchJson);

  // Build query string
  const queryParams = new URLSearchParams();
  if (statusFilter) queryParams.append('status', statusFilter);
  if (campusFilter) queryParams.append('originCampusId', campusFilter);
  if (dateFilter) queryParams.append('date', dateFilter);

  const { data, error, isLoading, mutate } = useSWR<TripsResponse>(
    `/api/trips?${queryParams.toString()}`,
    fetchJson,
    { revalidateOnFocus: true }
  );

  const trips = data?.trips ?? [];

  const resetFilters = () => { setStatusFilter('upcoming'); setCampusFilter(''); setDateFilter(''); };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 0' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '8px' }}>
          Rechercher un trajet
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem' }}>
          Trouvez un trajet existant pour faire du covoiturage.
        </p>
      </div>

      {/* Filtres */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
        backgroundColor: 'var(--color-surface)',
        padding: '24px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <Select
          label="Statut"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "upcoming", label: "À venir" },
            { value: "past", label: "Passés" },
            { value: "all", label: "Tous" }
          ]}
        />

        <Select
          label="Campus de départ"
          value={campusFilter}
          onChange={(e) => setCampusFilter(e.target.value)}
          options={[
            { value: "", label: "Tous les campus" },
            ...campuses.map(c => ({ value: c.id, label: c.name }))
          ]}
        />

        <DatePickerInput
          label="Date du trajet"
          value={dateFilter}
          onChange={(val) => setDateFilter(val)}
        />
      </div>

      {/* Liste des trajets */}
      {isLoading ? (
        <div style={CARD_GRID} role="status" aria-label="Chargement des trajets">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: '300px' }} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Impossible de charger les trajets"
          description={error.message}
          onRetry={() => mutate()}
        />
      ) : trips.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Aucun trajet ne correspond à vos critères"
          description="Changez de statut, de campus ou de date, ou repartez de zéro."
          action={
            <button onClick={resetFilters} className="btn btn-outline">
              Réinitialiser les filtres
            </button>
          }
        />
      ) : (
        <div style={CARD_GRID}>
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
