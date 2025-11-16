import { prisma } from "@/lib/db/prisma";
import {
  CreateTableZoneInput,
  ITableZoneRepository,
  TableZoneRow,
  UpdateTableZoneInput,
} from "@/lib/repositories/ITableZoneRepository";

function normalizeZoneId(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-");
  return base.length > 0 ? base : "ZONA";
}

async function generateZoneId(name: string): Promise<string> {
  const baseId = normalizeZoneId(name);
  let candidate = baseId;
  let suffix = 2;
  while (true) {
    const existing = await prisma.table_zones.findUnique({ where: { id: candidate } });
    if (!existing) {
      return candidate;
    }
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
}

function mapRow(row: { id: string; name: string; is_active: boolean; sort_order: number; created_at: Date; updated_at: Date | null }): TableZoneRow {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  } satisfies TableZoneRow;
}

export class TableZoneRepository implements ITableZoneRepository {
  async listZones(includeInactive = true): Promise<TableZoneRow[]> {
    const zones = await prisma.table_zones.findMany({
      where: includeInactive ? undefined : { is_active: true },
      orderBy: { sort_order: "asc" },
    });

    return zones.map(mapRow);
  }

  async createZone(input: CreateTableZoneInput): Promise<TableZoneRow> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("El nombre de la zona es obligatorio");
    }

    const id = await generateZoneId(name);
    const [{ _max }, now] = await Promise.all([
      prisma.table_zones.aggregate({ _max: { sort_order: true } }),
      Promise.resolve(new Date()),
    ]);
    const nextSortOrder = (_max.sort_order ?? 0) + 1;

    const created = await prisma.table_zones.create({
      data: {
        id,
        name,
        is_active: input.isActive ?? true,
        sort_order: nextSortOrder,
        created_at: now,
        updated_at: now,
      },
    });

    return mapRow(created);
  }

  async updateZone(id: string, input: UpdateTableZoneInput): Promise<TableZoneRow> {
    const data: {
      name?: string;
      is_active?: boolean;
      updated_at?: Date;
    } = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("El nombre de la zona es obligatorio");
      }
      data.name = name;
    }

    if (input.isActive !== undefined) {
      data.is_active = input.isActive;
    }

    if (Object.keys(data).length === 0) {
      const current = await prisma.table_zones.findUnique({ where: { id } });
      if (!current) {
        throw new Error("Zona no encontrada");
      }
      return mapRow(current);
    }

    data.updated_at = new Date();

    const updated = await prisma.table_zones.update({
      where: { id },
      data,
    });

    return mapRow(updated);
  }
}
