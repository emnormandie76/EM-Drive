import type { NextConfig } from "next";

/**
 * L'origine du portail, lue dans PORTAIL_ISSUER (contrat portail v1 §3) ; null sans émetteur (Preview) :
 * le formulaire de déconnexion redirige vers le portail, que form-action doit laisser passer (contrat §2).
 */
function portalOrigin(): string | null {
  try {
    return new URL(process.env.PORTAIL_ISSUER ?? "").origin;
  } catch {
    return null;
  }
}

/**
 * CSP sans nonce (D43) : un nonce rendrait toutes les pages dynamiques. Next écrit des scripts en ligne, et les
 * composants des styles en ligne : 'unsafe-inline' leur est nécessaire. React demande eval en développement
 * seulement. Le cadrage est permis à l'application elle-même (essais de largeur dans un iframe, piège 15).
 */
function contentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV === "development";
  const portal = portalOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${portal ? ` ${portal}` : ""}`,
    "frame-ancestors 'self'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // En-têtes de sécurité sur toutes les routes, pages et API (D43)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
