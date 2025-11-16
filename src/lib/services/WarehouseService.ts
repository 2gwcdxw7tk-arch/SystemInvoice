import { env } from "@/lib/env";
import {
  IWarehouseRepository,
  WarehouseRecord,
  CreateWarehouseInput,
  UpdateWarehouseInput,
} from "@/lib/repositories/IWarehouseRepository";
import { WarehouseRepository } from "@/lib/repositories/WarehouseRepository";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function cloneWarehouse(record: WarehouseRecord): WarehouseRecord {
  return { ...record } satisfies WarehouseRecord;
}

type MockWarehouse = WarehouseRecord;

export class WarehouseService {
  private readonly repository: IWarehouseRepository;
  private readonly mockWarehouses: MockWarehouse[];
  private mockSequence: number;

  constructor(repository: IWarehouseRepository = new WarehouseRepository()) {
    this.repository = repository;

    if (env.useMockData) {
      const now = new Date().toISOString();
      this.mockWarehouses = [
        { id: 1, code: "PRINCIPAL", name: "Almacén principal", isActive: true, createdAt: now },
        { id: 2, code: "COCINA", name: "Cocina", isActive: true, createdAt: now },
        { id: 3, code: "BAR", name: "Barra principal", isActive: true, createdAt: now },
      ];
      this.mockSequence = this.mockWarehouses.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    } else {
      this.mockWarehouses = [];
      this.mockSequence = 0;
    }
  }

  private findMockWarehouse(code: string): MockWarehouse | null {
    const normalizedCode = normalizeCode(code);
    const found = this.mockWarehouses.find((warehouse) => warehouse.code === normalizedCode);
    return found ? cloneWarehouse(found) : null;
  }

  async listWarehouses(options: { includeInactive?: boolean } = {}): Promise<WarehouseRecord[]> {
    if (env.useMockData) {
      const includeInactive = Boolean(options.includeInactive);
      return this.mockWarehouses
        .filter((warehouse) => includeInactive || warehouse.isActive)
        .map((warehouse) => cloneWarehouse(warehouse))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return this.repository.listWarehouses(options);
  }

  async getWarehouseByCode(code: string): Promise<WarehouseRecord | null> {
    if (!code) {
      return null;
    }

    if (env.useMockData) {
      return this.findMockWarehouse(code);
    }

    return this.repository.findWarehouseByCode(code);
  }

  async createWarehouse(input: CreateWarehouseInput): Promise<WarehouseRecord> {
    const normalizedCode = normalizeCode(input.code);
    const name = input.name.trim();
    const isActive = typeof input.isActive === "boolean" ? input.isActive : true;

    if (!name) {
      throw new Error("El nombre de la bodega es obligatorio");
    }

    if (env.useMockData) {
      if (this.mockWarehouses.some((warehouse) => warehouse.code === normalizedCode)) {
        throw new Error(`Ya existe una bodega con el código ${normalizedCode}`);
      }
      const warehouse: MockWarehouse = {
        id: this.mockSequence++,
        code: normalizedCode,
        name,
        isActive,
        createdAt: new Date().toISOString(),
      };
      this.mockWarehouses.push(warehouse);
      return cloneWarehouse(warehouse);
    }

    return this.repository.createWarehouse({ code: normalizedCode, name, isActive });
  }

  async updateWarehouse(code: string, input: UpdateWarehouseInput): Promise<WarehouseRecord> {
    const normalizedCode = normalizeCode(code);
    const name = typeof input.name === "string" ? input.name.trim() : undefined;
    const isActive = typeof input.isActive === "boolean" ? input.isActive : undefined;

    if (env.useMockData) {
      const index = this.mockWarehouses.findIndex((warehouse) => warehouse.code === normalizedCode);
      if (index === -1) {
        throw new Error(`La bodega ${normalizedCode} no existe`);
      }

      if (typeof name === "string" && name.length > 0) {
        this.mockWarehouses[index].name = name;
      }

      if (typeof isActive === "boolean") {
        this.mockWarehouses[index].isActive = isActive;
      }

      return cloneWarehouse(this.mockWarehouses[index]);
    }

    return this.repository.updateWarehouse(normalizedCode, { name, isActive });
  }
}

export const warehouseService = new WarehouseService();

export type { WarehouseRecord, CreateWarehouseInput, UpdateWarehouseInput };
