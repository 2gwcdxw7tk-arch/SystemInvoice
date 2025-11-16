import { CashRegisterAssignment } from "@/lib/services/CashRegisterService";

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
