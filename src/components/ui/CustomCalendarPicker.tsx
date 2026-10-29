import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

export function CustomCalendarPicker({ 
  selectedDate, 
  onSelectDate, 
  onClose,
  minDate,
  allowPastDates = false
}: { 
  selectedDate: string, 
  onSelectDate: (d: string) => void, 
  onClose?: () => void,
  minDate?: string,
  allowPastDates?: boolean
}) {
  const todayStr = new Date().toISOString().split('T')[0];
  const effectiveMinDate = allowPastDates ? '1900-01-01' : (minDate || todayStr);
  
  const defaultDateStr = selectedDate || (allowPastDates ? todayStr : effectiveMinDate);
  const [viewedMonth, setViewedMonth] = useState(() => new Date(defaultDateStr));

  const navigateMonth = (step: number) => {
    setViewedMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() + step);
      return newMonth;
    });
  };

  const currentYear = viewedMonth.getFullYear();
  const currentMonthNum = viewedMonth.getMonth();
  
  const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(viewedMonth);

  const daysInMonth = new Date(currentYear, currentMonthNum + 1, 0).getDate();
  let firstDayOffset = new Date(currentYear, currentMonthNum, 1).getDay();
  firstDayOffset = firstDayOffset === 0 ? 6 : firstDayOffset - 1; // Commence le Lundi (0)

  const cells = [];
  for(let i = 0; i < firstDayOffset; i++) cells.push(null);
  for(let i = 1; i <= daysInMonth; i++) {
     const dateStr = `${currentYear}-${String(currentMonthNum+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
     cells.push(dateStr);
  }

  const daysLabels = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

  return (
    <div 
      style={{
        position: 'absolute', top: '100%', left: '0', 
        backgroundColor: 'var(--color-surface, #ffffff)', borderRadius: '16px', padding: '20px',
        boxShadow: 'var(--shadow-lg, 0 20px 40px -10px rgba(0, 34, 102, 0.15))', 
        zIndex: 100, width: '300px', marginTop: '8px',
        border: '1px solid var(--color-border, rgba(0, 34, 102, 0.1))', cursor: 'default'
      }}
      onClick={e => e.stopPropagation()} 
    >
      {/* HEADER : Navigation des mois */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button type="button" onClick={() => navigateMonth(-1)} style={{ padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-primary, #002266)' }}>
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontWeight: 'bold', color: 'var(--color-text, #002266)', textTransform: 'capitalize', fontSize: '1rem' }}>
          {monthName}
        </span>
        <button type="button" onClick={() => navigateMonth(1)} style={{ padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-primary, #002266)' }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Jours de la semaine de Lu à Di */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
        {daysLabels.map(l => (
          <div key={l} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary, #64748b)' }}>
             {l}
          </div>
        ))}
      </div>

      {/* Grille du calendrier */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />
          
          // Logique EM Drive: on ne peut pas réserver dans le passé
          // Sauf si on est admin, mais pour l'instant: minDate
          const isAvailable = d >= effectiveMinDate;
          const isSelected = selectedDate === d;
          
          return (
            <button
              key={d}
              type="button"
              disabled={!isAvailable}
              onClick={() => {
                onSelectDate(d);
                if (onClose) onClose();
              }}
              style={{
                aspectRatio: '1',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px',
                border: 'none',
                background: isSelected ? 'var(--color-primary, #e11d48)' : (isAvailable ? 'var(--color-primary-light, #f1f5f9)' : 'transparent'),
                color: isSelected ? 'white' : (isAvailable ? 'var(--color-primary, #002266)' : 'var(--color-text-tertiary, #cbd5e1)'),
                cursor: isAvailable ? 'pointer' : 'not-allowed',
                fontWeight: isSelected ? 'bold' : (isAvailable ? 600 : 400),
                fontSize: '0.9rem',
                opacity: isAvailable ? 1 : 0.4,
                transition: 'all 0.2s',
                boxShadow: isSelected ? 'var(--shadow-sm, 0 4px 6px rgba(225, 29, 72, 0.2))' : 'none'
              }}
              onMouseEnter={e => { 
                if (isAvailable && !isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--color-border-hover, #e2e8f0)'; 
                }
              }}
              onMouseLeave={e => { 
                if (isAvailable && !isSelected) {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-light, #f1f5f9)'; 
                }
              }}
            >
              {parseInt(d.split('-')[2], 10)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DatePickerInput({ 
  value, 
  onChange, 
  label,
  minDate,
  allowPastDates = false
}: { 
  value: string, 
  onChange: (v: string) => void, 
  label: string,
  minDate?: string,
  allowPastDates?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayDate = value 
    ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
    : "Sélectionner une date";

  return (
    <div className="form-field" ref={containerRef} style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          outline: isOpen ? '2px solid var(--color-primary)' : 'none'
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>{displayDate}</span>
        <CalendarIcon size={18} color="var(--color-text-secondary)" />
      </div>
      {isOpen && (
        <CustomCalendarPicker 
          selectedDate={value} 
          onSelectDate={onChange} 
          onClose={() => setIsOpen(false)}
          minDate={minDate}
          allowPastDates={allowPastDates}
        />
      )}
    </div>
  );
}