import type {
  PermissionDefinition,
  RoleSummary,
  CreateRoleParams,
  UpdateRoleParams,
} from "@/lib/types/roles";

export interface IRoleRepository {
  listRoles(options?: { includeInactive?: boolean }): Promise<RoleSummary[]>;
  getRoleById(roleId: number): Promise<RoleSummary | null>;
  getRoleByCode(code: string): Promise<RoleSummary | null>;
  createRole(params: CreateRoleParams): Promise<RoleSummary>;
  updateRole(roleId: number, params: UpdateRoleParams): Promise<RoleSummary>;
  deleteRole(roleId: number): Promise<void>;
  listPermissions(): Promise<PermissionDefinition[]>;
}
