-- Migration écrite à la main (CLAUDE.md, règle 8) — chantier « indisponibilités et corrections », étape 2.
-- Additive : aucune colonne, aucun type, aucune valeur retirés. `vehicles.status` RESTE (D59) : le code déjà en
-- ligne la lit encore pendant la livraison ; son retrait est l'étape 3. Ne plus la modifier une fois appliquée.
-- Comparée hors ligne avec `prisma migrate diff --from-schema <ancien> --to-schema prisma/schema.prisma --script`.

-- CreateEnum
CREATE TYPE "UnavailabilityReason" AS ENUM ('CAR_BOOKING', 'MAINTENANCE');

-- AlterEnum
-- Valeurs d'audit des périodes. PostgreSQL refuse d'employer une valeur dans la transaction qui l'ajoute
-- (piège 2 du plan) : cette migration ne les emploie pas.
ALTER TYPE "AuditAction" ADD VALUE 'VEHICLE_UNAVAILABILITY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'VEHICLE_UNAVAILABILITY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'VEHICLE_UNAVAILABILITY_DELETED';

-- CreateTable
CREATE TABLE "vehicle_unavailabilities" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "reason" "UnavailabilityReason" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_by_sub" TEXT NOT NULL,
    "created_by_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_unavailabilities_vehicle_id_starts_at_idx" ON "vehicle_unavailabilities"("vehicle_id", "starts_at");

-- AddForeignKey
ALTER TABLE "vehicle_unavailabilities" ADD CONSTRAINT "vehicle_unavailabilities_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise (D59) : chaque véhicule en MAINTENANCE reçoit une période de maintenance ouverte (sans fin), qui
-- commence à la date de la migration. Les colonnes de type TIMESTAMP(3) portent l'heure UTC, comme l'écrit Prisma.
INSERT INTO "vehicle_unavailabilities"
    ("id", "vehicle_id", "reason", "starts_at", "ends_at", "comment", "created_by_sub", "created_by_email", "created_at", "updated_at")
SELECT
    'repris_' || "id",
    "id",
    'MAINTENANCE',
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    NULL,
    'Repris du statut « en maintenance » (migration du 2026-11-02)',
    'migration',
    'migration',
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
FROM "vehicles"
WHERE "status" = 'MAINTENANCE';
