
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";

export default async function AdminDashboardPage() {
  // Récupérer quelques métriques globales
  const [totalVehicles, maintenanceVehicles, activeTrips] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { status: "MAINTENANCE" } }),
    prisma.trip.count({ where: { status: "SCHEDULED", departureTime: { gte: new Date() } } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tableau de bord administrateur</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
        <Card className="text-center">
          <CardBody>
            <h3 className="text-lg text-muted">Véhicules Totaux</h3>
            <p className="text-3xl font-bold" style={{ marginTop: "0.5rem" }}>{totalVehicles}</p>
          </CardBody>
        </Card>

        <Card className="text-center" style={{ borderLeft: maintenanceVehicles > 0 ? "4px solid var(--color-danger)" : "" }}>
          <CardBody>
            <h3 className="text-lg text-muted">En Maintenance</h3>
            <p className="text-3xl font-bold" style={{ marginTop: "0.5rem", color: maintenanceVehicles > 0 ? "var(--color-danger)" : "inherit" }}>
              {maintenanceVehicles}
            </p>
          </CardBody>
        </Card>

        <Card className="text-center">
          <CardBody>
            <h3 className="text-lg text-muted">Trajets à venir</h3>
            <p className="text-3xl font-bold" style={{ marginTop: "0.5rem" }}>{activeTrips}</p>
          </CardBody>
        </Card>

      </div>

      <Card style={{ marginTop: "2rem" }}>
        <CardBody>
          <h2 className="text-xl font-bold mb-4">Bienvenue dans l&#39;espace d&#39;administration</h2>
          <p className="text-muted">
            Utilisez le menu latéral pour gérer la flotte de véhicules, consulter et annuler des trajets,
            ou paramétrer l&#39;application (temps de buffer, etc.). Les accès et les rôles se gèrent dans le
            portail admission.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
