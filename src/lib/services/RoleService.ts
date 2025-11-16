import type { IRoleRepository } from "@/lib/repositories/IRoleRepository";
import { RepositoryFactory } from "@/lib/repositories/RepositoryFactory";
import type {
  PermissionDefinition,
  RoleSummary,
  CreateRoleParams,
  UpdateRoleParams,
} from "@/lib/types/roles";

export class RoleService {
  private readonly repository: IRoleRepository;

  constructor(repository: IRoleRepository = RepositoryFactory.getRoleRepository()) {
    this.repository = repository;
  }

  async listRoles(options: { includeInactive?: boolean } = {}): Promise<RoleSummary[]> {
    return this.repository.listRoles(options);
  }

  async getRoleById(roleId: number): Promise<RoleSummary | null> {
    return this.repository.getRoleById(roleId);
  }

  async getRoleByCode(code: string): Promise<RoleSummary | null> {
    return this.repository.getRoleByCode(code);
  }

  async createRole(params: CreateRoleParams): Promise<RoleSummary> {
    return this.repository.createRole(params);
  }

  async updateRole(roleId: number, params: UpdateRoleParams): Promise<RoleSummary> {
    return this.repository.updateRole(roleId, params);
  }

  async deleteRole(roleId: number): Promise<void> {
    await this.repository.deleteRole(roleId);
  }

  async listPermissions(): Promise<PermissionDefinition[]> {
    return this.repository.listPermissions();
  }
}

export const roleService = new RoleService();
