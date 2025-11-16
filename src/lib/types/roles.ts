export type PermissionDefinition = {
  code: string;
  name: string;
  description: string | null;
};

export type RoleSummary = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string | null;
};

export type CreateRoleParams = {
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  permissionCodes?: string[];
};

export type UpdateRoleParams = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  permissionCodes?: string[];
};
