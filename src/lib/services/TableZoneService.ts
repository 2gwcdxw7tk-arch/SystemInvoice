import { env } from "@/lib/env";
import {
  createTableZone as createTableZoneMock,
  listTableZones as listTableZonesMock,
  updateTableZone as updateTableZoneMock,
} from "@/lib/db/tables";
import {
  CreateTableZoneInput,
  ITableZoneRepository,
  TableZoneRow,
  UpdateTableZoneInput,
} from "@/lib/repositories/ITableZoneRepository";
import { TableZoneRepository } from "@/lib/repositories/TableZoneRepository";

function mapMockZone(zone: {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
}): TableZoneRow {
  return {
    id: zone.id,
    name: zone.name,
    isActive: zone.is_active,
    sortOrder: zone.sort_order,
    createdAt: zone.created_at,
    updatedAt: zone.updated_at,
  } satisfies TableZoneRow;
}

export class TableZoneService {
  constructor(private readonly repository: ITableZoneRepository = new TableZoneRepository()) {}

  async listZones(options?: { includeInactive?: boolean }): Promise<TableZoneRow[]> {
    if (env.useMockData) {
      const zones = await listTableZonesMock({ includeInactive: options?.includeInactive });
      return zones.map(mapMockZone);
    }
    return this.repository.listZones(options?.includeInactive);
  }

  async createZone(input: CreateTableZoneInput): Promise<TableZoneRow> {
    if (env.useMockData) {
      const zone = await createTableZoneMock({ name: input.name, isActive: input.isActive });
      return mapMockZone(zone);
    }
    return this.repository.createZone(input);
  }

  async updateZone(id: string, input: UpdateTableZoneInput): Promise<TableZoneRow> {
    if (env.useMockData) {
      const zone = await updateTableZoneMock(id, { name: input.name, isActive: input.isActive });
      return mapMockZone(zone);
    }
    return this.repository.updateZone(id, input);
  }
}
