// GET /api/geo/directions — Proxy vers ORS (durée + distance), débit limité par personne (D44)

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { getDirections } from "@/lib/services/geo-service";

export async function GET(request: NextRequest) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const sp = request.nextUrl.searchParams;
  const originLat = parseFloat(sp.get("originLat") ?? "");
  const originLng = parseFloat(sp.get("originLng") ?? "");
  const destLat = parseFloat(sp.get("destLat") ?? "");
  const destLng = parseFloat(sp.get("destLng") ?? "");

  if ([originLat, originLng, destLat, destLng].some(isNaN)) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "originLat, originLng, destLat et destLng sont requis (nombres)." },
      { status: 400 }
    );
  }

  const limited = rateLimit("geoDirections", auth.session.user.sub);
  if (limited) return limited;

  const result = await getDirections(
    { latitude: originLat, longitude: originLng },
    { latitude: destLat, longitude: destLng }
  );

  if (!result) {
    return NextResponse.json(
      { error: "GEO_ERROR", message: "Impossible de calculer l'itinéraire." },
      { status: 502 }
    );
  }

  // Formatage comme spécifié dans le SAD
  const hours = Math.floor(result.durationMinutes / 60);
  const mins = result.durationMinutes % 60;
  const formatted = hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}min` : `${mins}min`;

  return NextResponse.json({
    durationSeconds: result.durationMinutes * 60,
    durationMinutes: result.durationMinutes,
    durationFormatted: formatted,
    distanceMeters: Math.round(result.distanceKm * 1000),
    distanceKm: result.distanceKm,
  });
}
