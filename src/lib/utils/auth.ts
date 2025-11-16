import crypto from "node:crypto";

export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

export function computePinSignature(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

export function dedupeUpper(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const code = value.trim().toUpperCase();
    if (!code) continue;
    if (!seen.has(code)) {
      seen.add(code);
      normalized.push(code);
    }
  }
  return normalized;
}

export function dedupePermissions(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const code = value.trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(code);
    }
    }
  return normalized;
}

export function sanitizeNullable(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

export const MOCK_ROLE_PERMISSIONS: Record<string, string[]> = {
  FACTURADOR: [
    "cash.register.open",
    "cash.register.close",
    "invoice.issue",
    "cash.report.view",
    "menu.dashboard.view",
    "menu.facturacion.view",
    "menu.caja.view",
    "menu.reportes.view",
  ],
  ADMINISTRADOR: [
    "cash.register.open",
    "cash.register.close",
    "invoice.issue",
    "cash.report.view",
    "admin.users.manage",
    "menu.dashboard.view",
    "menu.facturacion.view",
    "menu.caja.view",
    "menu.articulos.view",
    "menu.inventario.view",
    "menu.mesas.view",
    "menu.meseros.view",
    "menu.usuarios.view",
    "menu.roles.view",
    "menu.reportes.view",
    "menu.preferencias.view",
  ],
};

export function resolveMockPermissionsForRoles(roles: string[]): string[] {
  const accumulator: string[] = [];
  for (const role of roles) {
    const codes = MOCK_ROLE_PERMISSIONS[role.toUpperCase()] ?? [];
    for (const permission of codes) {
      if (!accumulator.includes(permission)) {
        accumulator.push(permission);
      }
    }
  }
  return accumulator;
}
