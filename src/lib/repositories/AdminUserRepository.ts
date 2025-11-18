import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import {
  dedupePermissions,
  dedupeUpper,
  normalizeIdentifier,
  sanitizeNullable,
} from "@/lib/utils/auth";
import type { IAdminUserRepository } from "@/lib/repositories/IAdminUserRepository";
import type {
  VerifyAdminCredentialsResult,
  AdminDirectoryEntry,
  CreateAdminParams,
  UpdateAdminParams,
  RoleDefinition,
} from "@/lib/types/admin-users";

const adminUserInclude = {
  user_roles: {
    orderBy: { assigned_at: "asc" },
    include: {
      role: {
        include: {
          role_permissions: {
            include: {
              permission: { select: { code: true } },
            },
          },
        },
      },
    },
  },
} as const;

type AdminUserWithRelations = {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
  user_roles: Array<{
    role: {
      is_active: boolean;
      code: string;
      role_permissions: Array<{ permission: { code: string } }>;
    } | null;
  }>;
};

type LoginAuditParams = {
  loginType: "admin";
  identifier: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
};

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapAdminDirectoryEntry(record: AdminUserWithRelations): AdminDirectoryEntry {
  const roles = dedupeUpper(
    record.user_roles
      .filter((link) => link.role?.is_active)
      .map((link) => (link.role as { code: string }).code)
  );

  const permissions = dedupePermissions(
    record.user_roles.flatMap((link) =>
      link.role?.is_active ? (link.role.role_permissions.map((rp) => rp.permission.code)) : []
    )
  );

  return {
    id: Number(record.id),
    username: record.username,
    displayName: record.display_name ?? null,
    isActive: record.is_active,
    lastLoginAt: toIsoString(record.last_login_at),
    createdAt: toIsoString(record.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(record.updated_at),
    roles,
    permissions,
  } satisfies AdminDirectoryEntry;
}

export class AdminUserRepository implements IAdminUserRepository {
  async listAdminRoleDefinitions(options: { includeInactive?: boolean } = {}): Promise<RoleDefinition[]> {
    const includeInactive = options.includeInactive ?? false;

    const roles = await prisma.role.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        is_active: true,
      },
    });

    return roles.map((role: { id: number; code: string; name: string; description: string | null; is_active: boolean }) => ({
      id: role.id,
      code: role.code.toUpperCase(),
      name: role.name,
      description: role.description,
      isActive: role.is_active,
    } satisfies RoleDefinition));
  }

  async verifyAdminCredentials(
    username: string,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<VerifyAdminCredentialsResult> {
    const normalizedUsername = normalizeIdentifier(username);

    const admin = await prisma.admin_users.findUnique({
      where: { username: normalizedUsername },
    });

    if (!admin || !admin.is_active) {
      await this.createLoginAudit({
        loginType: "admin",
        identifier: normalizedUsername,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: "Usuario no encontrado o inactivo",
      });
      return { success: false, message: "Credenciales no válidas" };
    }

    const passwordMatches = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatches) {
      await this.createLoginAudit({
        loginType: "admin",
        identifier: normalizedUsername,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: "Contraseña incorrecta",
      });
      return { success: false, message: "Credenciales no válidas" };
    }

    await prisma.$transaction([
      prisma.login_audit.create({
        data: {
          login_type: "admin",
          identifier: normalizedUsername,
          success: true,
          ip_address: meta.ipAddress ?? null,
          user_agent: meta.userAgent?.slice(0, 300) ?? null,
          notes: null,
        },
      }),
      prisma.admin_users.update({
        where: { id: admin.id },
        data: { last_login_at: new Date() },
      }),
    ]);

    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({
        where: {
          is_active: true,
          user_roles: { some: { admin_user_id: admin.id } },
        },
        select: { code: true },
      }),
      prisma.rolePermission.findMany({
        where: {
          role: {
            is_active: true,
            user_roles: { some: { admin_user_id: admin.id } },
          },
        },
        distinct: ["permission_id"],
        include: { permission: { select: { code: true } } },
      }),
    ]);

    const normalizedRoles = dedupeUpper(roles.map((role: { code: string }) => role.code));
    const normalizedPermissions = dedupePermissions(permissions.map((perm: { permission: { code: string } }) => perm.permission.code));

    const cashRegisters = await cashRegisterService.listCashRegistersForAdmin(admin.id);
    const defaultCashRegister = cashRegisters.find((assignment) => assignment.isDefault) ?? cashRegisters[0] ?? null;

    return {
      success: true,
      message: "Acceso concedido",
      user: {
        id: admin.id,
        username: admin.username,
        displayName: admin.display_name,
      },
      context: {
        roles: normalizedRoles,
        permissions: normalizedPermissions,
        cashRegisters,
        defaultCashRegister,
      },
    } satisfies VerifyAdminCredentialsResult;
  }

  async listAdminDirectory(options: { includeInactive?: boolean } = {}): Promise<AdminDirectoryEntry[]> {
    const includeInactive = options.includeInactive ?? false;

    const admins = await prisma.admin_users.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { username: "asc" },
      include: adminUserInclude,
    });

    return admins.map(mapAdminDirectoryEntry);
  }

  async createAdminDirectoryEntry(params: CreateAdminParams): Promise<AdminDirectoryEntry> {
    const username = normalizeIdentifier(params.username);
    const displayName = sanitizeNullable(params.displayName);
    const passwordHash = await bcrypt.hash(params.password, 10);
    const isActive = params.isActive ?? true;
    const roleCodes = dedupeUpper(params.roleCodes ?? []);

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const admin = await tx.admin_users.create({
        data: {
          username,
          password_hash: passwordHash,
          display_name: displayName,
          is_active: isActive,
        },
      });

      if (roleCodes.length > 0) {
        await this.assignRoles(tx, admin.id, roleCodes, true);
      }

      const entry = await this.fetchAdminDirectoryEntry(admin.id, tx);
      if (!entry) {
        throw new Error("No se pudo cargar el usuario creado");
      }
      return entry;
    });

    return created;
  }

  async updateAdminDirectoryEntry(adminUserId: number, params: UpdateAdminParams): Promise<AdminDirectoryEntry> {
    const displayName = params.displayName === undefined ? undefined : sanitizeNullable(params.displayName);
    const isActive = params.isActive;
    const roleCodes = params.roleCodes === undefined ? undefined : dedupeUpper(params.roleCodes ?? []);

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const data: Record<string, unknown> = {};

      if (typeof displayName !== "undefined") {
        data.display_name = displayName;
      }
      if (typeof isActive !== "undefined") {
        data.is_active = !!isActive;
      }

      if (Object.keys(data).length > 0) {
        await tx.admin_users.update({
          where: { id: adminUserId },
          data,
        });
      }

      if (typeof roleCodes !== "undefined") {
        await tx.userRole.deleteMany({ where: { admin_user_id: adminUserId } });
        if (roleCodes.length > 0) {
          await this.assignRoles(tx, adminUserId, roleCodes, true);
        }
      }

      const entry = await this.fetchAdminDirectoryEntry(adminUserId, tx);
      if (!entry) {
        throw new Error("Usuario no encontrado");
      }
      return entry;
    });

    return updated;
  }

  async resetAdminUserPassword(adminUserId: number, newPassword: string): Promise<AdminDirectoryEntry> {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.admin_users.update({
      where: { id: adminUserId },
      data: {
        password_hash: passwordHash,
        updated_at: new Date(),
      },
    });

    const entry = await this.fetchAdminDirectoryEntry(adminUserId);
    if (!entry) {
      throw new Error("Usuario no encontrado");
    }
    return entry;
  }

  async getAdminDirectoryEntry(adminUserId: number): Promise<AdminDirectoryEntry | null> {
    return this.fetchAdminDirectoryEntry(adminUserId);
  }

  private async fetchAdminDirectoryEntry(
    adminUserId: number,
    tx?: Prisma.TransactionClient
  ): Promise<AdminDirectoryEntry | null> {
    const client = tx ?? prisma;

    const admin = await client.admin_users.findUnique({
      where: { id: adminUserId },
      include: adminUserInclude,
    });

    return admin ? mapAdminDirectoryEntry(admin) : null;
  }

  private async assignRoles(
    tx: Prisma.TransactionClient,
    adminUserId: number,
    roleCodes: string[],
    setPrimary: boolean = false,
  ): Promise<void> {
    const normalizedCodes = roleCodes.map((code) => code.toUpperCase());

    const roles = await tx.role.findMany({
      where: {
        is_active: true,
        code: { in: normalizedCodes },
      },
      select: { id: true, code: true },
    });

    const foundCodes = roles.map((role: { code: string }) => role.code.toUpperCase());
    const missing = normalizedCodes.filter((code) => !foundCodes.includes(code));
    if (missing.length > 0) {
      throw new Error(`Los roles ${missing.join(", ")} no están disponibles`);
    }

    const roleMap: Map<string, { id: number; code: string }> = new Map(
      roles.map((role: { id: number; code: string }) => [role.code.toUpperCase(), role] as const)
    );
    const data = normalizedCodes.map((code, index) => {
      const role = roleMap.get(code);
      if (!role) {
        throw new Error(`Rol ${code} no encontrado`);
      }
      return {
        admin_user_id: adminUserId,
        role_id: role.id,
        is_primary: setPrimary ? index === 0 : false,
      };
    });

    await tx.userRole.createMany({ data });
  }

  private async createLoginAudit(params: LoginAuditParams): Promise<void> {
    await prisma.login_audit.create({
      data: {
        login_type: params.loginType,
        identifier: params.identifier,
        success: params.success,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent?.slice(0, 300) ?? null,
        notes: params.notes?.slice(0, 300) ?? null,
      },
    });
  }
}
