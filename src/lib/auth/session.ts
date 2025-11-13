import { env } from "@/lib/env";

const rawSessionSecret = process.env.SESSION_SECRET;

if (!rawSessionSecret || rawSessionSecret.length < 32) {
  throw new Error("SESSION_SECRET debe definirse y tener al menos 32 caracteres");
}

const SESSION_SECRET = rawSessionSecret;

export const SESSION_COOKIE_NAME = "facturador_session";
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12 horas

export type SessionPayload = {
  sub: string;
  role: "admin" | "waiter";
  roles?: string[];
  permissions?: string[];
  defaultCashRegister?: {
    id: number;
    code: string;
    name: string;
    warehouseCode: string;
    warehouseName: string;
  } | null;
  name?: string | null;
  exp: number;
  createdAt: number;
};

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const view = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Array.from(view)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function computeSignature(message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return toHex(signature);
  }

  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", SESSION_SECRET).update(message).digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function normalizeRolesInput(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((role) => (typeof role === "string" ? role.trim().toUpperCase() : ""))
    .filter((role) => role.length > 0);
}

function normalizePermissionsInput(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

export async function createSessionCookie(params: {
  sub: string;
  role: "admin" | "waiter";
  name?: string | null;
  roles?: string[];
  permissions?: string[];
  defaultCashRegister?: {
    id: number;
    code: string;
    name: string;
    warehouseCode: string;
    warehouseName: string;
  } | null;
}): Promise<{ value: string; expires: Date; payload: SessionPayload }>
{
  const createdAt = Date.now();
  const exp = createdAt + SESSION_DURATION_MS;
  const payload: SessionPayload = {
    sub: params.sub,
    role: params.role,
    name: params.name ?? null,
    roles: Array.isArray(params.roles) ? params.roles.map((value) => value.trim().toUpperCase()).filter(Boolean) : undefined,
    permissions: Array.isArray(params.permissions) ? params.permissions.map((value) => value.trim()).filter(Boolean) : undefined,
    defaultCashRegister: params.defaultCashRegister
      ? {
          id: Number(params.defaultCashRegister.id),
          code: params.defaultCashRegister.code,
          name: params.defaultCashRegister.name,
          warehouseCode: params.defaultCashRegister.warehouseCode,
          warehouseName: params.defaultCashRegister.warehouseName,
        }
      : params.defaultCashRegister === null
        ? null
        : undefined,
    createdAt,
    exp,
  };

  const encodedPayload = encodeURIComponent(JSON.stringify(payload));
  const signature = await computeSignature(encodedPayload);

  return {
    value: `${encodedPayload}|${signature}`,
    expires: new Date(exp),
    payload,
  };
}

export async function parseSessionCookie(value: string | undefined | null): Promise<SessionPayload | null> {
  if (!value) return null;
  const separatorIndex = value.lastIndexOf("|");
  if (separatorIndex === -1) return null;

  const encodedPayload = value.slice(0, separatorIndex);
  const providedSignature = value.slice(separatorIndex + 1);

  const expectedSignature = await computeSignature(encodedPayload);
  if (!safeEquals(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeURIComponent(encodedPayload)) as SessionPayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return null;
    }
    if (typeof payload.sub !== "string" || (payload.role !== "admin" && payload.role !== "waiter")) {
      return null;
    }
    if (payload.roles && !Array.isArray(payload.roles)) {
      return null;
    }
    if (payload.permissions && !Array.isArray(payload.permissions)) {
      return null;
    }

    const normalizedRoles = normalizeRolesInput(payload.roles);
    const normalizedPermissions = normalizePermissionsInput(payload.permissions);

    if (env.useMockData && payload.role === "admin") {
      if (normalizedRoles.length === 0) {
        normalizedRoles.push("ADMINISTRADOR");
      }
      if (normalizedPermissions.length === 0) {
        normalizedPermissions.push(
          "cash.register.open",
          "cash.register.close",
          "invoice.issue",
          "cash.report.view",
          "admin.users.manage"
        );
      }
    }

    return {
      ...payload,
      roles: normalizedRoles,
      permissions: normalizedPermissions,
    } satisfies SessionPayload;
  } catch (error) {
    console.error("Error al parsear la sesión", error);
    return null;
  }
}

export function createEmptySessionCookie(): { value: string; expires: Date } {
  const expires = new Date(0);
  return { value: "", expires };
}
