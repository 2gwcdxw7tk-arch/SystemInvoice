import { env } from "@/lib/env";
import { IAdminUserRepository } from "./IAdminUserRepository";
import { AdminUserRepository } from "./AdminUserRepository";
import { MockAdminUserRepository } from "./MockAdminUserRepository";
import { IRoleRepository } from "./IRoleRepository";
import { RoleRepository } from "./RoleRepository";
import { MockRoleRepository } from "./MockRoleRepository";

export class RepositoryFactory {
  static getAdminUserRepository(): IAdminUserRepository {
    if (env.useMockData) {
      return new MockAdminUserRepository();
    }
    return new AdminUserRepository();
  }

  static getRoleRepository(): IRoleRepository {
    if (env.useMockData) {
      return new MockRoleRepository();
    }
    return new RoleRepository();
  }
}
