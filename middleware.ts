import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { hasSessionPermission, isSessionAdministrator, isSessionFacturadorOnly } from "@/lib/auth/session-roles";
import { env } from "@/lib/env";

type RouteRule = {
  prefix: string;
  anyPermissions?: string[];
  adminOnly?: boolean;
};

const ROUTE_RULES: RouteRule[] = [
  { prefix: "/usuarios", anyPermissions: ["admin.users.manage"], adminOnly: true },
  { prefix: "/roles", anyPermissions: ["admin.users.manage"], adminOnly: true },
  { prefix: "/caja", anyPermissions: ["cash.register.open", "cash.register.close"], adminOnly: false },
  { prefix: "/facturacion", anyPermissions: ["invoice.issue", "cash.register.open"], adminOnly: false },
  { prefix: "/facturas", anyPermissions: ["invoice.issue"], adminOnly: false },
  { prefix: "/reportes", anyPermissions: ["cash.report.view", "invoice.issue"], adminOnly: false },
  { prefix: "/articulos", adminOnly: true },
  { prefix: "/inventario", adminOnly: true },
  { prefix: "/compras", adminOnly: true },
  { prefix: "/preferencias", adminOnly: true },
  { prefix: "/unidades", adminOnly: true },
  { prefix: "/mesas", adminOnly: true },
  { prefix: "/meseros", adminOnly: true },
  { prefix: "/cuentas-por-cobrar", anyPermissions: ["menu.cxc.view"], adminOnly: false },
];

const FACTURADOR_ALLOWED_PREFIXES = new Set(["/dashboard", "/facturacion", "/facturas", "/caja", "/reportes", "/cuentas-por-cobrar"]);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function findRule(pathname: string): RouteRule | undefined {
  return ROUTE_RULES.find((rule) => matchesPrefix(pathname, rule.prefix));
}

function isFacturadorAllowed(pathname: string): boolean {
  for (const prefix of FACTURADOR_ALLOWED_PREFIXES) {
    if (matchesPrefix(pathname, prefix)) {
      return true;
    }
  }
  return false;
}

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
    const restricted = ROUTE_RULES.some((rule) => matchesPrefix(pathname, rule.prefix) && rule.prefix !== "/meseros");
    if (restricted) {
      const redirectUrl = new URL("/meseros/comandas", env.appUrl);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  const rule = findRule(pathname);
  const isAdmin = isSessionAdministrator(session);

  if (rule) {
    if (rule.adminOnly && !isAdmin) {
      const redirectUrl = new URL(isFacturadorAllowed(pathname) ? pathname : "/facturacion", env.appUrl);
      return NextResponse.redirect(redirectUrl);
    }

    if (rule.anyPermissions && rule.anyPermissions.length > 0) {
      const hasAnyPermission = rule.anyPermissions.some((permission) => hasSessionPermission(session, permission));
      if (!hasAnyPermission && !isAdmin) {
        const redirectUrl = new URL(isFacturadorAllowed(pathname) ? pathname : "/facturacion", env.appUrl);
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  if (isSessionFacturadorOnly(session) && !isFacturadorAllowed(pathname)) {
    const redirectUrl = new URL("/facturacion", env.appUrl);
    return NextResponse.redirect(redirectUrl);
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
    "/roles/:path*",
    "/cuentas-por-cobrar/:path*",
  ],
};
