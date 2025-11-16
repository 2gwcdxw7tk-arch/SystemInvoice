import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  IWarehouseRepository,
  WarehouseRecord,
  CreateWarehouseInput,
  UpdateWarehouseInput,
} from "@/lib/repositories/IWarehouseRepository";

const UNIQUE_VIOLATION = "P2002" satisfies typeof Prisma.PrismaClientKnownRequestError.prototype.code;

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function mapWarehouse(row: { id: number; code: string; name: string; is_active: boolean; created_at: Date }): WarehouseRecord {
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

    return warehouses.map(mapWarehouse);
  }

  async findWarehouseByCode(code: string): Promise<WarehouseRecord | null> {
    const normalizedCode = normalizeCode(code);
    const warehouse = await prisma.warehouses.findUnique({
      where: { code: normalizedCode },
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
      return mapWarehouse(warehouse);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new Error(`Ya existe una bodega con el código ${normalizedCode}`);
      }
      throw error;
    }
  }

  async updateWarehouse(code: string, input: UpdateWarehouseInput): Promise<WarehouseRecord> {
    const normalizedCode = normalizeCode(code);
    const updates: Prisma.warehousesUpdateInput = {};

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
      return mapWarehouse(warehouse);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new Error(`La bodega ${normalizedCode} no existe`);
      }
      throw error;
    }
  }
}
