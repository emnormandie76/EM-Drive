-- Étape 2a du plan « mise en production » : connexion par le portail (contrat portail v1).
-- Rédigée à la main (règle 8) ; décisions D10, D17 à D21 du plan. Ne plus la modifier une fois appliquée.
-- Sans BEGIN ni COMMIT : le script part en une seule requête, donc en une seule transaction implicite.
-- Base relue avant rédaction (2026-10-28) : admins 1 ligne (seed TO_BE_CONFIGURED), authorized_services 0,
-- trips 0, passengers 0, audit_logs 0.

-- 1. Rôles déclarés au portail (D8, D20)
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- 2. Table des personnes (D10, D19) : sub unique et facultatif, adresse unique
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "sub" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "people_sub_key" ON "people"("sub");
CREATE UNIQUE INDEX "people_email_key" ON "people"("email");

-- 3. Les colonnes *_entra_id portent désormais le sub du portail : renommées *_sub (D10).
--    RENAME garde les données (Prisma aurait supprimé puis recréé les colonnes).
ALTER TABLE "trips" RENAME COLUMN "driver_entra_id" TO "driver_sub";
ALTER INDEX "trips_driver_entra_id_status_idx" RENAME TO "trips_driver_sub_status_idx";

ALTER TABLE "passengers" RENAME COLUMN "user_entra_id" TO "user_sub";
ALTER INDEX "passengers_user_entra_id_idx" RENAME TO "passengers_user_sub_idx";
ALTER INDEX "passengers_trip_id_user_entra_id_key" RENAME TO "passengers_trip_id_user_sub_key";

ALTER TABLE "audit_logs" RENAME COLUMN "user_entra_id" TO "user_sub";

-- 4. AuditAction : retrait de ADMIN_PROMOTED, ADMIN_REVOKED, SERVICE_ADDED, SERVICE_REMOVED ; ajout de
--    SIGNIN_REFUSED (D18). Le type est recréé, comme le fait Prisma ; le journal est vide.
CREATE TYPE "AuditAction_new" AS ENUM ('TRIP_CREATED', 'TRIP_UPDATED', 'TRIP_CANCELLED', 'TRIP_FORCE_DELETED', 'PASSENGER_ADDED', 'PASSENGER_REMOVED', 'VEHICLE_CREATED', 'VEHICLE_UPDATED', 'VEHICLE_MAINTENANCE_ON', 'VEHICLE_MAINTENANCE_OFF', 'SETTINGS_UPDATED', 'SIGNIN_REFUSED');
ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";

-- 5. Tables remplacées par le portail (G9, D10) : exception à la règle 8 accordée par le propriétaire (D17)
DROP TABLE "admins";
DROP TABLE "authorized_services";
