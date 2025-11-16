export interface TableZoneRow {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateTableZoneInput {
  name: string;
  isActive?: boolean;
}

export interface UpdateTableZoneInput {
  name?: string;
  isActive?: boolean;
}

export interface ITableZoneRepository {
  listZones(includeInactive?: boolean): Promise<TableZoneRow[]>;
  createZone(input: CreateTableZoneInput): Promise<TableZoneRow>;
  updateZone(id: string, input: UpdateTableZoneInput): Promise<TableZoneRow>;
}
