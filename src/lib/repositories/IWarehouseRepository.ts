import { Prisma } from "@prisma/client";

export type WarehouseRecord = {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type CreateWarehouseInput = {
  code: string;
  name: string;
  isActive?: boolean;
};

export type UpdateWarehouseInput = {
  name?: string;
  isActive?: boolean;
};

export interface IWarehouseRepository {
  listWarehouses(options?: { includeInactive?: boolean }): Promise<WarehouseRecord[]>;
  findWarehouseByCode(code: string, tx?: Prisma.TransactionClient): Promise<WarehouseRecord | null>;
  findWarehouseById(id: number, tx?: Prisma.TransactionClient): Promise<WarehouseRecord | null>;
  createWarehouse(input: CreateWarehouseInput): Promise<WarehouseRecord>;
  updateWarehouse(code: string, input: UpdateWarehouseInput): Promise<WarehouseRecord>;
}
