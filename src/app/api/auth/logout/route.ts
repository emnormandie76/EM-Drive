// POST /api/auth/logout — Déconnexion par le portail (contrat portail v1 §3.8, D23)
// Efface la session d'EM Drive, puis renvoie le navigateur vers end_session_endpoint du portail.
// Sans session, ou si le portail ne répond pas : renvoie vers /login. Appelée par un formulaire de la Navbar.

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { authCookies, usesSecureCookies } from "@/lib/auth-session";
import { endSessionUrl } from "@/lib/portail";

export async function POST(request: NextRequest) {
  const secure = usesSecureCookies();
  const { sessionToken } = authCookies(secure);
  const loginUrl = new URL("/login", process.env.NEXTAUTH_URL ?? request.nextUrl.origin).toString();

  // L'id_token est dans le cookie chiffré : le navigateur ne peut pas le lire lui-même
  const token = await getToken({ req: request, cookieName: sessionToken.name, secureCookie: secure });
  const idToken = typeof token?.idToken === "string" ? token.idToken : null;
  const target = (idToken && (await endSessionUrl(idToken, loginUrl))) || loginUrl;

  const response = NextResponse.redirect(target, 303);
  // Le cookie de session peut être découpé en morceaux (.0, .1…) : tous sont effacés
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith(sessionToken.name)) {
      response.cookies.set(name, "", { ...sessionToken.options, maxAge: 0 });
    }
  }
  return response;
}
