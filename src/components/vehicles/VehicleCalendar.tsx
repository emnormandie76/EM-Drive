import React, { useState } from 'react';
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameDay, isSameMonth, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths, isWithinInterval
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  formatPeriod, layoutUnavailabilityBars, UNAVAILABILITY_LABELS,
  type BarSegment, type UnavailabilityItem, type UnavailabilityReasonName
} from '@/lib/utils/unavailability';

/** Couleurs d'une période d'indisponibilité, distinctes de celles des trajets (D58). */
const UNAVAILABILITY_COLORS: Record<UnavailabilityReasonName, { background: string; border: string; text: string }> = {
  MAINTENANCE: { background: 'var(--color-danger-bg)', border: 'var(--color-danger)', text: 'var(--color-danger)' },
  CAR_BOOKING: { background: 'var(--color-warning-bg)', border: 'var(--color-warning)', text: 'var(--color-text)' },
};

/** Un bandeau continu pour une période de plusieurs jours : libellé une fois, flèche s'il déborde de la rangée (D71). */
function UnavailabilityBar({ segment, height }: { segment: BarSegment; height: number }) {
  const { item, startCol, endCol, lane, continuesBefore, continuesAfter } = segment;
  const colors = UNAVAILABILITY_COLORS[item.reason];
  const label = UNAVAILABILITY_LABELS[item.reason];

  return (
    <div
      data-unavailability={item.reason}
      title={`${label} — ${formatPeriod(item.startsAt, item.endsAt)}${item.comment ? ` — ${item.comment}` : ''}`}
      style={{
        gridColumn: `${startCol + 1} / ${endCol + 2}`,
        gridRow: lane + 1,
        height: `${height}px`,
        boxSizing: 'border-box',
        margin: '0 2px',
        padding: '0 6px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderLeft: continuesBefore ? 'none' : `4px solid ${colors.border}`,
        borderRight: continuesAfter ? 'none' : undefined,
        borderRadius: `${continuesBefore ? 0 : 4}px ${continuesAfter ? 0 : 4}px ${continuesAfter ? 0 : 4}px ${continuesBefore ? 0 : 4}px`,
        color: colors.text,
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }}
    >
      {continuesBefore && '◀ '}{label}{continuesAfter && ' ▶'}
    </div>
  );
}

/** Hauteur d'un bandeau et écart entre deux voies, en pixels. */
const WEEK_BAR_HEIGHT = 22;
const MONTH_BAR_HEIGHT = 18;
const BAR_GAP = 2;

interface CalendarTrip {
  id: string;
  departureTime: string;
  endTime: string;
  type: string;
  driverName: string;
  destination: string;
}

export function VehicleCalendar({ trips, unavailabilities = [] }: { trips: CalendarTrip[]; unavailabilities?: UnavailabilityItem[] }) {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const handlePrevious = () => {
    if (view === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNext = () => {
    if (view === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const getDayTrips = (day: Date) => {
    return trips.filter(t => {
      const start = new Date(t.departureTime);
      const end = new Date(t.endTime);
      return isSameDay(start, day) || isSameDay(end, day) || isWithinInterval(day, { start, end });
    });
  };

  const renderWeekView = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });

    // Hours from 6 AM to 10 PM
    const hours = Array.from({ length: 17 }, (_, i) => i + 6);

    // Les indisponibilités : un bandeau continu par période, au-dessus des colonnes de jours (D71)
    const { segments, lanes } = layoutUnavailabilityBars(days, unavailabilities);

    return (
      <div>
        {lanes > 0 && (
          <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid var(--color-border)' }}></div>
            <div style={{ flexGrow: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: `${BAR_GAP}px`, padding: '4px 0' }}>
              {segments.map(segment => (
                <UnavailabilityBar key={segment.item.id} segment={segment} height={WEEK_BAR_HEIGHT} />
              ))}
            </div>
          </div>
        )}
      <div style={{ display: 'flex', borderTop: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)' }}>
        {/* Time column */}
        <div style={{ width: '60px', flexShrink: 0, borderRight: '1px solid var(--color-border)' }}>
          <div style={{ height: '40px', borderBottom: '1px solid var(--color-border)' }}></div>
          {hours.map(hour => (
            <div key={hour} style={{ height: '60px', borderBottom: '1px solid var(--color-border)', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '-10px', right: '8px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                {hour}:00
              </span>
            </div>
          ))}
        </div>

        {/* Days columns */}
        <div style={{ display: 'flex', flexGrow: 1 }}>
          {days.map(day => {
            const dayTrips = getDayTrips(day);
            const isToday = isSameDay(day, new Date());

            return (
              <div key={day.toString()} style={{ flex: 1, minWidth: 0, borderRight: '1px solid var(--color-border)', position: 'relative' }}>
                {/* Header */}
                <div style={{ height: '40px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? 'var(--color-primary-light)' : 'transparent' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                    {format(day, 'EEE', { locale: fr }).toUpperCase()}
                  </span>
                  <span style={{ fontSize: '1.125rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--color-primary)' : 'var(--color-text)' }}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Grid */}
                <div style={{ position: 'relative' }}>
                  {hours.map(hour => (
                    <div key={hour} style={{ height: '60px', borderBottom: '1px solid var(--color-border)' }}></div>
                  ))}

                  {/* Trip Blocks */}
                  {dayTrips.map(trip => {
                    const start = new Date(trip.departureTime);
                    const end = new Date(trip.endTime);

                    let startHour = 6;
                    let endHour = 23;

                    if (isSameDay(start, day)) {
                      startHour = start.getHours() + (start.getMinutes() / 60);
                    }
                    if (isSameDay(end, day)) {
                      endHour = end.getHours() + (end.getMinutes() / 60);
                    }

                    if (startHour < 6) startHour = 6;
                    if (endHour > 23) endHour = 23;

                    const top = (startHour - 6) * 60;
                    const height = (endHour - startHour) * 60;

                    return (
                      <div
                        key={`${trip.id}-${day.toString()}`}
                        style={{
                          position: 'absolute',
                          top: `${top}px`,
                          height: `${height}px`,
                          left: '4px',
                          right: '4px',
                          backgroundColor: 'var(--color-primary-light)',
                          borderLeft: '4px solid var(--color-primary)',
                          borderRadius: '4px',
                          padding: '4px',
                          fontSize: '0.75rem',
                          overflow: 'hidden',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{trip.destination}</div>
                        <div style={{ color: 'var(--color-text-secondary)' }}>{trip.driverName}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));

    return (
      <div style={{ borderTop: '1px solid var(--color-border)', borderLeft: '1px solid var(--color-border)' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: 'var(--color-surface-hover)' }}>
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
            <div key={d} style={{ padding: '8px', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary)', borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Une rangée par semaine : les indisponibilités y courent en un bandeau continu (D71) */}
        {weeks.map(weekDays => {
          const { segments, lanes } = layoutUnavailabilityBars(weekDays, unavailabilities);

          return (
            <div key={weekDays[0].toString()} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {weekDays.map(day => {
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isToday = isSameDay(day, new Date());
                const dayTrips = getDayTrips(day);

                return (
                  <div
                    key={day.toString()}
                    style={{
                      minHeight: '100px',
                      padding: '4px',
                      borderRight: '1px solid var(--color-border)',
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: isCurrentMonth ? 'transparent' : 'var(--color-surface-hover)'
                    }}
                  >
                    <div style={{
                      display: 'flex', justifyContent: 'center', alignItems: 'center',
                      width: '24px', height: '24px', borderRadius: '50%', margin: '0 auto 4px auto',
                      backgroundColor: isToday ? 'var(--color-primary)' : 'transparent',
                      color: isToday ? 'white' : (isCurrentMonth ? 'var(--color-text)' : 'var(--color-text-tertiary)'),
                      fontWeight: isToday ? 700 : 500,
                      fontSize: '0.85rem'
                    }}>
                      {format(day, 'd')}
                    </div>

                    {/* Laisse la place des bandeaux, posés par-dessus, sous le numéro du jour */}
                    {lanes > 0 && <div style={{ height: `${lanes * (MONTH_BAR_HEIGHT + BAR_GAP)}px` }} />}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {dayTrips.slice(0, 3).map(trip => (
                        <div
                          key={trip.id}
                          style={{
                            backgroundColor: 'var(--color-primary-light)',
                            color: 'var(--color-primary)',
                            fontSize: '0.7rem',
                            padding: '2px 4px',
                            borderRadius: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {format(new Date(trip.departureTime), 'HH:mm')} {trip.destination}
                        </div>
                      ))}
                      {dayTrips.length > 3 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', textAlign: 'center', marginTop: '2px' }}>
                          +{dayTrips.length - 3} autres
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {lanes > 0 && (
                <div style={{ position: 'absolute', top: '36px', left: 0, right: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: `${BAR_GAP}px` }}>
                  {segments.map(segment => (
                    <UnavailabilityBar key={segment.item.id} segment={segment} height={MONTH_BAR_HEIGHT} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const title = view === 'week'
    ? `Semaine du ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMMM', { locale: fr })}`
    : format(currentDate, 'MMMM yyyy', { locale: fr });

  return (
    <Card style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, textTransform: 'capitalize', minWidth: '200px' }}>
            {title}
          </h2>
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button variant="ghost" size="icon" onClick={handlePrevious} aria-label="Période précédente">
              <ChevronLeft size={20} />
            </Button>
            <Button variant="secondary" size="sm" onClick={handleToday}>
              Aujourd&apos;hui
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext} aria-label="Période suivante">
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', backgroundColor: 'var(--color-surface-hover)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
          <button
            onClick={() => setView('week')}
            style={{
              padding: '6px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontWeight: 500, fontSize: '0.85rem',
              backgroundColor: view === 'week' ? 'var(--color-surface)' : 'transparent',
              color: view === 'week' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              boxShadow: view === 'week' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            Semaine
          </button>
          <button
            onClick={() => setView('month')}
            style={{
              padding: '6px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontWeight: 500, fontSize: '0.85rem',
              backgroundColor: view === 'month' ? 'var(--color-surface)' : 'transparent',
              color: view === 'month' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              boxShadow: view === 'month' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            Mois
          </button>
        </div>
      </div>

      <div style={{ padding: '8px 24px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>
        <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', marginRight: '6px', backgroundColor: 'var(--color-primary)' }} />Trajet</span>
        {(Object.keys(UNAVAILABILITY_LABELS) as UnavailabilityReasonName[]).map(reason => (
          <span key={reason}><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', marginRight: '6px', backgroundColor: UNAVAILABILITY_COLORS[reason].border }} />{UNAVAILABILITY_LABELS[reason]}</span>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '800px' }}>
          {view === 'week' ? renderWeekView() : renderMonthView()}
        </div>
      </div>
    </Card>
  );
}
