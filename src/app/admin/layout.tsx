import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/auth";
import Link from "next/link";
import { Car, Map, Settings, ShieldAlert } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user) {
    redirect("/login");
  }

  // Rôle relu en base (règle 9) : celui que le portail a donné à la dernière connexion
  const adminStatus = await isAdmin(session.user.sub);

  if (!adminStatus) {
    redirect("/dashboard");
  }

  const adminLinks = [
    { name: "Vue d'ensemble", href: "/admin", icon: Settings, exact: true },
    { name: "Flotte (Véhicules)", href: "/admin/vehicles", icon: Car },
    { name: "Trajets", href: "/admin/trips", icon: Map },
    { name: "Paramètres Globaux", href: "/admin/settings", icon: Settings },
    { name: "Journal d'Audit", href: "/admin/audit", icon: ShieldAlert },
  ];

  return (
    <div className="admin-container admin-layout">
      {/* Sidebar Admin */}
      <aside className="admin-sidebar">
        <Card style={{ position: "sticky", top: "2rem" }}>
          <CardBody>
            <h2 className="text-xl font-bold mb-4">Administration</h2>
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {adminLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="btn btn-ghost"
                  style={{ justifyContent: "flex-start", width: "100%" }}
                >
                  <link.icon size={18} style={{ marginRight: "0.5rem" }} />
                  {link.name}
                </Link>
              ))}
            </nav>
          </CardBody>
        </Card>
      </aside>

      {/* Contenu principal */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
