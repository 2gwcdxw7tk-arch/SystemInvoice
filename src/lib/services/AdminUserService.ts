import type { IAdminUserRepository } from "@/lib/repositories/IAdminUserRepository";
import type { IRoleRepository } from "@/lib/repositories/IRoleRepository";
import { RepositoryFactory } from "@/lib/repositories/RepositoryFactory";
import type {
  AdminDirectoryEntry,
  VerifyAdminCredentialsResult,
  CreateAdminParams,
  UpdateAdminParams,
  RoleDefinition,
} from "@/lib/types/admin-users";

export class AdminUserService {
  private adminUserRepository: IAdminUserRepository;
  private roleRepository: IRoleRepository;

  constructor(
    adminUserRepository: IAdminUserRepository = RepositoryFactory.getAdminUserRepository(),
    roleRepository: IRoleRepository = RepositoryFactory.getRoleRepository(),
  ) {
    this.adminUserRepository = adminUserRepository;
    this.roleRepository = roleRepository;
  }

  async verifyAdminCredentials(
    username: string,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<VerifyAdminCredentialsResult> {
    return this.adminUserRepository.verifyAdminCredentials(username, password, meta);
  }

  async listAdminDirectory(options: { includeInactive?: boolean } = {}): Promise<AdminDirectoryEntry[]> {
    return this.adminUserRepository.listAdminDirectory(options);
  }

  async listAdminRoleDefinitions(options: { includeInactive?: boolean } = {}): Promise<RoleDefinition[]> {
    const includeInactive = options.includeInactive ?? false;
    const roles = await this.roleRepository.listRoles({ includeInactive });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
    } satisfies RoleDefinition));
  }

  async createAdminDirectoryEntry(params: CreateAdminParams): Promise<AdminDirectoryEntry> {
    return this.adminUserRepository.createAdminDirectoryEntry(params);
  }

  async updateAdminDirectoryEntry(adminUserId: number, params: UpdateAdminParams): Promise<AdminDirectoryEntry> {
    return this.adminUserRepository.updateAdminDirectoryEntry(adminUserId, params);
  }

  async resetAdminUserPassword(adminUserId: number, newPassword: string): Promise<AdminDirectoryEntry> {
    return this.adminUserRepository.resetAdminUserPassword(adminUserId, newPassword);
  }

  async getAdminDirectoryEntry(adminUserId: number): Promise<AdminDirectoryEntry | null> {
    return this.adminUserRepository.getAdminDirectoryEntry(adminUserId);
  }
}

export const adminUserService = new AdminUserService();
