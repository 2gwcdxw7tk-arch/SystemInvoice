import { SignJWT, jwtVerify } from "jose";

const rawSessionSecret = process.env.SESSION_SECRET;

if (!rawSessionSecret || rawSessionSecret.length < 32) {
  throw new Error("SESSION_SECRET debe definirse y tener al menos 32 caracteres");
}

const SESSION_SECRET = new TextEncoder().encode(rawSessionSecret);
const REPORT_TOKEN_AUDIENCE = "cash-report";

export const SESSION_COOKIE_NAME = "facturador_session";
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 horas

export type SessionPayload = {
  sub: string;
  role: string; // Rol principal del usuario (ej. "admin", "waiter")
  name?: string | null;
  roles: string[]; // Lista de códigos de roles asignados al usuario
  permissions: string[]; // Lista de códigos de permisos asignados al usuario
  defaultCashRegister?: {
    id: number;
    code: string;
    name: string;
    warehouseCode: string;
    warehouseName: string;
    defaultCustomer: {
      id: number;
      code: string;
      name: string;
      paymentTermCode: string | null;
    } | null;
  } | null;
};

export async function createSessionCookie(params: SessionPayload): Promise<{ value: string; expires: Date }> {
  const expires = new Date(Date.now() + SESSION_DURATION_MS);
  const jwt = await new SignJWT(params)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SESSION_SECRET);

  return { value: jwt, expires };
}

export async function parseSessionCookie(value: string | undefined | null): Promise<SessionPayload | null> {
  if (!value) return null;

  try {
    const { payload } = await jwtVerify<SessionPayload>(value, SESSION_SECRET, {
      algorithms: ["HS256"],
    });

    // Validaciones básicas del payload
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.role !== "string" || !payload.role) return null;
    if (!Array.isArray(payload.roles)) payload.roles = [];
    if (!Array.isArray(payload.permissions)) payload.permissions = [];

    return payload;
  } catch (error) {
    console.error("Error al parsear la sesión", error);
    return null;
  }
}

export function createEmptySessionCookie(): { value: string; expires: Date } {
  const expires = new Date(0);
  return { value: "", expires };
}

type ReportTokenType = "opening" | "closure";

type ReportTokenScope = "self" | "admin";

type ReportTokenPayload = {
  reportType: ReportTokenType;
  sessionId: number;
  requesterId: number;
  scope: ReportTokenScope;
};

export async function createReportAccessToken(params: {
  reportType: ReportTokenType;
  sessionId: number;
  requesterId: number;
  scope?: ReportTokenScope;
  expiresInMinutes?: number;
}): Promise<string> {
  const expiresInMinutes = params.expiresInMinutes ?? 15;
  const jwt = await new SignJWT({
    reportType: params.reportType,
    sessionId: params.sessionId,
    requesterId: params.requesterId,
    scope: params.scope ?? "self",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(REPORT_TOKEN_AUDIENCE)
    .setExpirationTime(`${expiresInMinutes}m`)
    .sign(SESSION_SECRET);

  return jwt;
}

export async function verifyReportAccessToken(token: string): Promise<ReportTokenPayload | null> {
  try {
    const { payload } = await jwtVerify<ReportTokenPayload>(token, SESSION_SECRET, {
      algorithms: ["HS256"],
      audience: REPORT_TOKEN_AUDIENCE,
    });

    if (payload.reportType !== "opening" && payload.reportType !== "closure") {
      return null;
    }

    if (typeof payload.sessionId !== "number" || typeof payload.requesterId !== "number") {
      return null;
    }

    const scope: ReportTokenScope = payload.scope === "admin" ? "admin" : "self";

    return {
      reportType: payload.reportType,
      sessionId: payload.sessionId,
      requesterId: payload.requesterId,
      scope,
    };
  } catch (error) {
    console.error("No se pudo validar el token de reporte", error);
    return null;
  }
}
