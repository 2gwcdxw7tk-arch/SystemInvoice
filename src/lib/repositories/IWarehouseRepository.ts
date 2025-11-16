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
  findWarehouseByCode(code: string): Promise<WarehouseRecord | null>;
  createWarehouse(input: CreateWarehouseInput): Promise<WarehouseRecord>;
  updateWarehouse(code: string, input: UpdateWarehouseInput): Promise<WarehouseRecord>;
}
