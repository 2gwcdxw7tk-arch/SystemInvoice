import "server-only";

import { warehouseService } from "@/lib/services/WarehouseService";

export interface WarehouseRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export async function listWarehouses(options: { includeInactive?: boolean } = {}): Promise<WarehouseRow[]> {
  const records = await warehouseService.listWarehouses(options);
  return records.map((record) => ({
    id: record.id,
    code: record.code,
    name: record.name,
    is_active: record.isActive,
  } satisfies WarehouseRow));
}

export async function getWarehouseByCode(code: string): Promise<WarehouseRow | null> {
  const record = await warehouseService.getWarehouseByCode(code);
  return record
    ? {
        id: record.id,
        code: record.code,
        name: record.name,
        is_active: record.isActive,
      }
    : null;
}
