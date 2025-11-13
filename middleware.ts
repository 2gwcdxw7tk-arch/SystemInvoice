import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { isFacturadorOnly } from "@/lib/auth/access";
import { env } from "@/lib/env";

const ADMIN_SECTIONS = [
  "/dashboard",
  "/facturacion",
  "/facturas",
  "/articulos",
  "/inventario",
  "/compras",
  "/reportes",
  "/preferencias",
  "/unidades",
  "/mesas",
  "/usuarios",
];

const FACTURADOR_ALLOWED_SECTIONS = ["/facturacion", "/facturas"] as const;

export async function middleware(request: NextRequest) {
  const session = await parseSessionCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    const redirectUrl = new URL("/", env.appUrl);
    const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    if (requestedPath && requestedPath !== "/") {
      redirectUrl.searchParams.set("redirect", requestedPath);
    }
    return NextResponse.redirect(redirectUrl);
  }

  const pathname = request.nextUrl.pathname;

  if (session.role === "waiter") {
    const isAdminSection = ADMIN_SECTIONS.some(
      (section) => pathname === section || pathname.startsWith(`${section}/`)
    );
    if (isAdminSection) {
      const redirectUrl = new URL("/meseros/comandas", env.appUrl);
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isFacturadorOnly(session)) {
    const isAllowed = FACTURADOR_ALLOWED_SECTIONS.some(
      (section) => pathname === section || pathname.startsWith(`${section}/`)
    );
    if (!isAllowed) {
      const redirectUrl = new URL("/facturacion", env.appUrl);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/facturacion/:path*",
    "/facturas/:path*",
    "/articulos/:path*",
    "/inventario/:path*",
    "/compras/:path*",
    "/reportes/:path*",
    "/preferencias/:path*",
    "/unidades/:path*",
    "/meseros/:path*",
    "/mesas/:path*",
    "/usuarios/:path*",
  ],
};
