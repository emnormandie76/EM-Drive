// src/hooks/use-geo.ts
import { useState, useCallback } from "react";

export interface GeoLocation {
  label: string;
  latitude: number;
  longitude: number;
  city?: string;
  postcode?: string;
}

export interface RouteStats {
  distanceKm: number;
  durationMin: number;
  fallback: boolean;
}

export function useAddressAutocomplete() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q || q.length < 3) {
      setResults([]);
      return;
    }
    
    setIsLoading(true);
    try {
      const res = await fetch(`/api/geo/autocomplete?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { query, setQuery, results, isLoading, search };
}

export async function getDirections(origin: [number, number], destination: [number, number]): Promise<RouteStats | null> {
  try {
    const sp = new URLSearchParams({
      originLng: origin[0].toString(),
      originLat: origin[1].toString(),
      destLng: destination[0].toString(),
      destLat: destination[1].toString(),
    });
    
    const res = await fetch(`/api/geo/directions?${sp.toString()}`);
    
    if (res.ok) {
      const data = await res.json();
      return {
        distanceKm: data.distanceKm,
        durationMin: data.durationMinutes,
        fallback: false,
      };
    }
    return null;
  } catch {
    return null;
  }
}
