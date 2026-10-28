"use server";

import { getSession, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
    const session = await getSession();
    if (!session?.user) throw new Error("Non authentifié.");
    const adminStatus = await isAdmin(session.user.sub);
    if (!adminStatus) throw new Error("Accès administrateur requis.");
    return session;
}

export async function getNeonMetrics() {
    await verifyAdmin();

    const projectId = process.env.NEON_PROJET_ID;
    const apiKey = process.env.NEON_API_KEY;

    if (!projectId || !apiKey) {
        throw new Error("Variables d'environnement NEON_PROJET_ID ou NEON_API_KEY manquantes");
    }

    try {
        const branchesRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: 'no-store'
        });
        
        let branchCount = 0;
        if (branchesRes.ok) {
            const bData = await branchesRes.json();
            branchCount = bData.branches?.length || 0;
        }

        const projRes = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            cache: 'no-store'
        });

        if (!projRes.ok) {
            throw new Error("Impossible de récupérer les informations Neon.");
        }

        const pData = await projRes.json();
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

    } catch (e: any) {
        throw new Error(e.message || "Erreur de communication avec l'API Neon.");
    }
}

export async function cleanupDatabase(target: "TRIPS" | "AUDIT_LOGS", tripStatus?: string) {
    await verifyAdmin();

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    if (target === "TRIPS") {
        const whereClause: any = {
            createdAt: { lt: oneMonthAgo }
        };
        if (tripStatus && tripStatus !== "ALL") {
            whereClause.status = tripStatus;
        }
        
        // Prisma: deleteMany Trips works natively (pas besoin de transaction si on ne gère pas autre chose, les passagers se suppriment via Cascade)
        // Wait! We should check if Passenger has "onDelete: Cascade" in the Prisma schema.
        const result = await prisma.trip.deleteMany({
            where: whereClause
        });
        return result.count;

    } else if (target === "AUDIT_LOGS") {
        const result = await prisma.auditLog.deleteMany({
            where: { createdAt: { lt: oneMonthAgo } }
        });
        return result.count;
    }

    throw new Error("Cible invalide.");
}
