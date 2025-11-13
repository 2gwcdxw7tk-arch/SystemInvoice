import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import { env } from "@/lib/env";
import { query, withTransaction } from "@/lib/db/postgres";
import type { PoolClient } from "@/lib/db/postgres";
import type { CashRegisterAssignment } from "@/lib/db/cash-registers";
import { listCashRegistersForAdmin } from "@/lib/db/cash-registers";

export type AdminUser = {
  id: number;
  username: string;
  displayName: string | null;
};

export type WaiterUser = {
  id: number;
  code: string;
  fullName: string;
};

export type WaiterDirectoryEntry = WaiterUser & {
  phone: string | null;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
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
};

export type RoleDefinition = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

export function computePinSignature(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

export type AdminSessionContext = {
  roles: string[];
  permissions: string[];
  cashRegisters: CashRegisterAssignment[];
  defaultCashRegister: CashRegisterAssignment | null;
};

type MockAuditEntry = {
  loginType: "admin" | "waiter";
  identifier: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
  timestamp: string;
};

type MockWaiterRecord = WaiterUser & {
  pinHash: string;
  pinSignature: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

type MockAdminRecord = AdminUser & {
  passwordHash: string;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

const MOCK_ROLE_PERMISSIONS: Record<string, string[]> = {
  FACTURADOR: ["cash.register.open", "cash.register.close", "invoice.issue", "cash.report.view"],
  ADMINISTRADOR: [
    "cash.register.open",
    "cash.register.close",
    "invoice.issue",
    "cash.report.view",
    "admin.users.manage",
  ],
};

const MOCK_ROLES: RoleDefinition[] = [
  {
    id: 1,
    code: "FACTURADOR",
    name: "Facturador POS",
    description: "Puede aperturar y cerrar caja además de emitir facturas en punto de venta",
    isActive: true,
  },
  {
    id: 2,
    code: "ADMINISTRADOR",
    name: "Administrador General",
    description: "Acceso completo al mantenimiento y operaciones",
    isActive: true,
  },
];

type MockContext = {
  adminCredentials: { username: string; password: string };
  waiterCredentials: { code: string; pin: string };
  admins: MockAdminRecord[];
  waiters: MockWaiterRecord[];
  auditLog: MockAuditEntry[];
};

const mockContext: MockContext | null = env.useMockData
  ? (() => {
      const adminCredentials = {
        username: "admin@facturador.demo",
        password: "Admin123!",
      } as const;
      const waiterCredentials = {
        code: "MESERO-001",
        pin: "4321",
      } as const;
      const now = new Date().toISOString();

      return {
        adminCredentials,
        waiterCredentials,
        admins: [
          {
            id: 1,
            username: normalizeIdentifier(adminCredentials.username),
            displayName: "Administradora Demo",
            passwordHash: bcrypt.hashSync(adminCredentials.password, 10),
            roles: ["ADMINISTRADOR"],
            permissions: MOCK_ROLE_PERMISSIONS.ADMINISTRADOR.slice(),
            isActive: true,
            createdAt: now,
            updatedAt: now,
            lastLoginAt: null,
          },
        ],
        waiters: [
          {
            id: 101,
            code: waiterCredentials.code,
            fullName: "Mesero Demo",
            pinHash: bcrypt.hashSync(waiterCredentials.pin, 10),
            pinSignature: computePinSignature(waiterCredentials.pin),
            phone: "+505 5555 0101",
            email: "mesero.demo@facturador.test",
            isActive: true,
            createdAt: now,
            updatedAt: now,
            lastLoginAt: null,
          },
        ],
        auditLog: [],
      } satisfies MockContext;
    })()
  : null;

type DbWaiterRow = {
  id: number;
  code: string;
  full_name: string;
  pin_signature: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
};

type DbAdminDirectoryRow = {
  id: number;
  username: string;
  display_name: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
  roles: string[] | null;
};

type DbRoleRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

function cloneDirectoryEntry(record: MockWaiterRecord): WaiterDirectoryEntry {
  return {
    id: record.id,
    code: record.code,
    fullName: record.fullName,
    phone: record.phone,
    email: record.email,
    isActive: record.isActive,
    lastLoginAt: record.lastLoginAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapDbWaiterRow(row: DbWaiterRow): WaiterDirectoryEntry {
  const toIso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
  return {
    id: Number(row.id),
    code: row.code,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    isActive: !!row.is_active,
    lastLoginAt: toIso(row.last_login_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at),
  };
}

function cloneAdminDirectoryEntry(record: MockAdminRecord): AdminDirectoryEntry {
  return {
    id: record.id,
    username: record.username,
    displayName: record.displayName ?? null,
    isActive: record.isActive,
    lastLoginAt: record.lastLoginAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    roles: record.roles.map((role) => role.toUpperCase()),
  };
}

function mapDbAdminDirectoryRow(row: DbAdminDirectoryRow): AdminDirectoryEntry {
  const toIso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name,
    isActive: !!row.is_active,
    lastLoginAt: toIso(row.last_login_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at),
    roles: Array.isArray(row.roles) ? row.roles.map((role) => role.toUpperCase()).filter(Boolean) : [],
  };
}

function resolveMockPermissionsForRoles(roles: string[]): string[] {
  const accumulator: string[] = [];
  for (const role of roles) {
    const codes = MOCK_ROLE_PERMISSIONS[role.toUpperCase()] ?? [];
    for (const permission of codes) {
      if (!accumulator.includes(permission)) {
        accumulator.push(permission);
      }
    }
  }
  return accumulator;
}

async function fetchAdminDirectoryEntry(adminUserId: number, client?: PoolClient): Promise<AdminDirectoryEntry | null> {
  const executor = client ? client.query.bind(client) : query;
  const result = await executor<DbAdminDirectoryRow>(
    `SELECT au.id,
            au.username,
            au.display_name,
            au.is_active,
            au.last_login_at,
            au.created_at,
            au.updated_at,
            COALESCE(array_agg(DISTINCT UPPER(r.code)) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM app.admin_users au
       LEFT JOIN app.admin_user_roles aur ON aur.admin_user_id = au.id
       LEFT JOIN app.roles r ON r.id = aur.role_id
      WHERE au.id = $1
      GROUP BY au.id`,
    [adminUserId]
  );

  const row = result.rows[0];
  return row ? mapDbAdminDirectoryRow(row) : null;
}

function normalizeWaiterCode(code: string): string {
  return code.trim().toUpperCase();
}

function sanitizeNullable(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

export function getMockCredentials() {
  if (!mockContext) {
    return null;
  }

  return {
    admin: mockContext.adminCredentials,
    waiter: mockContext.waiterCredentials,
  } as const;
}

async function upsertLoginAudit(params: {
  loginType: "admin" | "waiter";
  identifier: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
}): Promise<void> {
  if (env.useMockData && mockContext) {
    mockContext.auditLog.push({
      ...params,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  await query(
    `INSERT INTO app.login_audit (login_type, identifier, success, ip_address, user_agent, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.loginType,
      params.identifier,
      params.success,
      params.ipAddress ?? null,
      params.userAgent?.slice(0, 300) ?? null,
      params.notes?.slice(0, 300) ?? null,
    ]
  );
}

export type VerifyAdminCredentialsResult = {
  success: boolean;
  user?: AdminUser;
  message: string;
  context?: AdminSessionContext;
};

function dedupeUpper(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const code = value.trim().toUpperCase();
    if (!code) continue;
    if (!seen.has(code)) {
      seen.add(code);
      normalized.push(code);
    }
  }
  return normalized;
}

function dedupePermissions(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const code = value.trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(code);
    }
  }
  return normalized;
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
  meta: { ipAddress?: string | null; userAgent?: string | null }
): Promise<VerifyAdminCredentialsResult> {
  if (env.useMockData && mockContext) {
    const normalizedUsername = normalizeIdentifier(username);
    const record = mockContext.admins.find((admin) => admin.username === normalizedUsername);

    if (!record || !record.isActive) {
      await upsertLoginAudit({
        loginType: "admin",
        identifier: normalizedUsername,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: record && !record.isActive ? "Usuario inactivo (mock)" : "Usuario no encontrado (mock)",
      });
      return { success: false, message: "Credenciales no válidas" };
    }

    const passwordMatches = await bcrypt.compare(password, record.passwordHash);

    await upsertLoginAudit({
      loginType: "admin",
      identifier: normalizedUsername,
      success: passwordMatches,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      notes: passwordMatches ? undefined : "Contraseña incorrecta (mock)",
    });

    if (!passwordMatches) {
      return { success: false, message: "Credenciales no válidas" };
    }

    const nowStamp = new Date().toISOString();
    record.lastLoginAt = nowStamp;
    record.updatedAt = nowStamp;

    const cashRegisters = await listCashRegistersForAdmin(record.id);
    const defaultCashRegister = cashRegisters.find((register) => register.isDefault) ?? cashRegisters[0] ?? null;
    const roles = dedupeUpper(record.roles ?? []);
    const permissions = dedupePermissions(record.permissions ?? []);

    return {
      success: true,
      user: {
        id: record.id,
        username: record.username,
        displayName: record.displayName,
      },
      context: {
        roles,
        permissions,
        cashRegisters,
        defaultCashRegister,
      },
      message: "Acceso concedido",
    };
  }

  const normalizedUsername = normalizeIdentifier(username);
  const result = await query<{
    id: number;
    username: string;
    password_hash: string;
    display_name: string | null;
    is_active: boolean;
  }>(
    `SELECT id, username, password_hash, display_name, is_active
     FROM app.admin_users
     WHERE username = $1
     LIMIT 1`,
    [normalizedUsername]
  );

  const record = result.rows[0];

  if (!record || !record.is_active) {
    await upsertLoginAudit({
      loginType: "admin",
      identifier: normalizedUsername,
      success: false,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      notes: "Usuario no encontrado o inactivo",
    });
    return { success: false, message: "Credenciales no válidas" };
  }

  const passwordMatches = await bcrypt.compare(password, record.password_hash);

  if (!passwordMatches) {
    await upsertLoginAudit({
      loginType: "admin",
      identifier: normalizedUsername,
      success: false,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      notes: "Contraseña incorrecta",
    });
    return { success: false, message: "Credenciales no válidas" };
  }

  await Promise.all([
    upsertLoginAudit({
      loginType: "admin",
      identifier: normalizedUsername,
      success: true,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
    query("UPDATE app.admin_users SET last_login_at = NOW() WHERE id = $1", [record.id]),
  ]);

  const cashRegisters = await listCashRegistersForAdmin(record.id);
  const defaultCashRegister = cashRegisters.find((register) => register.isDefault) ?? cashRegisters[0] ?? null;

  const [rolesResult, permissionsResult] = await Promise.all([
    query<{ code: string }>(
      `SELECT DISTINCT UPPER(r.code) AS code
         FROM app.admin_user_roles aur
         INNER JOIN app.roles r ON r.id = aur.role_id AND r.is_active = TRUE
         WHERE aur.admin_user_id = $1`,
      [record.id]
    ),
    query<{ permission_code: string }>(
      `SELECT DISTINCT rp.permission_code
         FROM app.role_permissions rp
         INNER JOIN app.admin_user_roles aur ON aur.role_id = rp.role_id
         INNER JOIN app.roles r ON r.id = aur.role_id AND r.is_active = TRUE
         WHERE aur.admin_user_id = $1`,
      [record.id]
    ),
  ]);

  const roles = dedupeUpper(rolesResult.rows.map((row) => row.code));
  const permissions = dedupePermissions(permissionsResult.rows.map((row) => row.permission_code));

  return {
    success: true,
    user: {
      id: record.id,
      username: record.username,
      displayName: record.display_name,
    },
    context: {
      roles,
      permissions,
      cashRegisters,
      defaultCashRegister,
    },
    message: "Acceso concedido",
  };
}

export async function verifyWaiterPin(
  pin: string,
  meta: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: boolean; waiter?: WaiterUser; message: string }> {
  if (env.useMockData && mockContext) {
    const signature = computePinSignature(pin);
    const record = mockContext.waiters.find((waiter) => waiter.pinSignature === signature);

    if (!record || !record.isActive) {
      await upsertLoginAudit({
        loginType: "waiter",
        identifier: signature,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: "PIN no encontrado o inactivo (mock)",
      });
      return { success: false, message: "PIN no válido" };
    }

    const pinMatches = await bcrypt.compare(pin, record.pinHash);

    await upsertLoginAudit({
      loginType: "waiter",
      identifier: record.code,
      success: pinMatches,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      notes: pinMatches ? undefined : "PIN incorrecto (mock)",
    });

    if (!pinMatches) {
      return { success: false, message: "PIN no válido" };
    }

    record.lastLoginAt = new Date().toISOString();
    record.updatedAt = record.lastLoginAt;

    return {
      success: true,
      waiter: {
        id: record.id,
        code: record.code,
        fullName: record.fullName,
      },
      message: "Acceso concedido",
    };
  }

  const signature = computePinSignature(pin);
  const result = await query<{
    id: number;
    code: string;
    full_name: string;
    pin_hash: string;
    is_active: boolean;
  }>(
    `SELECT id, code, full_name, pin_hash, is_active
     FROM app.waiters
     WHERE pin_signature = $1
     LIMIT 1`,
    [signature]
  );

  const record = result.rows[0];

  if (!record || !record.is_active) {
    await upsertLoginAudit({
      loginType: "waiter",
      identifier: signature,
      success: false,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      notes: "PIN no encontrado o inactivo",
    });
    return { success: false, message: "PIN no válido" };
  }

  const pinMatches = await bcrypt.compare(pin, record.pin_hash);

  if (!pinMatches) {
    await upsertLoginAudit({
      loginType: "waiter",
      identifier: signature,
      success: false,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      notes: "PIN incorrecto",
    });
    return { success: false, message: "PIN no válido" };
  }

  await Promise.all([
    upsertLoginAudit({
      loginType: "waiter",
      identifier: record.code,
      success: true,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
    query("UPDATE app.waiters SET last_login_at = NOW() WHERE id = $1", [record.id]),
  ]);

  return {
    success: true,
    waiter: {
      id: record.id,
      code: record.code,
      fullName: record.full_name,
    },
    message: "Acceso concedido",
  };
}

export async function getWaiterById(waiterId: number): Promise<WaiterUser | null> {
  if (env.useMockData && mockContext) {
    const record = mockContext.waiters.find((waiter) => waiter.id === waiterId);
    if (!record || !record.isActive) {
      return null;
    }
    return {
      id: record.id,
      code: record.code,
      fullName: record.fullName,
    };
  }

  const result = await query<{
    id: number;
    code: string;
    full_name: string;
    is_active: boolean;
  }>(
    `SELECT id, code, full_name, is_active
     FROM app.waiters
     WHERE id = $1
     LIMIT 1`,
    [waiterId]
  );

  const record = result.rows[0];
  if (!record || !record.is_active) {
    return null;
  }
  return {
    id: record.id,
    code: record.code,
    fullName: record.full_name,
  };
}

export async function listWaiterDirectory(options: { includeInactive?: boolean } = {}): Promise<WaiterDirectoryEntry[]> {
  const includeInactive = options.includeInactive ?? false;

  if (env.useMockData && mockContext) {
    return mockContext.waiters
      .filter((waiter) => includeInactive || waiter.isActive)
      .map((waiter) => cloneDirectoryEntry(waiter));
  }

  const result = await query<DbWaiterRow>(
    `SELECT id, code, full_name, phone, email, is_active, last_login_at, created_at, updated_at
     FROM app.waiters
     WHERE $1::boolean IS TRUE OR is_active = TRUE`,
    [includeInactive]
  );

  return result.rows.map((row) => mapDbWaiterRow(row));
}

type CreateWaiterParams = {
  code: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  pin: string;
  isActive?: boolean;
};

function sanitizeContact(value: string | null | undefined, limit: number): string | null {
  const sanitized = sanitizeNullable(value);
  if (!sanitized) return null;
  return sanitized.slice(0, limit);
}

export async function createWaiterDirectoryEntry(params: CreateWaiterParams): Promise<WaiterDirectoryEntry> {
  const code = normalizeWaiterCode(params.code);
  const fullName = params.fullName.trim();
  const phone = sanitizeContact(params.phone, 30);
  const email = sanitizeContact(params.email, 150);
  const isActive = params.isActive ?? true;
  const pinHash = await bcrypt.hash(params.pin, 10);
  const pinSignature = computePinSignature(params.pin);

  if (env.useMockData && mockContext) {
    if (mockContext.waiters.some((waiter) => waiter.code === code)) {
      throw new Error("El código de mesero ya existe");
    }
    const now = new Date().toISOString();
    const newId = mockContext.waiters.reduce((max, waiter) => Math.max(max, waiter.id), 0) + 1;
    const record: MockWaiterRecord = {
      id: newId,
      code,
      fullName,
      pinHash,
      pinSignature,
      phone,
      email,
      isActive,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };
    mockContext.waiters.push(record);
    return cloneDirectoryEntry(record);
  }

  const result = await query<DbWaiterRow>(
    `INSERT INTO app.waiters (code, full_name, pin_hash, pin_signature, is_active, phone, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, code, full_name, phone, email, is_active, last_login_at, created_at, updated_at`,
    [code, fullName, pinHash, pinSignature, isActive, phone, email]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("No se pudo registrar el mesero");
  }
  return mapDbWaiterRow(row);
}

type UpdateWaiterParams = {
  code?: string;
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
};

export async function updateWaiterDirectoryEntry(waiterId: number, params: UpdateWaiterParams): Promise<WaiterDirectoryEntry> {
  const updates: Partial<MockWaiterRecord> = {};

  if (typeof params.code !== "undefined") {
    updates.code = normalizeWaiterCode(params.code);
  }
  if (typeof params.fullName !== "undefined") {
    updates.fullName = params.fullName.trim();
  }
  if (typeof params.phone !== "undefined") {
    updates.phone = sanitizeContact(params.phone, 30);
  }
  if (typeof params.email !== "undefined") {
    updates.email = sanitizeContact(params.email, 150);
  }
  if (typeof params.isActive !== "undefined") {
    updates.isActive = params.isActive;
  }

  const hasUpdates = Object.keys(updates).length > 0;
  if (!hasUpdates) {
    throw new Error("No hay cambios para aplicar");
  }

  if (env.useMockData && mockContext) {
    const record = mockContext.waiters.find((waiter) => waiter.id === waiterId);
    if (!record) {
      throw new Error("Mesero no encontrado");
    }
    if (typeof updates.code !== "undefined") {
      if (mockContext.waiters.some((waiter) => waiter.id !== waiterId && waiter.code === updates.code)) {
        throw new Error("El código de mesero ya existe");
      }
      record.code = updates.code;
    }
    if (typeof updates.fullName !== "undefined") {
      record.fullName = updates.fullName;
    }
    if (typeof updates.phone !== "undefined") {
      record.phone = updates.phone ?? null;
    }
    if (typeof updates.email !== "undefined") {
      record.email = updates.email ?? null;
    }
    if (typeof updates.isActive !== "undefined") {
      record.isActive = !!updates.isActive;
    }
    record.updatedAt = new Date().toISOString();
    return cloneDirectoryEntry(record);
  }

  const values: unknown[] = [waiterId];
  const setFragments: string[] = [];
  let index = 2;

  if (typeof updates.code !== "undefined") {
    setFragments.push(`code = $${index}`);
    values.push(updates.code);
    index += 1;
  }
  if (typeof updates.fullName !== "undefined") {
    setFragments.push(`full_name = $${index}`);
    values.push(updates.fullName);
    index += 1;
  }
  if (typeof updates.phone !== "undefined") {
    setFragments.push(`phone = $${index}`);
    values.push(updates.phone ?? null);
    index += 1;
  }
  if (typeof updates.email !== "undefined") {
    setFragments.push(`email = $${index}`);
    values.push(updates.email ?? null);
    index += 1;
  }
  if (typeof updates.isActive !== "undefined") {
    setFragments.push(`is_active = $${index}`);
    values.push(!!updates.isActive);
    index += 1;
  }

  if (!setFragments.length) {
    throw new Error("No hay cambios para aplicar");
  }

  const result = await query<DbWaiterRow>(
    `UPDATE app.waiters
     SET ${setFragments.join(", ")}
     WHERE id = $1
     RETURNING id, code, full_name, phone, email, is_active, last_login_at, created_at, updated_at`,
    values
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Mesero no encontrado");
  }
  return mapDbWaiterRow(row);
}

export async function resetWaiterPin(waiterId: number, newPin: string): Promise<WaiterDirectoryEntry> {
  const pinHash = await bcrypt.hash(newPin, 10);
  const pinSignature = computePinSignature(newPin);

  if (env.useMockData && mockContext) {
    const record = mockContext.waiters.find((waiter) => waiter.id === waiterId);
    if (!record) {
      throw new Error("Mesero no encontrado");
    }
    record.pinHash = pinHash;
    record.pinSignature = pinSignature;
    record.updatedAt = new Date().toISOString();
    return cloneDirectoryEntry(record);
  }

  const result = await query<DbWaiterRow>(
    `UPDATE app.waiters
     SET pin_hash = $1,
         pin_signature = $2
     WHERE id = $3
     RETURNING id, code, full_name, phone, email, is_active, last_login_at, created_at, updated_at`,
    [pinHash, pinSignature, waiterId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Mesero no encontrado");
  }
  return mapDbWaiterRow(row);
}

export async function listAdminDirectory(options: { includeInactive?: boolean } = {}): Promise<AdminDirectoryEntry[]> {
  const includeInactive = options.includeInactive ?? false;

  if (env.useMockData && mockContext) {
    return mockContext.admins
      .filter((admin) => includeInactive || admin.isActive)
      .map((admin) => cloneAdminDirectoryEntry(admin))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  const result = await query<DbAdminDirectoryRow>(
    `SELECT au.id,
            au.username,
            au.display_name,
            au.is_active,
            au.last_login_at,
            au.created_at,
            au.updated_at,
            COALESCE(array_agg(DISTINCT UPPER(r.code)) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM app.admin_users au
       LEFT JOIN app.admin_user_roles aur ON aur.admin_user_id = au.id
       LEFT JOIN app.roles r ON r.id = aur.role_id
      WHERE $1::boolean IS TRUE OR au.is_active = TRUE
      GROUP BY au.id
      ORDER BY LOWER(au.username) ASC`,
    [includeInactive]
  );

  return result.rows.map((row) => mapDbAdminDirectoryRow(row));
}

export async function listAdminRoleDefinitions(options: { includeInactive?: boolean } = {}): Promise<RoleDefinition[]> {
  const includeInactive = options.includeInactive ?? false;

  if (env.useMockData && mockContext) {
    return MOCK_ROLES.filter((role) => includeInactive || role.isActive).map((role) => ({ ...role }));
  }

  const result = await query<DbRoleRow>(
    `SELECT id, code, name, description, is_active
       FROM app.roles
      WHERE $1::boolean IS TRUE OR is_active = TRUE
      ORDER BY name ASC`,
    [includeInactive]
  );

  return result.rows.map((row) => mapDbRoleRow(row));
}

type CreateAdminParams = {
  username: string;
  displayName?: string | null;
  password: string;
  isActive?: boolean;
  roleCodes?: string[];
};

export async function createAdminDirectoryEntry(params: CreateAdminParams): Promise<AdminDirectoryEntry> {
  const username = normalizeIdentifier(params.username);
  const displayName = sanitizeNullable(params.displayName);
  const passwordHash = await bcrypt.hash(params.password, 10);
  const isActive = params.isActive ?? true;
  const roleCodes = dedupeUpper(params.roleCodes ?? []);

  if (env.useMockData && mockContext) {
    if (mockContext.admins.some((admin) => admin.username === username)) {
      throw new Error("El usuario ya existe");
    }
    const nowIso = new Date().toISOString();
    const newId = mockContext.admins.reduce((max, admin) => Math.max(max, admin.id), 0) + 1;
    const permissions = resolveMockPermissionsForRoles(roleCodes);
    const record: MockAdminRecord = {
      id: newId,
      username,
      displayName: displayName ?? null,
      passwordHash,
      roles: roleCodes,
      permissions,
      isActive,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastLoginAt: null,
    };
    mockContext.admins.push(record);
    return cloneAdminDirectoryEntry(record);
  }

  return withTransaction(async (client) => {
    const insertResult = await client.query<DbAdminDirectoryRow>(
      `INSERT INTO app.admin_users (username, password_hash, display_name, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, is_active, last_login_at, created_at, updated_at, '{}'::text[] AS roles`,
      [username, passwordHash, displayName, isActive]
    );

    const inserted = insertResult.rows[0];
    if (!inserted) {
      throw new Error("No se pudo registrar al usuario");
    }

    if (roleCodes.length > 0) {
      const rolesResult = await client.query<{ id: number; code: string }>(
        `SELECT id, UPPER(code) AS code
           FROM app.roles
          WHERE UPPER(code) = ANY($1::text[]) AND is_active = TRUE`,
        [roleCodes]
      );

      const foundCodes = rolesResult.rows.map((row) => row.code);
      const missing = roleCodes.filter((code) => !foundCodes.includes(code));
      if (missing.length > 0) {
        throw new Error(`Los roles ${missing.join(", ")} no están disponibles`);
      }

      await client.query(`DELETE FROM app.admin_user_roles WHERE admin_user_id = $1`, [inserted.id]);

      const roleMap = new Map(rolesResult.rows.map((row) => [row.code, row] as const));
      for (let index = 0; index < roleCodes.length; index += 1) {
        const code = roleCodes[index];
        const roleRow = roleMap.get(code);
        if (!roleRow) continue;
        await client.query(
          `INSERT INTO app.admin_user_roles (admin_user_id, role_id, is_primary)
           VALUES ($1, $2, $3)`,
          [inserted.id, roleRow.id, index === 0]
        );
      }
    }

    const entry = await fetchAdminDirectoryEntry(Number(inserted.id), client);
    if (!entry) {
      throw new Error("No se pudo cargar el usuario creado");
    }
    return entry;
  });
}

type UpdateAdminParams = {
  displayName?: string | null;
  isActive?: boolean;
  roleCodes?: string[];
};

export async function updateAdminDirectoryEntry(adminUserId: number, params: UpdateAdminParams): Promise<AdminDirectoryEntry> {
  const roleCodes = typeof params.roleCodes === "undefined" ? undefined : dedupeUpper(params.roleCodes ?? []);
  const displayName = params.displayName === undefined ? undefined : sanitizeNullable(params.displayName);
  const isActive = params.isActive;

  if (env.useMockData && mockContext) {
    const record = mockContext.admins.find((admin) => admin.id === adminUserId);
    if (!record) {
      throw new Error("Usuario no encontrado");
    }
    if (typeof displayName !== "undefined") {
      record.displayName = displayName ?? null;
    }
    if (typeof isActive !== "undefined") {
      record.isActive = !!isActive;
    }
    if (typeof roleCodes !== "undefined") {
      record.roles = roleCodes;
      record.permissions = resolveMockPermissionsForRoles(roleCodes);
    }
    record.updatedAt = new Date().toISOString();
    return cloneAdminDirectoryEntry(record);
  }

  return withTransaction(async (client) => {
    const updates: string[] = [];
    const values: unknown[] = [adminUserId];
    let index = 2;

    if (typeof displayName !== "undefined") {
      updates.push(`display_name = $${index}`);
      values.push(displayName);
      index += 1;
    }
    if (typeof isActive !== "undefined") {
      updates.push(`is_active = $${index}`);
      values.push(!!isActive);
      index += 1;
    }

    if (updates.length > 0) {
      await client.query(
        `UPDATE app.admin_users
            SET ${updates.join(", ")}
          WHERE id = $1`,
        values
      );
    }

    if (typeof roleCodes !== "undefined") {
      await client.query(`DELETE FROM app.admin_user_roles WHERE admin_user_id = $1`, [adminUserId]);
      if (roleCodes.length > 0) {
        const rolesResult = await client.query<{ id: number; code: string }>(
          `SELECT id, UPPER(code) AS code
             FROM app.roles
            WHERE UPPER(code) = ANY($1::text[]) AND is_active = TRUE`,
          [roleCodes]
        );
        const foundCodes = rolesResult.rows.map((row) => row.code);
        const missing = roleCodes.filter((code) => !foundCodes.includes(code));
        if (missing.length > 0) {
          throw new Error(`Los roles ${missing.join(", ")} no están disponibles`);
        }
        const roleMap = new Map(rolesResult.rows.map((row) => [row.code, row] as const));
        for (let idx = 0; idx < roleCodes.length; idx += 1) {
          const code = roleCodes[idx];
          const roleRow = roleMap.get(code);
          if (!roleRow) continue;
          await client.query(
            `INSERT INTO app.admin_user_roles (admin_user_id, role_id, is_primary)
             VALUES ($1, $2, $3)`,
            [adminUserId, roleRow.id, idx === 0]
          );
        }
      }
    }

    const entry = await fetchAdminDirectoryEntry(adminUserId, client);
    if (!entry) {
      throw new Error("Usuario no encontrado");
    }
    return entry;
  });
}

export async function resetAdminUserPassword(adminUserId: number, newPassword: string): Promise<AdminDirectoryEntry> {
  const passwordHash = await bcrypt.hash(newPassword, 10);

  if (env.useMockData && mockContext) {
    const record = mockContext.admins.find((admin) => admin.id === adminUserId);
    if (!record) {
      throw new Error("Usuario no encontrado");
    }
    record.passwordHash = passwordHash;
    record.updatedAt = new Date().toISOString();
    return cloneAdminDirectoryEntry(record);
  }

  await query(`UPDATE app.admin_users SET password_hash = $1 WHERE id = $2`, [passwordHash, adminUserId]);
  const entry = await fetchAdminDirectoryEntry(adminUserId);
  if (!entry) {
    throw new Error("Usuario no encontrado");
  }
  return entry;
}

export async function getAdminDirectoryEntry(adminUserId: number): Promise<AdminDirectoryEntry | null> {
  if (env.useMockData && mockContext) {
    const record = mockContext.admins.find((admin) => admin.id === adminUserId);
    return record ? cloneAdminDirectoryEntry(record) : null;
  }
  return fetchAdminDirectoryEntry(adminUserId);
}

function mapDbRoleRow(row: DbRoleRow): RoleDefinition {
  return {
    id: Number(row.id),
    code: row.code.toUpperCase(),
    name: row.name,
    description: row.description,
    isActive: !!row.is_active,
  };
}