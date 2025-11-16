import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  createEmptySessionCookie,
  parseSessionCookie,
  type SessionPayload,
} from "@/lib/auth/session";
import {
  hasSessionPermission,
  isSessionAdministrator,
  isSessionFacturador,
} from "@/lib/auth/session-roles";

type AccessSuccess = { session: SessionPayload };
type AccessFailure = { response: NextResponse };

type RequireSessionOptions = {
  message?: string;
};

type RequireAdministratorOptions = RequireSessionOptions;

type RequireFacturacionOptions = RequireSessionOptions;

function applySessionReset(response: NextResponse): void {
  const emptyCookie = createEmptySessionCookie();
  response.cookies.set(SESSION_COOKIE_NAME, emptyCookie.value, {
    expires: emptyCookie.expires,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function unauthorizedResponse(message?: string): NextResponse {
  const response = NextResponse.json(
    { success: false, message: message ?? "Debes iniciar sesión para continuar" },
    { status: 401 },
  );
  applySessionReset(response);
  return response;
}

export function forbiddenResponse(message?: string): NextResponse {
  return NextResponse.json(
    { success: false, message: message ?? "No tienes permisos para realizar esta acción" },
    { status: 403 },
  );
}

async function readSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) {
    return null;
  }

  const session = await parseSessionCookie(cookie.value);
  return session;
}

export async function requireSession(
  request: NextRequest,
  options: RequireSessionOptions = {},
): Promise<AccessSuccess | AccessFailure> {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return { response: unauthorizedResponse(options.message) };
  }

  return { session } satisfies AccessSuccess;
}

export function isAdministrator(session: SessionPayload | null | undefined): boolean {
  return isSessionAdministrator(session ?? null);
}

export function isFacturador(session: SessionPayload | null | undefined): boolean {
  return isSessionFacturador(session ?? null);
}

export function hasPermission(session: SessionPayload | null | undefined, permissionCode: string): boolean {
  return hasSessionPermission(session ?? null, permissionCode);
}

export async function requireAdministrator(
  request: NextRequest,
  messageOrOptions: string | RequireAdministratorOptions = {},
): Promise<AccessSuccess | AccessFailure> {
  const options: RequireAdministratorOptions =
    typeof messageOrOptions === "string" ? { message: messageOrOptions } : messageOrOptions;

  const sessionResult = await requireSession(request, options);
  if ("response" in sessionResult) {
    return sessionResult;
  }

  if (!isAdministrator(sessionResult.session)) {
    return { response: forbiddenResponse(options.message ?? "Solo un administrador puede realizar esta acción") };
  }

  return sessionResult;
}

const FACTURACION_PERMISSION_ALLOW_LIST = [
  "invoice.issue",
  "invoice.report.view",
  "report.sales.view",
  "reports.sales.view",
  "reports.facturacion.view",
  "report.facturacion.view",
];

export async function requireFacturacionAccess(
  request: NextRequest,
  messageOrOptions: string | RequireFacturacionOptions = {},
): Promise<AccessSuccess | AccessFailure> {
  const options: RequireFacturacionOptions =
    typeof messageOrOptions === "string" ? { message: messageOrOptions } : messageOrOptions;

  const sessionResult = await requireSession(request, options);
  if ("response" in sessionResult) {
    return sessionResult;
  }

  const { session } = sessionResult;
  const allowed =
    isAdministrator(session) ||
    isFacturador(session) ||
    FACTURACION_PERMISSION_ALLOW_LIST.some((code) => hasPermission(session, code));

  if (!allowed) {
    return { response: forbiddenResponse(options.message ?? "No tienes permisos para acceder a esta información") };
  }

  return sessionResult;
}
