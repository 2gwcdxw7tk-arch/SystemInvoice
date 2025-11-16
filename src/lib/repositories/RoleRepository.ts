import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { dedupePermissions, sanitizeNullable } from "@/lib/utils/auth";
import type { IRoleRepository } from "@/lib/repositories/IRoleRepository";
import type {
  PermissionDefinition,
  RoleSummary,
  CreateRoleParams,
  UpdateRoleParams,
} from "@/lib/types/roles";

const rolePermissionsArgs = Prisma.validator<Prisma.Role$role_permissionsArgs>()({
  include: {
    permission: {
      select: { code: true },
    },
  },
  orderBy: [
    {
      permission: { code: "asc" },
    },
  ],
});

const roleWithRelationsArgs = Prisma.validator<Prisma.RoleDefaultArgs>()({
  include: {
    role_permissions: rolePermissionsArgs,
  },
});

const roleInclude = roleWithRelationsArgs.include;

type RoleWithRelations = Prisma.RoleGetPayload<typeof roleWithRelationsArgs>;

type PermissionRecord = {
  id: number;
  code: string;
};

function normalizeRoleCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizePermissionCodes(values: string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  const deduped = dedupePermissions(values);
  return deduped.map((value) => value.trim().toLowerCase());
}

function mapRole(record: RoleWithRelations): RoleSummary {
  const permissions = record.role_permissions
    .map((link) => link.permission.code.trim())
    .filter((code) => code.length > 0);

  return {
    id: record.id,
    code: record.code.toUpperCase(),
    name: record.name,
    description: record.description,
    isActive: record.is_active,
    permissions,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at ? record.updated_at.toISOString() : null,
  } satisfies RoleSummary;
}

async function resolvePermissionIds(
  client: Prisma.TransactionClient,
  codes: string[],
): Promise<PermissionRecord[]> {
  if (codes.length === 0) {
    return [];
  }

  const permissions = await client.permission.findMany({
    where: {
      code: {
        in: codes,
        mode: "insensitive",
      },
    },
    select: { id: true, code: true },
  });

  const foundCodes = new Set(permissions.map((permission) => permission.code.toLowerCase()));
  const missing = codes.filter((code) => !foundCodes.has(code));
  if (missing.length > 0) {
    throw new Error(`Los permisos ${missing.join(", ")} no existen`);
  }

  return permissions;
}

export class RoleRepository implements IRoleRepository {
  async listRoles(options: { includeInactive?: boolean } = {}): Promise<RoleSummary[]> {
    const includeInactive = options.includeInactive ?? false;
    const records = await prisma.role.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { name: "asc" },
      include: roleInclude,
    });

    return records.map(mapRole);
  }

  async getRoleById(roleId: number): Promise<RoleSummary | null> {
    const record = await prisma.role.findUnique({
      where: { id: roleId },
      include: roleInclude,
    });

    return record ? mapRole(record) : null;
  }

  async getRoleByCode(code: string): Promise<RoleSummary | null> {
    const record = await prisma.role.findFirst({
      where: { code: normalizeRoleCode(code) },
      include: roleInclude,
    });

    return record ? mapRole(record) : null;
  }

  async createRole(params: CreateRoleParams): Promise<RoleSummary> {
    const code = normalizeRoleCode(params.code);
    if (!code) {
      throw new Error("El código de rol es requerido");
    }

    const name = params.name.trim();
    if (!name) {
      throw new Error("El nombre del rol es requerido");
    }

    const description = sanitizeNullable(params.description ?? null);
    const isActive = params.isActive ?? true;
    const permissionCodes = normalizePermissionCodes(params.permissionCodes);

    const record = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.role.findFirst({ where: { code } });
      if (existing) {
        throw new Error(`Ya existe un rol con el código ${code}`);
      }

      const role = await tx.role.create({
        data: {
          code,
          name,
          description,
          is_active: isActive,
        },
      });

      if (permissionCodes.length > 0) {
        const permissions = await resolvePermissionIds(tx, permissionCodes);
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            role_id: role.id,
            permission_id: permission.id,
          })),
        });
      }

      const full = await tx.role.findUnique({
        where: { id: role.id },
        include: roleInclude,
      });

      if (!full) {
        throw new Error("No se pudo cargar el rol creado");
      }

      return full;
    });

    return mapRole(record);
  }

  async updateRole(roleId: number, params: UpdateRoleParams): Promise<RoleSummary> {
    const name = params.name?.trim();
    const description = params.description === undefined ? undefined : sanitizeNullable(params.description ?? null);
    const permissionCodes = params.permissionCodes ? normalizePermissionCodes(params.permissionCodes) : undefined;

    const record = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.role.findUnique({
        where: { id: roleId },
        include: roleInclude,
      });

      if (!existing) {
        throw new Error("Rol no encontrado");
      }

      const data: { name?: string; description?: string | null; is_active?: boolean } = {};

      if (typeof name !== "undefined") {
        if (!name) {
          throw new Error("El nombre del rol es requerido");
        }
        data.name = name;
      }

      if (typeof description !== "undefined") {
        data.description = description;
      }

      if (typeof params.isActive !== "undefined") {
        data.is_active = !!params.isActive;
      }

      if (Object.keys(data).length > 0) {
        await tx.role.update({
          where: { id: roleId },
          data,
        });
      }

      if (typeof permissionCodes !== "undefined") {
        await tx.rolePermission.deleteMany({ where: { role_id: roleId } });
        if (permissionCodes.length > 0) {
          const permissions = await resolvePermissionIds(tx, permissionCodes);
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({
              role_id: roleId,
              permission_id: permission.id,
            })),
          });
        }
      }

      const full = await tx.role.findUnique({
        where: { id: roleId },
        include: roleInclude,
      });

      if (!full) {
        throw new Error("No se pudo cargar el rol actualizado");
      }

      return full;
    });

    return mapRole(record);
  }

  async deleteRole(roleId: number): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.role.findUnique({ where: { id: roleId } });
      if (!existing) {
        throw new Error("Rol no encontrado");
      }

      const assignmentCount = await tx.userRole.count({ where: { role_id: roleId } });
      if (assignmentCount > 0) {
        throw new Error("No se puede eliminar un rol asignado a usuarios");
      }

      await tx.rolePermission.deleteMany({ where: { role_id: roleId } });
      await tx.role.delete({ where: { id: roleId } });
    });
  }

  async listPermissions(): Promise<PermissionDefinition[]> {
    const permissions = await prisma.permission.findMany({
      orderBy: { code: "asc" },
      select: {
        code: true,
        name: true,
        description: true,
      },
    });

    return permissions.map((permission) => ({
      code: permission.code.trim(),
      name: permission.name,
      description: permission.description,
    } satisfies PermissionDefinition));
  }
}
