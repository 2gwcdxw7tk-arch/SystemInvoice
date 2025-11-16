import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, parseSessionCookie, type SessionPayload } from "@/lib/auth/session";
import {
  hasSessionPermission,
  isSessionAdministrator,
  isSessionFacturador,
  isSessionFacturadorOnly,
} from "@/lib/auth/session-roles";

export type SessionOrResponse = { session: SessionPayload } | { response: NextResponse };

export function hasPermission(session: SessionPayload | null | undefined, permissionCode: string): boolean {
  return hasSessionPermission(session, permissionCode);
}

export function isAdministrator(session: SessionPayload | null | undefined): boolean {
  return isSessionAdministrator(session);
}

export function isFacturador(session: SessionPayload | null | undefined): boolean {
  return isSessionFacturador(session);
}

export function isFacturadorOnly(session: SessionPayload | null | undefined): boolean {
  return isSessionFacturadorOnly(session);
}

export function canAccessFacturacion(session: SessionPayload | null | undefined): boolean {
  if (!session) return false;
  return (
    isAdministrator(session) ||
    isFacturador(session) ||
    hasPermission(session, "invoice.issue") ||
    hasPermission(session, "cash.register.open")
  );
}

export async function requireSession(request: NextRequest): Promise<SessionOrResponse> {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session) {
    return {
      response: NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 }),
    };
  }
  return { session };
}

export function forbiddenResponse(message = "No tienes permisos para realizar esta acción"): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 403 });
}

export function unauthorizedResponse(message = "Sesión no válida"): NextResponse {
  return NextResponse.json({ success: false, message }, { status: 401 });
}

export async function requireAdministrator(request: NextRequest, message = "Solo un administrador puede realizar esta acción"): Promise<SessionOrResponse> {
  const result = await requireSession(request);
  if ("response" in result) {
    return result;
  }
  if (!isAdministrator(result.session) && !hasPermission(result.session, "admin.users.manage")) {
    return { response: forbiddenResponse(message) };
  }
  return result;
}

export async function requireFacturacionAccess(request: NextRequest, message = "No tienes permisos para facturación"): Promise<SessionOrResponse> {
  const result = await requireSession(request);
  if ("response" in result) {
    return result;
  }
  if (!canAccessFacturacion(result.session)) {
    return { response: forbiddenResponse(message) };
  }
  return result;
}
