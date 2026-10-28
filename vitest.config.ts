// vitest.config.ts — Configuration des tests (D2 : Prisma simulé, aucun réseau, aucune base)

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next résout « server-only » lui-même, sans paquet (D28) ; hors de Next, le module vide qu'il prend côté serveur
      "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
