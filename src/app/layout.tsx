// src/app/layout.tsx — Layout racine de l'application EM Drive

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import "./globals.css";
import "@/components/ui/ui.css";
import "@/components/layout/layout.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "EM Drive — Réservation de véhicules",
  description:
    "Application interne de réservation de véhicules inter-campus et de covoiturage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <Providers>
          <Navbar />
          <main className="app-main app-container" style={{ paddingTop: '1rem' }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
