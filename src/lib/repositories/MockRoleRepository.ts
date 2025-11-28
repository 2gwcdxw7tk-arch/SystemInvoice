import { dedupePermissions, MOCK_ROLE_PERMISSIONS } from "@/lib/utils/auth";
import type { IRoleRepository } from "@/lib/repositories/IRoleRepository";
import type {
  PermissionDefinition,
  RoleSummary,
  CreateRoleParams,
  UpdateRoleParams,
} from "@/lib/types/roles";

type InternalRole = RoleSummary;

type Store = {
  roles: Map<number, InternalRole>;
  permissions: PermissionDefinition[];
  nextId: number;
};

const store: Store = {
  roles: new Map<number, InternalRole>(),
  permissions: [
    { code: "cash.register.open", name: "Apertura de caja", description: "Permite abrir sesiones de caja" },
    { code: "cash.register.close", name: "Cierre de caja", description: "Autoriza cerrar sesiones de caja" },
    { code: "invoice.issue", name: "Emisión de facturas", description: "Permite crear y cancelar facturas" },
    { code: "cash.report.view", name: "Reportes de caja", description: "Acceso a reportes y arqueos de caja" },
    { code: "admin.users.manage", name: "Gestión de usuarios", description: "Permite administrar usuarios y roles" },
    { code: "menu.dashboard.view", name: "Acceso a Dashboard", description: "Permite acceder al panel principal y KPIs" },
    { code: "menu.facturacion.view", name: "Acceso a Facturación", description: "Permite abrir la pantalla de facturación" },
    { code: "menu.caja.view", name: "Acceso a Caja", description: "Permite acceder al módulo de caja" },
    { code: "menu.articulos.view", name: "Acceso a Artículos", description: "Permite acceder al catálogo de artículos" },
    { code: "menu.inventario.view", name: "Acceso a Inventario", description: "Permite acceder al módulo de inventario" },
    { code: "menu.mesas.view", name: "Acceso a Mesas", description: "Permite acceder al mantenimiento de mesas" },
    { code: "menu.meseros.view", name: "Acceso a Meseros", description: "Permite administrar meseros" },
    { code: "menu.usuarios.view", name: "Acceso a Usuarios", description: "Permite administrar usuarios administrativos" },
    { code: "menu.roles.view", name: "Acceso a Roles", description: "Permite administrar roles y permisos" },
    { code: "menu.reportes.view", name: "Acceso a Reportes", description: "Permite acceder a reportes y descargas" },
    { code: "menu.preferencias.view", name: "Acceso a Preferencias", description: "Permite acceder a preferencias y configuraciones" },
    { code: "menu.cxc.view", name: "Acceso a Cuentas por Cobrar", description: "Permite consultar clientes y cartera" },
    { code: "customers.manage", name: "Gestión de clientes", description: "Permite crear y editar clientes" },
    { code: "payment-terms.manage", name: "Gestión de condiciones", description: "Permite administrar condiciones de pago" },
    { code: "customer.documents.manage", name: "Gestión de documentos CxC", description: "Permite registrar documentos de cartera" },
    { code: "customer.documents.apply", name: "Aplicación de documentos", description: "Permite aplicar pagos, recibos y retenciones" },
    { code: "customer.credit.manage", name: "Gestión de líneas de crédito", description: "Permite asignar y ajustar límites" },
    { code: "customer.collections.manage", name: "Gestión de cobranza", description: "Permite registrar seguimientos de cobranza" },
    { code: "customer.disputes.manage", name: "Gestión de disputas", description: "Permite documentar y atender disputas" },
  ],
  nextId: 1,
};

function ensureSeeded(): void {
  if (store.roles.size > 0) {
    return;
  }

  const now = new Date().toISOString();
  const baseRoles: Array<Omit<InternalRole, "id">> = [
    {
      code: "ADMINISTRADOR",
      name: "Administrador",
      description: "Acceso completo al panel administrativo",
      isActive: true,
      permissions: [...MOCK_ROLE_PERMISSIONS.ADMINISTRADOR],
      createdAt: now,
      updatedAt: now,
    },
    {
      code: "FACTURADOR",
      name: "Facturador",
      description: "Puede emitir facturas y operar caja",
      isActive: true,
      permissions: [...MOCK_ROLE_PERMISSIONS.FACTURADOR],
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const role of baseRoles) {
    const id = store.nextId++;
    store.roles.set(id, { id, ...role });
  }
}

function normalizePermissionCodes(values: string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  const normalized = dedupePermissions(values).map((value) => value.trim().toLowerCase());
  const allowed = new Set(store.permissions.map((permission) => permission.code.toLowerCase()));
  for (const code of normalized) {
    if (!allowed.has(code)) {
      throw new Error(`El permiso ${code} no existe en modo MOCK`);
    }
  }
  return normalized;
}

export class MockRoleRepository implements IRoleRepository {
  async listRoles(options: { includeInactive?: boolean } = {}): Promise<RoleSummary[]> {
    ensureSeeded();
    const includeInactive = options.includeInactive ?? false;
    return Array.from(store.roles.values())
      .filter((role) => includeInactive || role.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((role) => ({ ...role }));
  }

  async getRoleById(roleId: number): Promise<RoleSummary | null> {
    ensureSeeded();
    const role = store.roles.get(roleId);
    return role ? { ...role } : null;
  }

  async getRoleByCode(code: string): Promise<RoleSummary | null> {
    ensureSeeded();
    const upper = code.trim().toUpperCase();
    const role = Array.from(store.roles.values()).find((entry) => entry.code === upper);
    return role ? { ...role } : null;
  }

  async createRole(params: CreateRoleParams): Promise<RoleSummary> {
    ensureSeeded();
    const code = params.code.trim().toUpperCase();
    if (!code) {
      throw new Error("El código de rol es requerido");
    }
    if (Array.from(store.roles.values()).some((role) => role.code === code)) {
      throw new Error(`Ya existe un rol con el código ${code}`);
    }

    const name = params.name.trim();
    if (!name) {
      throw new Error("El nombre del rol es requerido");
    }

    const permissionCodes = normalizePermissionCodes(params.permissionCodes);
    const timestamp = new Date().toISOString();
    const id = store.nextId++;

    const role: InternalRole = {
      id,
      code,
      name,
      description: params.description ?? null,
      isActive: params.isActive ?? true,
      permissions: permissionCodes,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    store.roles.set(id, role);
    return { ...role };
  }

  async updateRole(roleId: number, params: UpdateRoleParams): Promise<RoleSummary> {
    ensureSeeded();
    const existing = store.roles.get(roleId);
    if (!existing) {
      throw new Error("Rol no encontrado");
    }

    const updated: InternalRole = {
      ...existing,
      name: params.name !== undefined ? params.name.trim() : existing.name,
      description: params.description !== undefined ? params.description ?? null : existing.description,
      isActive: params.isActive !== undefined ? !!params.isActive : existing.isActive,
      permissions: params.permissionCodes ? normalizePermissionCodes(params.permissionCodes) : existing.permissions,
      updatedAt: new Date().toISOString(),
    };

    if (!updated.name) {
      throw new Error("El nombre del rol es requerido");
    }

    store.roles.set(roleId, updated);
    return { ...updated };
  }

  async deleteRole(roleId: number): Promise<void> {
    ensureSeeded();
    if (!store.roles.delete(roleId)) {
      throw new Error("Rol no encontrado");
    }
  }

  async listPermissions(): Promise<PermissionDefinition[]> {
    ensureSeeded();
    return store.permissions.map((permission) => ({ ...permission }));
  }
}
