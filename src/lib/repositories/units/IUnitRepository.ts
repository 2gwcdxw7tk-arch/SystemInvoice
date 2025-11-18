export interface UnitRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface UpsertUnitInput {
  code: string;
  name: string;
  is_active?: boolean;
}

export interface IUnitRepository {
  listUnits(): Promise<UnitRow[]>;
  upsertUnit(input: UpsertUnitInput): Promise<{ id: number }>;
}
