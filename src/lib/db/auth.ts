import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import sql from "mssql";

import { env } from "@/lib/env";
import { getPool } from "@/lib/db/mssql";

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

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

export function computePinSignature(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

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

type MockContext = {
  adminCredentials: { username: string; password: string };
  waiterCredentials: { code: string; pin: string };
  admins: Array<AdminUser & { passwordHash: string }>;
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

  const pool = await getPool();

  await pool
    .request()
    .input("loginType", sql.NVarChar(20), params.loginType)
    .input("identifier", sql.NVarChar(150), params.identifier)
    .input("success", sql.Bit, params.success ? 1 : 0)
    .input("ipAddress", sql.NVarChar(45), params.ipAddress ?? null)
    .input("userAgent", sql.NVarChar(300), params.userAgent?.slice(0, 300) ?? null)
    .input("notes", sql.NVarChar(300), params.notes?.slice(0, 300) ?? null)
    .query(`
      INSERT INTO app.login_audit (login_type, identifier, success, ip_address, user_agent, notes)
      VALUES (@loginType, @identifier, @success, @ipAddress, @userAgent, @notes)
    `);
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
  meta: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: boolean; user?: AdminUser; message: string }> {
  if (env.useMockData && mockContext) {
    const normalizedUsername = normalizeIdentifier(username);
    const record = mockContext.admins.find((admin) => admin.username === normalizedUsername);

    if (!record) {
      await upsertLoginAudit({
        loginType: "admin",
        identifier: normalizedUsername,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: "Usuario no encontrado (mock)",
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

    return {
      success: true,
      user: {
        id: record.id,
        username: record.username,
        displayName: record.displayName,
      },
      message: "Acceso concedido",
    };
  }

  const pool = await getPool();
  const normalizedUsername = normalizeIdentifier(username);

  const result = await pool
    .request()
    .input("username", sql.NVarChar(120), normalizedUsername)
    .query<{
      id: number;
      username: string;
      password_hash: string;
      display_name: string | null;
      is_active: boolean;
    }>(
      `SELECT TOP (1) id, username, password_hash, display_name, is_active
       FROM app.admin_users
       WHERE username = @username`
    );

  const record = result.recordset[0];

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
    pool
      .request()
      .input("id", sql.Int, record.id)
      .query("UPDATE app.admin_users SET last_login_at = SYSUTCDATETIME() WHERE id = @id"),
  ]);

  return {
    success: true,
    user: {
      id: record.id,
      username: record.username,
      displayName: record.display_name,
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

  const pool = await getPool();
  const signature = computePinSignature(pin);

  const result = await pool
    .request()
    .input("signature", sql.Char(64), signature)
    .query<{
      id: number;
      code: string;
      full_name: string;
      pin_hash: string;
      is_active: boolean;
    }>(
      `SELECT TOP (1) id, code, full_name, pin_hash, is_active
       FROM app.waiters
       WHERE pin_signature = @signature`
    );

  const record = result.recordset[0];

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
    pool
      .request()
      .input("id", sql.Int, record.id)
      .query("UPDATE app.waiters SET last_login_at = SYSUTCDATETIME() WHERE id = @id"),
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

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, waiterId)
    .query<{
      id: number;
      code: string;
      full_name: string;
      is_active: boolean;
    }>(
      `SELECT TOP (1) id, code, full_name, is_active
       FROM app.waiters
       WHERE id = @id`
    );

  const record = result.recordset[0];
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

  const pool = await getPool();
  const result = await pool
    .request()
    .input("includeInactive", sql.Bit, includeInactive ? 1 : 0)
    .query<DbWaiterRow>(
      `SELECT id, code, full_name, phone, email, is_active, last_login_at, created_at, updated_at
       FROM app.waiters
       WHERE @includeInactive = 1 OR is_active = 1`
    );

  return result.recordset.map((row) => mapDbWaiterRow(row));
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

  const pool = await getPool();
  const result = await pool
    .request()
    .input("code", sql.NVarChar(50), code)
    .input("fullName", sql.NVarChar(150), fullName)
    .input("pinHash", sql.NVarChar(100), pinHash)
    .input("pinSignature", sql.Char(64), pinSignature)
    .input("isActive", sql.Bit, isActive ? 1 : 0)
    .input("phone", sql.NVarChar(30), phone)
    .input("email", sql.NVarChar(150), email)
    .query<DbWaiterRow>(
      `INSERT INTO app.waiters (code, full_name, pin_hash, pin_signature, is_active, phone, email)
       OUTPUT inserted.id, inserted.code, inserted.full_name, inserted.phone, inserted.email, inserted.is_active, inserted.last_login_at, inserted.created_at, inserted.updated_at
       VALUES (@code, @fullName, @pinHash, @pinSignature, @isActive, @phone, @email)`
    );

  const row = result.recordset[0];
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

  const setClauses: string[] = [];
  const pool = await getPool();
  const request = pool.request().input("id", sql.Int, waiterId);

  if (typeof updates.code !== "undefined") {
    request.input("code", sql.NVarChar(50), updates.code);
    setClauses.push("code = @code");
  }
  if (typeof updates.fullName !== "undefined") {
    request.input("fullName", sql.NVarChar(150), updates.fullName);
    setClauses.push("full_name = @fullName");
  }
  if (typeof updates.phone !== "undefined") {
    request.input("phone", sql.NVarChar(30), updates.phone ?? null);
    setClauses.push("phone = @phone");
  }
  if (typeof updates.email !== "undefined") {
    request.input("email", sql.NVarChar(150), updates.email ?? null);
    setClauses.push("email = @email");
  }
  if (typeof updates.isActive !== "undefined") {
    request.input("isActive", sql.Bit, updates.isActive ? 1 : 0);
    setClauses.push("is_active = @isActive");
  }

  if (!setClauses.length) {
    throw new Error("No hay cambios para aplicar");
  }

  const result = await request.query<DbWaiterRow>(
    `UPDATE app.waiters
     SET ${setClauses.join(", ")}
     OUTPUT inserted.id, inserted.code, inserted.full_name, inserted.phone, inserted.email, inserted.is_active, inserted.last_login_at, inserted.created_at, inserted.updated_at
     WHERE id = @id`
  );

  const row = result.recordset[0];
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

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, waiterId)
    .input("pinHash", sql.NVarChar(100), pinHash)
    .input("pinSignature", sql.Char(64), pinSignature)
    .query<DbWaiterRow>(
      `UPDATE app.waiters
       SET pin_hash = @pinHash,
           pin_signature = @pinSignature
       OUTPUT inserted.id, inserted.code, inserted.full_name, inserted.phone, inserted.email, inserted.is_active, inserted.last_login_at, inserted.created_at, inserted.updated_at
       WHERE id = @id`
    );

  const row = result.recordset[0];
  if (!row) {
    throw new Error("Mesero no encontrado");
  }
  return mapDbWaiterRow(row);
}