import { env } from "@/lib/env";
import type { IUnitRepository, UnitRow, UpsertUnitInput } from "@/lib/repositories/units/IUnitRepository";
import { UnitRepository } from "@/lib/repositories/units/UnitRepository";

const mockUnits: UnitRow[] = [
  { id: 1, code: "UND", name: "Unidad", is_active: true },
  { id: 2, code: "CJ", name: "Caja", is_active: true },
  { id: 3, code: "LT", name: "Litro", is_active: true },
];

export class UnitService {
  constructor(private readonly repo: IUnitRepository = new UnitRepository()) {}

  async listUnits(): Promise<UnitRow[]> {
    if (env.useMockData) {
      return mockUnits.filter((u) => u.is_active);
    }
    return this.repo.listUnits();
  }

  async upsertUnit(input: UpsertUnitInput): Promise<{ id: number }> {
    if (env.useMockData) {
      const code = input.code.trim().toUpperCase();
      const name = input.name.trim();
      const isActive = input.is_active ?? true;
      const found = mockUnits.find((u) => u.code === code);
      if (found) {
        found.name = name;
        found.is_active = isActive;
        return { id: found.id };
      }
      const id = mockUnits.length ? Math.max(...mockUnits.map((u) => u.id)) + 1 : 1;
      mockUnits.push({ id, code, name, is_active: isActive });
      return { id };
    }
    return this.repo.upsertUnit(input);
  }
}

export const unitService = new UnitService();
