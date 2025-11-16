import bcrypt from "bcryptjs";

import { env } from "@/lib/env";
import type {
  IWaiterRepository,
  WaiterUser,
  WaiterDirectoryEntry,
  VerifyWaiterPinResult,
  VerifyWaiterPinMeta,
  CreateWaiterParams,
  UpdateWaiterParams,
} from "@/lib/repositories/IWaiterRepository";
import { WaiterRepository } from "@/lib/repositories/WaiterRepository";
import { computePinSignature, sanitizeNullable } from "@/lib/utils/auth";

const MOCK_WAITER_CREDENTIALS = {
  code: "MESERO-001",
  pin: "4321",
} as const;

type MockAuditEntry = {
  loginType: "waiter";
  identifier: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
  timestamp: string;
};

type MockWaiterRecord = WaiterDirectoryEntry & {
  pinHash: string;
  pinSignature: string;
};

type MockContext = {
  waiters: MockWaiterRecord[];
  auditLog: MockAuditEntry[];
};

function createMockContext(): MockContext {
  const now = new Date().toISOString();
  const pinHash = bcrypt.hashSync(MOCK_WAITER_CREDENTIALS.pin, 10);
  return {
    waiters: [
      {
        id: 101,
        code: MOCK_WAITER_CREDENTIALS.code,
        fullName: "Mesero Demo",
        pinHash,
        pinSignature: computePinSignature(MOCK_WAITER_CREDENTIALS.pin),
        phone: "+505 5555 0101",
        email: "mesero.demo@facturador.test",
        isActive: true,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    auditLog: [],
  } satisfies MockContext;
}

const mockContext: MockContext | null = env.useMockData ? createMockContext() : null;

function normalizeWaiterCode(code: string): string {
  return code.trim().toUpperCase();
}

function sanitizeContact(value: string | null | undefined, limit: number): string | null {
  const sanitized = sanitizeNullable(value);
  if (!sanitized) {
    return null;
  }
  return sanitized.slice(0, limit);
}

function cloneWaiter(record: MockWaiterRecord): WaiterDirectoryEntry {
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

async function recordMockAudit(entry: Omit<MockAuditEntry, "timestamp">): Promise<void> {
  if (!mockContext) {
    return;
  }
  mockContext.auditLog.push({ ...entry, timestamp: new Date().toISOString() });
}

export class WaiterService {
  constructor(private readonly repository: IWaiterRepository = new WaiterRepository()) {}

  async verifyWaiterPin(pin: string, meta: VerifyWaiterPinMeta): Promise<VerifyWaiterPinResult> {
    if (env.useMockData && mockContext) {
      const signature = computePinSignature(pin);
      const record = mockContext.waiters.find((waiter) => waiter.pinSignature === signature);

      if (!record || !record.isActive) {
        await recordMockAudit({
          loginType: "waiter",
          identifier: signature,
          success: false,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          notes: "PIN no encontrado o inactivo (mock)",
        });
        return { success: false, message: "PIN no válido" };
      }

      const matches = await bcrypt.compare(pin, record.pinHash);

      await recordMockAudit({
        loginType: "waiter",
        identifier: record.code,
        success: matches,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: matches ? undefined : "PIN incorrecto (mock)",
      });

      if (!matches) {
        return { success: false, message: "PIN no válido" };
      }

      const now = new Date().toISOString();
      record.lastLoginAt = now;
      record.updatedAt = now;

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

    return this.repository.verifyWaiterPin(pin, meta);
  }

  async getWaiterById(waiterId: number): Promise<WaiterUser | null> {
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

    return this.repository.getWaiterById(waiterId);
  }

  async listWaiterDirectory(options: { includeInactive?: boolean } = {}): Promise<WaiterDirectoryEntry[]> {
    const includeInactive = options.includeInactive ?? false;

    if (env.useMockData && mockContext) {
      return mockContext.waiters
        .filter((waiter) => includeInactive || waiter.isActive)
        .map((waiter) => cloneWaiter(waiter));
    }

    return this.repository.listWaiterDirectory({ includeInactive });
  }

  async createWaiterDirectoryEntry(params: CreateWaiterParams): Promise<WaiterDirectoryEntry> {
    const code = normalizeWaiterCode(params.code);
    const fullName = params.fullName.trim();
    const phone = sanitizeContact(params.phone, 30);
    const email = sanitizeContact(params.email, 150);
    const isActive = params.isActive ?? true;

    if (env.useMockData && mockContext) {
      if (mockContext.waiters.some((waiter) => waiter.code === code)) {
        throw new Error("El código de mesero ya existe");
      }

      const now = new Date().toISOString();
      const pinHash = await bcrypt.hash(params.pin, 10);
      const newRecord: MockWaiterRecord = {
        id: mockContext.waiters.reduce((max, waiter) => Math.max(max, waiter.id), 0) + 1,
        code,
        fullName,
        pinHash,
        pinSignature: computePinSignature(params.pin),
        phone,
        email,
        isActive,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      };

      mockContext.waiters.push(newRecord);
      return cloneWaiter(newRecord);
    }

    return this.repository.createWaiterDirectoryEntry({
      code,
      fullName,
      phone,
      email,
      pin: params.pin,
      isActive,
    });
  }

  async updateWaiterDirectoryEntry(waiterId: number, params: UpdateWaiterParams): Promise<WaiterDirectoryEntry> {
    if (env.useMockData && mockContext) {
      const record = mockContext.waiters.find((waiter) => waiter.id === waiterId);
      if (!record) {
        throw new Error("Mesero no encontrado");
      }

      if (typeof params.code !== "undefined") {
        const normalizedCode = normalizeWaiterCode(params.code);
        if (mockContext.waiters.some((other) => other.id !== waiterId && other.code === normalizedCode)) {
          throw new Error("El código de mesero ya existe");
        }
        record.code = normalizedCode;
      }
      if (typeof params.fullName !== "undefined") {
        record.fullName = params.fullName.trim();
      }
      if (typeof params.phone !== "undefined") {
        record.phone = sanitizeContact(params.phone, 30);
      }
      if (typeof params.email !== "undefined") {
        record.email = sanitizeContact(params.email, 150);
      }
      if (typeof params.isActive !== "undefined") {
        record.isActive = !!params.isActive;
      }

      record.updatedAt = new Date().toISOString();
      return cloneWaiter(record);
    }

    return this.repository.updateWaiterDirectoryEntry(waiterId, params);
  }

  async resetWaiterPin(waiterId: number, newPin: string): Promise<WaiterDirectoryEntry> {
    if (env.useMockData && mockContext) {
      const record = mockContext.waiters.find((waiter) => waiter.id === waiterId);
      if (!record) {
        throw new Error("Mesero no encontrado");
      }
      record.pinHash = await bcrypt.hash(newPin, 10);
      record.pinSignature = computePinSignature(newPin);
      record.updatedAt = new Date().toISOString();
      return cloneWaiter(record);
    }

    return this.repository.resetWaiterPin(waiterId, newPin);
  }
}

export const waiterService = new WaiterService();
