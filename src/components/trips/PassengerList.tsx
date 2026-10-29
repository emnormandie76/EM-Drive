import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Users, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import './trips.css';

interface Passenger {
  id: string;
  userSub: string;
  userEmail: string;
  userDisplayName: string;
  addedBy: 'SELF' | 'DRIVER';
}

interface PassengerListProps {
  passengers: Passenger[];
  tripId: string;
  maxPassengers: number; // Seats - 1 (driver)
  currentUserId: string;
  isDriver: boolean;
  isAdmin: boolean;
  canJoin: boolean;
  onMutate: () => void;
}

export function PassengerList({
  passengers,
  tripId,
  maxPassengers,
  currentUserId,
  isDriver,
  isAdmin,
  canJoin,
  onMutate
}: PassengerListProps) {
  const [isLoading, setIsLoading] = useState(false);

  const seatsAvailable = maxPassengers - passengers.length;
  const amIPassenger = passengers.find(p => p.userSub === currentUserId);

  const handleJoin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/passengers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addedBy: 'SELF' })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Erreur lors de l\'inscription');
      }

      toast.success('Vous avez rejoint ce trajet');
      onMutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'inscription');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLeave = async (passengerId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/passengers/${passengerId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Erreur lors du retrait');
      }

      toast.success('Passager retiré');
      onMutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors du retrait');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="passenger-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={20} /> Passagers
        </h3>
        <Badge variant={seatsAvailable > 0 ? 'success' : 'warning'}>
          {seatsAvailable} place{seatsAvailable > 1 ? 's' : ''} libre{seatsAvailable > 1 ? 's' : ''}
        </Badge>
      </div>

      {passengers.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', marginBottom: '16px' }}>
          Aucun passager inscrit.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0' }}>
          {passengers.map(p => {
            const canRemove = isAdmin || p.userSub === currentUserId || (isDriver && p.addedBy === 'DRIVER');

            return (
              <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.userDisplayName}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    {p.addedBy === 'DRIVER' ? 'Ajouté par le conducteur' : 'Inscrit'}
                  </div>
                </div>
                {canRemove && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleLeave(p.id)}
                    disabled={isLoading}
                    title="Retirer"
                  >
                    <UserMinus size={18} color="var(--color-danger)" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canJoin && (
        <Button
          variant="primary"
          onClick={handleJoin}
          disabled={isLoading}
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
        >
          <UserPlus size={18} /> Rejoindre ce trajet
        </Button>
      )}

      {amIPassenger && (
        <Button
          variant="secondary"
          onClick={() => handleLeave(amIPassenger.id)}
          disabled={isLoading}
          style={{ width: '100%', marginTop: '8px' }}
        >
          Me retirer du trajet
        </Button>
      )}
    </Card>
  );
}
