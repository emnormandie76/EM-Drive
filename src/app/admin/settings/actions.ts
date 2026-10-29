"use server";

import type { Prisma } from "@/generated/prisma/client";
import { getSession, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
    const session = await getSession();
    if (!session?.user) throw new Error("Non authentifié.");
    const adminStatus = await isAdmin(session.user.sub);
    if (!adminStatus) throw new Error("Accès administrateur requis.");
    return session;
}

/** Une consommation du projet Neon rapportée à sa limite. */
export type UsageMetric = { value: number; limit: number; percent: number };

export type NeonMetrics = {
    branches: UsageMetric;
    compute: UsageMetric;
    storage: UsageMetric;
    network: UsageMetric;
};

/** Champs lus dans la réponse de `GET /api/v2/projects/{id}` de l'API Neon. */
type NeonProject = {
    owner?: { branches_limit?: number };
    cpu_used_sec?: number;
    synthetic_storage_size?: number;
    data_transfer_bytes?: number;
};

/** Sans NEON_PROJET_ID ou NEON_API_KEY (la production n'a pas de clé Neon, D49). */
export type NeonMetricsUnconfigured = { configured: false };

export async function getNeonMetrics(): Promise<NeonMetrics | NeonMetricsUnconfigured> {
    await verifyAdmin();

    const projectId = process.env.NEON_PROJET_ID;
    const apiKey = process.env.NEON_API_KEY;

    // Une réponse plutôt qu'une erreur : en production, Next masque le message d'une erreur d'action serveur
    if (!projectId || !apiKey) {
        return { configured: false };
    }

    try {
        const branchesRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: 'no-store'
        });

        let branchCount = 0;
        if (branchesRes.ok) {
            const bData: { branches?: unknown[] } = await branchesRes.json();
            branchCount = bData.branches?.length || 0;
        }

        const projRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: 'no-store'
        });

        if (!projRes.ok) {
            throw new Error("Impossible de récupérer les informations Neon.");
        }

        const pData: { project: NeonProject } = await projRes.json();
        const p = pData.project;

        // Limites Free Tier classiques Neon
        const limitBranches = p.owner?.branches_limit || 10;
        const limitCompute = 100; // CU-hrs
        const limitStorage = 0.5; // GB
        const limitNetwork = 5; // GB

        const computeUsed = p.cpu_used_sec ? p.cpu_used_sec / 3600 : 0;
        const computePercent = (computeUsed / limitCompute) * 100;

        const storageUsed = p.synthetic_storage_size ? p.synthetic_storage_size / (1024 * 1024 * 1024) : 0;
        const storagePercent = (storageUsed / limitStorage) * 100;

        const networkUsed = p.data_transfer_bytes ? p.data_transfer_bytes / (1024 * 1024 * 1024) : 0;
        const networkPercent = (networkUsed / limitNetwork) * 100;

        return {
            branches: { value: branchCount, limit: limitBranches, percent: (branchCount / limitBranches) * 100 },
            compute: { value: Number(computeUsed.toFixed(2)), limit: limitCompute, percent: computePercent },
            storage: { value: Number(storageUsed.toFixed(3)), limit: limitStorage, percent: storagePercent },
            network: { value: Number(networkUsed.toFixed(3)), limit: limitNetwork, percent: networkPercent }
        };

    } catch (e) {
        throw new Error((e instanceof Error && e.message) || "Erreur de communication avec l'API Neon.");
    }
}

export type CleanupTarget = "TRIPS" | "AUDIT_LOGS";
export type CleanupTripStatus = "ALL" | "CANCELLED" | "SCHEDULED";

const CLEANUP_TRIP_STATUSES: readonly string[] = ["ALL", "CANCELLED", "SCHEDULED"];

/**
 * Supprime définitivement les données de plus d'un mois (cas limite 8) : les trajets terminés depuis plus
 * d'un mois (et leurs passagers, par la cascade du schéma), ou les journaux d'audit créés depuis plus d'un mois.
 */
export async function cleanupDatabase(target: CleanupTarget, tripStatus: CleanupTripStatus = "ALL"): Promise<number> {
    await verifyAdmin();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    if (target === "TRIPS") {
        if (!CLEANUP_TRIP_STATUSES.includes(tripStatus)) {
            throw new Error("Statut de trajet invalide.");
        }

        // Un trajet se juge sur sa fin (arrivée du retour, sinon de l'aller), jamais sur sa date de création :
        // un trajet réservé il y a plus d'un mois peut ne pas avoir encore eu lieu
        const where: Prisma.TripWhereInput = {
            OR: [
                { estimatedReturnArrivalTime: { lt: oneMonthAgo } },
                { estimatedReturnArrivalTime: null, estimatedArrivalTime: { lt: oneMonthAgo } },
            ],
        };
        if (tripStatus !== "ALL") {
            where.status = tripStatus;
        }

        const result = await prisma.trip.deleteMany({ where });
        return result.count;

    } else if (target === "AUDIT_LOGS") {
        const result = await prisma.auditLog.deleteMany({
            where: { createdAt: { lt: oneMonthAgo } }
        });
        return result.count;
    }

    throw new Error("Cible invalide.");
}
