import {
  AdminDirectoryEntry,
  VerifyAdminCredentialsResult,
  CreateAdminParams,
  UpdateAdminParams,
  RoleDefinition,
} from "@/lib/types/admin-users";

export interface IAdminUserRepository {
  verifyAdminCredentials(
    username: string,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<VerifyAdminCredentialsResult>;
  listAdminDirectory(options: { includeInactive?: boolean }): Promise<AdminDirectoryEntry[]>;
  listAdminRoleDefinitions(options: { includeInactive?: boolean }): Promise<RoleDefinition[]>;
  createAdminDirectoryEntry(params: CreateAdminParams): Promise<AdminDirectoryEntry>;
  updateAdminDirectoryEntry(adminUserId: number, params: UpdateAdminParams): Promise<AdminDirectoryEntry>;
  resetAdminUserPassword(adminUserId: number, newPassword: string): Promise<AdminDirectoryEntry>;
  getAdminDirectoryEntry(adminUserId: number): Promise<AdminDirectoryEntry | null>;
}
