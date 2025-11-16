import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { computePinSignature, sanitizeNullable } from "@/lib/utils/auth";
import type {
  IWaiterRepository,
  VerifyWaiterPinResult,
  VerifyWaiterPinMeta,
  WaiterUser,
  WaiterDirectoryEntry,
  CreateWaiterParams,
  UpdateWaiterParams,
} from "@/lib/repositories/IWaiterRepository";

const UNIQUE_CONSTRAINT_ERROR = "El código de mesero ya existe";

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

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

type WaiterRecord = Prisma.waitersGetPayload<{
  select: {
    id: true;
    code: true;
    full_name: true;
    phone: true;
    email: true;
    is_active: true;
    last_login_at: true;
    created_at: true;
    updated_at: true;
  };
}>;

function mapWaiter(record: WaiterRecord): WaiterDirectoryEntry {
  return {
    id: record.id,
    code: record.code,
    fullName: record.full_name,
    phone: record.phone ?? null,
    email: record.email ?? null,
    isActive: record.is_active,
    lastLoginAt: toIsoString(record.last_login_at),
    createdAt: record.created_at.toISOString(),
    updatedAt: toIsoString(record.updated_at),
  } satisfies WaiterDirectoryEntry;
}

export class WaiterRepository implements IWaiterRepository {
  async verifyWaiterPin(pin: string, meta: VerifyWaiterPinMeta): Promise<VerifyWaiterPinResult> {
    const signature = computePinSignature(pin);

    const waiter = await prisma.waiters.findFirst({
      where: { pin_signature: signature },
      select: {
        id: true,
        code: true,
        full_name: true,
        pin_hash: true,
        is_active: true,
      },
    });

    if (!waiter || !waiter.is_active) {
      await this.createLoginAudit({
        loginType: "waiter",
        identifier: signature,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: "PIN no encontrado o inactivo",
      });
      return { success: false, message: "PIN no válido" };
    }

    const pinMatches = await bcrypt.compare(pin, waiter.pin_hash);

    if (!pinMatches) {
      await this.createLoginAudit({
        loginType: "waiter",
        identifier: signature,
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        notes: "PIN incorrecto",
      });
      return { success: false, message: "PIN no válido" };
    }

    await prisma.$transaction([
      prisma.login_audit.create({
        data: {
          login_type: "waiter",
          identifier: waiter.code,
          success: true,
          ip_address: meta.ipAddress ?? null,
          user_agent: meta.userAgent?.slice(0, 300) ?? null,
          notes: null,
        },
      }),
      prisma.waiters.update({
        where: { id: waiter.id },
        data: {
          last_login_at: new Date(),
          updated_at: new Date(),
        },
      }),
    ]);

    return {
      success: true,
      waiter: {
        id: waiter.id,
        code: waiter.code,
        fullName: waiter.full_name,
      },
      message: "Acceso concedido",
    } satisfies VerifyWaiterPinResult;
  }

  async getWaiterById(waiterId: number): Promise<WaiterUser | null> {
    const waiter = await prisma.waiters.findUnique({
      where: { id: waiterId },
      select: {
        id: true,
        code: true,
        full_name: true,
        is_active: true,
      },
    });

    if (!waiter || !waiter.is_active) {
      return null;
    }

    return {
      id: waiter.id,
      code: waiter.code,
      fullName: waiter.full_name,
    } satisfies WaiterUser;
  }

  async listWaiterDirectory(options: { includeInactive?: boolean }): Promise<WaiterDirectoryEntry[]> {
    const includeInactive = options.includeInactive ?? false;

    const waiters = await prisma.waiters.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        full_name: true,
        phone: true,
        email: true,
        is_active: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    return waiters.map(mapWaiter);
  }

  async createWaiterDirectoryEntry(params: CreateWaiterParams): Promise<WaiterDirectoryEntry> {
    const code = normalizeWaiterCode(params.code);
    const fullName = params.fullName.trim();
    const phone = sanitizeContact(params.phone, 30);
    const email = sanitizeContact(params.email, 150);
    const isActive = params.isActive ?? true;
    const pinHash = await bcrypt.hash(params.pin, 10);
    const pinSignature = computePinSignature(params.pin);

    try {
      const waiter = await prisma.waiters.create({
        data: {
          code,
          full_name: fullName,
          pin_hash: pinHash,
          pin_signature: pinSignature,
          is_active: isActive,
          phone,
          email,
        },
        select: {
          id: true,
          code: true,
          full_name: true,
          phone: true,
          email: true,
          is_active: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
      });

      return mapWaiter(waiter);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error(UNIQUE_CONSTRAINT_ERROR);
      }
      throw error;
    }
  }

  async updateWaiterDirectoryEntry(
    waiterId: number,
    params: UpdateWaiterParams
  ): Promise<WaiterDirectoryEntry> {
    const data: Prisma.waitersUpdateInput = {};

    if (typeof params.code !== "undefined") {
      data.code = normalizeWaiterCode(params.code);
    }
    if (typeof params.fullName !== "undefined") {
      data.full_name = params.fullName.trim();
    }
    if (typeof params.phone !== "undefined") {
      data.phone = sanitizeContact(params.phone, 30);
    }
    if (typeof params.email !== "undefined") {
      data.email = sanitizeContact(params.email, 150);
    }
    if (typeof params.isActive !== "undefined") {
      data.is_active = !!params.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new Error("No hay cambios para aplicar");
    }

    try {
      const waiter = await prisma.waiters.update({
        where: { id: waiterId },
        data: {
          ...data,
          updated_at: new Date(),
        },
        select: {
          id: true,
          code: true,
          full_name: true,
          phone: true,
          email: true,
          is_active: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
      });

      return mapWaiter(waiter);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error(UNIQUE_CONSTRAINT_ERROR);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new Error("Mesero no encontrado");
      }
      throw error;
    }
  }

  async resetWaiterPin(waiterId: number, newPin: string): Promise<WaiterDirectoryEntry> {
    const pinHash = await bcrypt.hash(newPin, 10);
    const pinSignature = computePinSignature(newPin);

    try {
      const waiter = await prisma.waiters.update({
        where: { id: waiterId },
        data: {
          pin_hash: pinHash,
          pin_signature: pinSignature,
          updated_at: new Date(),
        },
        select: {
          id: true,
          code: true,
          full_name: true,
          phone: true,
          email: true,
          is_active: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
      });

      return mapWaiter(waiter);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new Error("Mesero no encontrado");
      }
      throw error;
    }
  }

  private async createLoginAudit(params: {
    loginType: "admin" | "waiter";
    identifier: string;
    success: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
    notes?: string | null;
  }): Promise<void> {
    await prisma.login_audit.create({
      data: {
        login_type: params.loginType,
        identifier: params.identifier,
        success: params.success,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent?.slice(0, 300) ?? null,
        notes: params.notes?.slice(0, 300) ?? null,
      },
    });
  }
}
