import bcrypt from "bcryptjs";

import { cashRegisterService } from "@/lib/services/CashRegisterService";
import {
  dedupePermissions,
  dedupeUpper,
  normalizeIdentifier,
  sanitizeNullable,
  MOCK_ROLE_PERMISSIONS,
  resolveMockPermissionsForRoles,
} from "@/lib/utils/auth";
import type { IAdminUserRepository } from "@/lib/repositories/IAdminUserRepository";
import type {
  AdminUser,
  AdminDirectoryEntry,
  VerifyAdminCredentialsResult,
  CreateAdminParams,
  UpdateAdminParams,
  RoleDefinition,
} from "@/lib/types/admin-users";

type MockAuditEntry = {
  loginType: "admin" | "waiter";
  identifier: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
  timestamp: string;
};

type MockAdminRecord = AdminUser & {
  passwordHash: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

const MOCK_ROLES: RoleDefinition[] = [
  {
    id: 1,
    code: "FACTURADOR",
    name: "Facturador POS",
    description: "Puede aperturar y cerrar caja además de emitir facturas en punto de venta",
    isActive: true,
  },
  {
    id: 2,
    code: "ADMINISTRADOR",
    name: "Administrador General",
    description: "Acceso completo al mantenimiento y operaciones",
    isActive: true,
  },
];

type MockContext = {
  adminCredentials: { username: string; password: string };
  admins: MockAdminRecord[];
  auditLog: MockAuditEntry[];
};

const mockContext: MockContext = (() => {
  const adminCredentials = {
    username: "admin@facturador.demo",
    password: "Admin123!",
  } as const;
  const now = new Date().toISOString();

  return {
    adminCredentials,
    admins: [
      {
        id: 1,
        username: normalizeIdentifier(adminCredentials.username),
        displayName: "Administradora Demo",
        passwordHash: bcrypt.hashSync(adminCredentials.password, 10),
        roles: ["ADMINISTRADOR"],
        permissions: MOCK_ROLE_PERMISSIONS.ADMINISTRADOR.slice(),
        isActive: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      },
    ],
    auditLog: [],
  } satisfies MockContext;
})();

function cloneAdminDirectoryEntry(record: MockAdminRecord): AdminDirectoryEntry {
  return {
    id: record.id,
    username: record.username,
    displayName: record.displayName ?? null,
    isActive: record.isActive,
    lastLoginAt: record.lastLoginAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    roles: record.roles.map((role) => role.toUpperCase()),
    permissions: record.permissions.map((perm) => perm),
  };
}

async function upsertLoginAudit(params: {
  loginType: "admin" | "waiter";
  identifier: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
}): Promise<void> {
  mockContext.auditLog.push({
    ...params,
    timestamp: new Date().toISOString(),
  });
  return;
}

export class MockAdminUserRepository implements IAdminUserRepository {
  async verifyAdminCredentials(
    username: string,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<VerifyAdminCredentialsResult> {
    const normalizedUsername = normalizeIdentifier(username);
    const record = mockContext.admins.find((admin) => admin.username === normalizedUsername);

    if (!record || !record.isActive) {
      await upsertLoginAudit({
        loginType: "admin",
        identifier: normalizedUsername,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: record && !record.isActive ? "Usuario inactivo (mock)" : "Usuario no encontrado (mock)",
      });
      return { success: false, message: "Credenciales no válidas" };
    }

    const passwordMatches = await bcrypt.compare(password, record.passwordHash);

    await upsertLoginAudit({
      loginType: "admin",
      identifier: normalizedUsername,
      success: passwordMatches,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      notes: passwordMatches ? undefined : "Contraseña incorrecta (mock)",
    });

    if (!passwordMatches) {
      return { success: false, message: "Credenciales no válidas" };
    }

    const nowStamp = new Date().toISOString();
    record.lastLoginAt = nowStamp;
    record.updatedAt = nowStamp;

    const cashRegisters = await cashRegisterService.listCashRegistersForAdmin(record.id);
    const defaultCashRegister = cashRegisters.find((register) => register.isDefault) ?? cashRegisters[0] ?? null;
    const roles = dedupeUpper(record.roles ?? []);
    const permissions = dedupePermissions(record.permissions ?? []);

    return {
      success: true,
      user: {
        id: record.id,
        username: record.username,
        displayName: record.displayName,
      },
      context: {
        roles,
        permissions,
        cashRegisters,
        defaultCashRegister,
      },
      message: "Acceso concedido",
    };
  }

  async listAdminDirectory(options: { includeInactive?: boolean } = {}): Promise<AdminDirectoryEntry[]> {
    const includeInactive = options.includeInactive ?? false;

    return mockContext.admins
      .filter((admin) => includeInactive || admin.isActive)
      .map((admin) => cloneAdminDirectoryEntry(admin))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  async listAdminRoleDefinitions(options: { includeInactive?: boolean } = {}): Promise<RoleDefinition[]> {
    const includeInactive = options.includeInactive ?? false;
    return MOCK_ROLES.filter((role) => includeInactive || role.isActive).map((role) => ({ ...role }));
  }

  async createAdminDirectoryEntry(params: CreateAdminParams): Promise<AdminDirectoryEntry> {
    const username = normalizeIdentifier(params.username);
    if (mockContext.admins.some((admin) => admin.username === username)) {
      throw new Error("El usuario ya existe");
    }
    const nowIso = new Date().toISOString();
    const newId = mockContext.admins.reduce((max, admin) => Math.max(max, admin.id), 0) + 1;
    const roleCodes = dedupeUpper(params.roleCodes ?? []);
    const permissions = resolveMockPermissionsForRoles(roleCodes);
    const record: MockAdminRecord = {
      id: newId,
      username,
      displayName: params.displayName ?? null,
      passwordHash: await bcrypt.hash(params.password, 10),
      roles: roleCodes,
      permissions,
      isActive: params.isActive ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: null,
    };
    mockContext.admins.push(record);
    return cloneAdminDirectoryEntry(record);
  }

  async updateAdminDirectoryEntry(adminUserId: number, params: UpdateAdminParams): Promise<AdminDirectoryEntry> {
    const roleCodes = typeof params.roleCodes === "undefined" ? undefined : dedupeUpper(params.roleCodes ?? []);
    const displayName = params.displayName === undefined ? undefined : sanitizeNullable(params.displayName);
    const isActive = params.isActive;

    const record = mockContext.admins.find((admin) => admin.id === adminUserId);
    if (!record) {
      throw new Error("Usuario no encontrado");
    }
    if (typeof displayName !== "undefined") {
      record.displayName = displayName ?? null;
    }
    if (typeof isActive !== "undefined") {
      record.isActive = !!isActive;
    }
    if (typeof roleCodes !== "undefined") {
      record.roles = roleCodes;
      record.permissions = resolveMockPermissionsForRoles(roleCodes);
    }
    record.updatedAt = new Date().toISOString();
    return cloneAdminDirectoryEntry(record);
  }

  async resetAdminUserPassword(adminUserId: number, newPassword: string): Promise<AdminDirectoryEntry> {
    const record = mockContext.admins.find((admin) => admin.id === adminUserId);
    if (!record) {
      throw new Error("Usuario no encontrado");
    }
    record.passwordHash = await bcrypt.hash(newPassword, 10);
    record.updatedAt = new Date().toISOString();
    return cloneAdminDirectoryEntry(record);
  }

  async getAdminDirectoryEntry(adminUserId: number): Promise<AdminDirectoryEntry | null> {
    const record = mockContext.admins.find((admin) => admin.id === adminUserId);
    return record ? cloneAdminDirectoryEntry(record) : null;
  }
}
