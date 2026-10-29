// src/lib/prisma.ts — Client Prisma singleton pour EM Drive
// Utilise le Neon Serverless Driver (WebSocket, port 443) pour supporter
// les environnements où le port 5432 est bloqué (réseau entreprise, Vercel Edge).

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// En environnement Node.js, fournir le constructeur WebSocket
// (les navigateurs et Vercel Edge ont WebSocket nativement)
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL!;

// Singleton : éviter de créer plusieurs instances en dev (hot reload Next.js)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
