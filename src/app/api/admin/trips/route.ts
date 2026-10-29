// GET /api/admin/trips — Liste de tous les trajets pour l'administration

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getTripDisplayStatus } from "@/lib/utils/dates";

export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const skip = (page - 1) * limit;

  // Filtres optionnels
  const status = searchParams.get("status");
  const vehicleId = searchParams.get("vehicleId");
  const dateStr = searchParams.get("date");

  const where: Prisma.TripWhereInput = {};

  if (status) {
    if (status === "CANCELLED") {
       where.status = "CANCELLED";
    } else {
       where.status = { not: "CANCELLED" };
    }
  }

  if (vehicleId) {
    where.vehicleId = vehicleId;
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
          returnCampus: true,
          passengers: true,
        },
        orderBy: { departureTime: "desc" },
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
    console.error("[API] GET /api/admin/trips error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Erreur lors de la récupération des trajets." },
      { status: 500 }
    );
  }
}
