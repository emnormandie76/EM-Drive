import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Users, ChevronRight, Car, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { DashboardTrip } from '@/hooks/use-trips';

export function TripCard({ trip }: { trip: DashboardTrip }) {
  const departureDate = new Date(trip.departureTime);
  const arrivalDate = new Date(trip.estimatedArrivalTime);
  const seatsAvailable = trip.seatsAvailable;

  const destinationName = trip.destinationCampus?.name || trip.destinationOtherLabel || "Destination inconnue";

  return (
    <Card className="hover-lift" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {trip.status === 'CANCELLED' ? (
              <Badge variant="danger">Annulé</Badge>
            ) : trip.type === 'ONE_WAY' ? (
              <Badge variant="info" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Aller simple <ArrowRight size={12} />
              </Badge>
            ) : (
              <Badge variant="info" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-primary)', color: 'white' }}>
                Aller-retour <ArrowLeftRight size={12} />
              </Badge>
            )}
            
            {trip.status !== 'CANCELLED' && (
              new Date() > departureDate ? (
                <Badge style={{ backgroundColor: '#991b1b', color: 'white', borderColor: '#991b1b' }}>Passé</Badge>
              ) : (
                <Badge style={{ backgroundColor: '#166534', color: 'white', borderColor: '#166534' }}>À venir</Badge>
              )
            )}
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-primary)' }}>
            {format(departureDate, 'EEEE d MMMM', { locale: fr })}
          </h3>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Badge variant={seatsAvailable > 0 ? 'success' : 'warning'} style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
            <Users size={12} style={{ marginRight: '4px' }} />
            {seatsAvailable} place{seatsAvailable > 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
        {/* Trajet Aller */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', border: '2px solid white', zIndex: 1 }} />
            <div style={{ width: '2px', height: '40px', backgroundColor: 'var(--color-border)' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)', border: '2px solid white', zIndex: 1 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: '2px' }}>
            <div>
              <span style={{ fontWeight: 600, marginRight: '8px' }}>{format(departureDate, 'HH:mm')}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{trip.originCampus.name}</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, marginRight: '8px' }}>{format(arrivalDate, 'HH:mm')}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{destinationName}</span>
            </div>
          </div>
        </div>

        {/* Trajet Retour (si applicable) */}
        {trip.type !== 'ONE_WAY' && trip.returnDepartureTime && trip.estimatedReturnArrivalTime && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-text-secondary)', border: '2px solid white', zIndex: 1 }} />
              <div style={{ width: '2px', height: '40px', backgroundColor: 'var(--color-border)', borderLeft: '2px dashed var(--color-border)', marginLeft: '-2px' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', border: '2px solid white', zIndex: 1 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: '2px' }}>
              <div>
                <span style={{ fontWeight: 600, marginRight: '8px' }}>{format(new Date(trip.returnDepartureTime), 'HH:mm')}</span>
                {format(new Date(trip.returnDepartureTime), 'd MMM', { locale: fr }) !== format(departureDate, 'd MMM', { locale: fr }) && (
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-primary)', marginRight: '8px' }}>({format(new Date(trip.returnDepartureTime), 'd MMM', { locale: fr })})</span>
                )}
                <span style={{ color: 'var(--color-text-secondary)' }}>{destinationName}</span>
              </div>
              <div>
                <span style={{ fontWeight: 600, marginRight: '8px' }}>{format(new Date(trip.estimatedReturnArrivalTime), 'HH:mm')}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{trip.returnCampus?.name}</span>
              </div>
            </div>
          </div>
        )}

        {/* Conducteur et Vehicule */}
        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', fontWeight: 600 }}>
              {trip.driverDisplayName.charAt(0)}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{trip.driverDisplayName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Car size={12} /> {trip.vehicle.name}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <Link href={`/trips/${trip.id}`} className="btn btn-secondary" style={{ width: '100%' }}>
          Voir le trajet <ChevronRight size={16} />
        </Link>
      </div>
    </Card>
  );
}
