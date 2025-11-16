import { CashRegisterAssignment } from "@/lib/services/CashRegisterService"; // Reutilizar tipo existente

export type AdminUser = {
  id: number;
  username: string;
  displayName: string | null;
};

export type AdminDirectoryEntry = {
  id: number;
  username: string;
  displayName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  roles: string[];
  permissions: string[];
};

export type RoleDefinition = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type AdminSessionContext = {
  roles: string[];
  permissions: string[];
  cashRegisters: CashRegisterAssignment[];
  defaultCashRegister: CashRegisterAssignment | null;
};

export type VerifyAdminCredentialsResult = {
  success: boolean;
  user?: AdminUser;
  message: string;
  context?: AdminSessionContext;
};

export interface CreateAdminParams {
  username: string;
  displayName?: string | null;
  password: string;
  isActive?: boolean;
  roleCodes?: string[];
}

export interface UpdateAdminParams {
  displayName?: string | null;
  isActive?: boolean;
  roleCodes?: string[];
}

export interface IAdminUserRepository {
  verifyAdminCredentials(
    username: string,
    password: string,
    meta: { ipAddress?: string | null; userAgent?: string | null }
  ): Promise<VerifyAdminCredentialsResult>;
  listAdminDirectory(options: { includeInactive?: boolean }): Promise<AdminDirectoryEntry[]>;
  createAdminDirectoryEntry(params: CreateAdminParams): Promise<AdminDirectoryEntry>;
  updateAdminDirectoryEntry(adminUserId: number, params: UpdateAdminParams): Promise<AdminDirectoryEntry>;
  resetAdminUserPassword(adminUserId: number, newPassword: string): Promise<AdminDirectoryEntry>;
  getAdminDirectoryEntry(adminUserId: number): Promise<AdminDirectoryEntry | null>;
}
