// GET /api/trips — Liste des trajets avec filtres
// POST /api/trips — Création d'un trajet (transaction)

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, handleBusinessError } from "@/lib/api-helpers";
import { isAdmin } from "@/lib/auth";
import { createTrip } from "@/lib/services/trip-service";
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
    const userIsAdmin = await isAdmin(auth.session.user.sub);

    const driverSub = (userIsAdmin && body.driverSub) ? body.driverSub : auth.session.user.sub;
    const driverEmail = (userIsAdmin && body.driverEmail) ? body.driverEmail : auth.session.user.email;
    const driverDisplayName = (userIsAdmin && body.driverDisplayName) ? body.driverDisplayName : auth.session.user.name;

    const trip = await createTrip({
      vehicleId: body.vehicleId,
      driverSub,
      driverEmail,
      driverDisplayName,
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
      passengers: body.passengers,
    });

    return NextResponse.json(trip, { status: 201 });
  } catch (error) {
    return handleBusinessError(error);
  }
}
