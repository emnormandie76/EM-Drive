-- Migration écrite à la main (CLAUDE.md, règle 8) — chantier « indisponibilités et corrections », étape 3.
-- Retire l'ancienne colonne `vehicles.status` et le type `VehicleStatus` (D59, D72). Seule exception accordée
-- par le propriétaire à l'interdiction des DROP (2026-11-02, Q6) : ces deux instructions, aucune autre.
-- À appliquer APRÈS la mise en ligne du code dont le client Prisma ne sélectionne plus `status` : le code de
-- l'étape 2 lit cette colonne à chaque lecture d'un véhicule. Les valeurs d'audit VEHICLE_MAINTENANCE_ON et
-- VEHICLE_MAINTENANCE_OFF restent (des lignes du journal les portent). Ne plus la modifier une fois appliquée.
-- Comparée hors ligne avec `prisma migrate diff --from-schema <schéma de e3a8894> --to-schema prisma/schema.prisma --script`.

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "status";

-- DropEnum
DROP TYPE "VehicleStatus";
