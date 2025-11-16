import type { SessionPayload } from "@/lib/auth/session";

export function normalizeSessionRoles(session: SessionPayload | null | undefined): string[] {
  if (!session?.roles) {
    return [];
  }
  return session.roles.map((role) => role.trim().toUpperCase()).filter((role) => role.length > 0);
}

export function normalizeSessionPermissions(session: SessionPayload | null | undefined): string[] {
  if (!session?.permissions) {
    return [];
  }
  return session.permissions.map((permission) => permission.trim()).filter((permission) => permission.length > 0);
}

export function hasSessionPermission(session: SessionPayload | null | undefined, permissionCode: string): boolean {
  const permissions = normalizeSessionPermissions(session);
  return permissions.includes(permissionCode.trim());
}

export function isSessionAdministrator(session: SessionPayload | null | undefined): boolean {
  if (!session) {
    return false;
  }

  const roles = normalizeSessionRoles(session);
  if (roles.includes("ADMINISTRADOR")) {
    return true;
  }

  const permissions = normalizeSessionPermissions(session);
  if (permissions.includes("admin.users.manage")) {
    return true;
  }

  if (session.role === "admin" && roles.length === 0 && permissions.length === 0) {
    return true;
  }

  return false;
}

export function isSessionFacturador(session: SessionPayload | null | undefined): boolean {
  const roles = normalizeSessionRoles(session);
  return roles.includes("FACTURADOR");
}

export function isSessionFacturadorOnly(session: SessionPayload | null | undefined): boolean {
  return isSessionFacturador(session) && !isSessionAdministrator(session);
}
