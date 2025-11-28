import { MockRoleRepository } from "@/lib/repositories/MockRoleRepository";
import { MOCK_ROLE_PERMISSIONS, resolveMockPermissionsForRoles } from "@/lib/utils/auth";

const CXC_PERMISSIONS = [
  "menu.cxc.view",
  "customers.manage",
  "payment-terms.manage",
  "customer.documents.manage",
  "customer.documents.apply",
  "customer.credit.manage",
  "customer.collections.manage",
  "customer.disputes.manage",
];

describe("MOCK_ROLE_PERMISSIONS", () => {
  it("incluye los permisos de CxC para administradores", () => {
    expect(MOCK_ROLE_PERMISSIONS.ADMINISTRADOR).toEqual(expect.arrayContaining(CXC_PERMISSIONS));
  });

  it("no habilita el menú de CxC para facturadores por defecto", () => {
    expect(MOCK_ROLE_PERMISSIONS.FACTURADOR).not.toContain("menu.cxc.view");
  });
});

describe("resolveMockPermissionsForRoles", () => {
  it("propaga los permisos de CxC cuando el usuario es administrador", () => {
    const permissions = resolveMockPermissionsForRoles(["ADMINISTRADOR"]);
    expect(permissions).toEqual(expect.arrayContaining(CXC_PERMISSIONS));
  });
});

describe("MockRoleRepository", () => {
  it("expone los nuevos permisos en el catálogo y los roles base", async () => {
    const repository = new MockRoleRepository();
    const permissions = await repository.listPermissions();
    for (const code of CXC_PERMISSIONS) {
      expect(permissions.find((entry) => entry.code === code)).toBeDefined();
    }

    const roles = await repository.listRoles();
    const adminRole = roles.find((role) => role.code === "ADMINISTRADOR");
    expect(adminRole).toBeDefined();
    expect(adminRole?.permissions).toEqual(expect.arrayContaining(CXC_PERMISSIONS));
  });
});
