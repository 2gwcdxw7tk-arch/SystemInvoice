import { SignJWT, jwtVerify } from "jose";

const rawSessionSecret = process.env.SESSION_SECRET;

if (!rawSessionSecret || rawSessionSecret.length < 32) {
  throw new Error("SESSION_SECRET debe definirse y tener al menos 32 caracteres");
}

const SESSION_SECRET = new TextEncoder().encode(rawSessionSecret);

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
