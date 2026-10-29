// prisma/seed.ts — Données initiales pour EM Drive

import { config } from "dotenv";
// Charger .env.local en priorité, puis .env comme fallback
config({ path: ".env.local" });
config({ path: ".env" });

import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Configuration WebSocket pour Node.js (Neon serverless)
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

// Prisma 7 : PrismaNeon accepte un PoolConfig, pas un Pool
const { PrismaNeon } = await import("@prisma/adapter-neon");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

// ══════════════════════════════════════════════
// DONNÉES DE SEED
// ══════════════════════════════════════════════

const campuses = [
  { name: "Le Havre", latitude: 49.4944, longitude: 0.1079 },
  { name: "Caen", latitude: 49.1829, longitude: -0.3707 },
  { name: "Paris", latitude: 48.8566, longitude: 2.3522 },
];

const vehicles = [
  { name: "Peugeot 308 Grise", licensePlate: "AB-123-CD", seats: 5, defaultCampus: "Le Havre" },
  { name: "Renault Zoé Bleue", licensePlate: "EF-456-GH", seats: 5, defaultCampus: "Caen" },
  { name: "Citroën C3 Blanche", licensePlate: "IJ-789-KL", seats: 5, defaultCampus: "Paris" },
];

const settings = [
  { key: "buffer_minutes", value: "30" },
];

// Pas d'administrateur de départ (D21) : le rôle vient du portail à chaque connexion (contrat portail v1).

// ══════════════════════════════════════════════
// EXÉCUTION DU SEED
// ══════════════════════════════════════════════

async function main() {
  console.log("🌱 Début du seed...");

  // 1. Créer les campus
  for (const campus of campuses) {
    await prisma.campus.upsert({
      where: { name: campus.name },
      update: {},
      create: campus,
    });
    console.log(`  ✅ Campus: ${campus.name}`);
  }

  // 2. Créer les véhicules
  for (const vehicle of vehicles) {
    const campus = await prisma.campus.findUniqueOrThrow({
      where: { name: vehicle.defaultCampus },
    });

    await prisma.vehicle.upsert({
      where: { licensePlate: vehicle.licensePlate },
      update: {},
      create: {
        name: vehicle.name,
        licensePlate: vehicle.licensePlate,
        seats: vehicle.seats,
        defaultCampusId: campus.id,
      },
    });
    console.log(`  ✅ Véhicule: ${vehicle.name} (${vehicle.licensePlate})`);
  }

  // 3. Créer les paramètres
  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
    console.log(`  ✅ Paramètre: ${setting.key} = ${setting.value}`);
  }

  console.log("\n🎉 Seed terminé avec succès !");
}

main()
  .catch((e) => {
    console.error("❌ Erreur pendant le seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
