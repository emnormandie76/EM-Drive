// GET /api/trips — Liste des trajets avec filtres
// POST /api/trips — Création d'un trajet (transaction)

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/auth";
import { createTrip } from "@/lib/services/trip-service";
import { resolveChosenPerson } from "@/lib/portail-directory";
import { prisma } from "@/lib/prisma";
import { getTripDisplayStatus } from "@/lib/utils/dates";
import { createTripSchema, parseJsonBody } from "@/lib/validators/request-schemas";

// ══════════════════════════════════════════════
// GET /api/trips
// ══════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status") ?? "all"; // upcoming | past | all
  const originCampusId = searchParams.get("originCampusId");
  const vehicleId = searchParams.get("vehicleId");
  const dateStr = searchParams.get("date");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const skip = (page - 1) * limit;

  const now = new Date();

  // Construire le filtre where
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    status: { not: "CANCELLED" },
    ...(originCampusId && { originCampusId }),
    ...(vehicleId && { vehicleId }),
  };

  if (status === "upcoming") {
    where.departureTime = { gte: now };
  } else if (status === "past") {
    where.departureTime = { lt: now };
  }

  if (dateStr) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      where.departureTime = { gte: dayStart, lte: dayEnd };
    }
  }

  try {
    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        include: {
          vehicle: true,
          originCampus: true,
          destinationCampus: true,
          passengers: true,
        },
        orderBy: { departureTime: status === "past" ? "desc" : "asc" },
        skip,
        take: limit,
      }),
      prisma.trip.count({ where }),
    ]);

    const tripsWithStatus = trips.map((trip) => ({
      ...trip,
      displayStatus: getTripDisplayStatus(trip),
      seatsAvailable: trip.vehicle.seats - 1 - trip.passengers.length,
    }));

    return NextResponse.json({
      trips: tripsWithStatus,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[API] GET /api/trips error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Erreur lors de la récupération des trajets." },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════
// POST /api/trips
// ══════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const auth = await requireAuthSession();
  if ("error" in auth) return auth.error;

  try {
    const body = await parseJsonBody(request, createTripSchema);
    const { sub, email, name } = auth.session.user;
    const caller = { sub, email, name };
    const userIsAdmin = await isAdmin(sub);

    // Écart 5 (D24) : l'identité d'une autre personne vient de l'annuaire, jamais du corps de la requête
    const driver = userIsAdmin && body.driverSub
      ? await resolveChosenPerson({ sub: body.driverSub, email: body.driverEmail }, caller)
      : caller;
    const passengers = await Promise.all(
      (body.passengers ?? []).map((p) => resolveChosenPerson({ sub: p.userSub, email: p.userEmail }, caller))
    );

    const trip = await createTrip({
      vehicleId: body.vehicleId,
      driverSub: driver.sub,
      driverEmail: driver.email,
      driverDisplayName: driver.name,
      type: body.type,
      originCampusId: body.originCampusId,
      destinationCampusId: body.destinationCampusId,
      destinationOtherLabel: body.destinationOtherLabel,
      destinationOtherLat: body.destinationOtherLat,
      destinationOtherLng: body.destinationOtherLng,
      returnCampusId: body.returnCampusId,
      departureTime: body.departureTime,
      estimatedArrivalTime: body.estimatedArrivalTime,
      returnDepartureTime: body.returnDepartureTime,
      estimatedReturnArrivalTime: body.estimatedReturnArrivalTime,
      comment: body.comment,
      passengers: passengers.length
        ? passengers.map((p) => ({ userSub: p.sub, userEmail: p.email, userDisplayName: p.name }))
        : undefined,
    });

    return NextResponse.json(trip, { status: 201 });
  } catch (error) {
    return handleBusinessError(error);
  }
}
