import type { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/db/prisma";
import {
  IWarehouseRepository,
  WarehouseRecord,
  CreateWarehouseInput,
  UpdateWarehouseInput,
} from "@/lib/repositories/IWarehouseRepository";

const UNIQUE_VIOLATION = "P2002";

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

type WarehouseRow = { id: bigint | number; code: string; name: string; is_active: boolean; created_at: Date };

function mapWarehouse(row: WarehouseRow): WarehouseRecord {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at.toISOString(),
  } satisfies WarehouseRecord;
}

export class WarehouseRepository implements IWarehouseRepository {
  async listWarehouses(options: { includeInactive?: boolean } = {}): Promise<WarehouseRecord[]> {
    const includeInactive = Boolean(options.includeInactive);
    const warehouses = await prisma.warehouses.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        is_active: true,
        created_at: true,
      },
    });

    return warehouses.map((row: WarehouseRow) => mapWarehouse(row as WarehouseRow));
  }

  async findWarehouseByCode(code: string, tx?: Prisma.TransactionClient): Promise<WarehouseRecord | null> {
    const client = tx ?? prisma;
    const normalizedCode = normalizeCode(code);
    const warehouse = await client.warehouses.findUnique({
      where: { code: normalizedCode },
      select: {
        id: true,
        code: true,
        name: true,
        is_active: true,
        created_at: true,
      },
    });

    return warehouse ? mapWarehouse(warehouse as WarehouseRow) : null;
  }

  async findWarehouseById(id: number, tx?: Prisma.TransactionClient): Promise<WarehouseRecord | null> {
    const client = tx ?? prisma;
    const warehouse = await client.warehouses.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        is_active: true,
        created_at: true,
      },
    });

    return warehouse ? mapWarehouse(warehouse) : null;
  }

  async createWarehouse(input: CreateWarehouseInput): Promise<WarehouseRecord> {
    const normalizedCode = normalizeCode(input.code);
    const name = input.name.trim();
    const isActive = typeof input.isActive === "boolean" ? input.isActive : true;

    try {
      const warehouse = await prisma.warehouses.create({
        data: {
          code: normalizedCode,
          name,
          is_active: isActive,
        },
        select: {
          id: true,
          code: true,
          name: true,
          is_active: true,
          created_at: true,
        },
      });
      return mapWarehouse(warehouse as WarehouseRow);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new Error(`Ya existe una bodega con el código ${normalizedCode}`);
      }
      throw error;
    }
  }

  async updateWarehouse(code: string, input: UpdateWarehouseInput): Promise<WarehouseRecord> {
    const normalizedCode = normalizeCode(code);
    const updates: Record<string, unknown> = {};

    if (typeof input.name === "string") {
      updates.name = input.name.trim();
    }

    if (typeof input.isActive === "boolean") {
      updates.is_active = input.isActive;
    }

    try {
      const warehouse = await prisma.warehouses.update({
        where: { code: normalizedCode },
        data: updates,
        select: {
          id: true,
          code: true,
          name: true,
          is_active: true,
          created_at: true,
        },
      });
      return mapWarehouse(warehouse as unknown as WarehouseRow);
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
        throw new Error(`La bodega ${normalizedCode} no existe`);
      }
      throw error;
    }
  }
}
