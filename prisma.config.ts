import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Charger .env.local en priorité, puis .env comme fallback (comme prisma/seed.ts) :
// le CLI vise ainsi la même base que l'application (piège 12 du plan, D15).
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  // Chemin vers le schéma Prisma
  schema: "prisma/schema.prisma",

  // Configuration des migrations et du seed
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  // URL directe (sans pooler) pour le CLI Prisma : les migrations exigent une connexion directe.
  // L'application et le seed utilisent DATABASE_URL (pooled, par WebSocket).
  datasource: {
    url: env("DATABASE_URL_UNPOOLED"),
  },
});
