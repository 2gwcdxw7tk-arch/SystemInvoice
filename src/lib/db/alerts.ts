import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

export interface InventoryAlertRow {
  id: number;
  name: string;
  description: string | null;
  threshold: number;
  unitCode: string | null;
  notifyChannel: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertInventoryAlertInput {
  id?: number;
  name: string;
  description?: string | null;
  threshold: number;
  unitCode?: string | null;
  notifyChannel?: string | null;
  isActive?: boolean;
}

const mockAlerts: InventoryAlertRow[] = [
  {
    id: 1,
    name: "Ingredientes críticos",
    description: "Notificar cuando quede menos de 5 kg de insumos clave",
    threshold: 5,
    unitCode: "KG",
    notifyChannel: "Correo cocina",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Bebidas premium",
    description: "Alerta cuando queden 10 botellas o menos",
    threshold: 10,
    unitCode: "BOT",
    notifyChannel: "Canal gerencia",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function listInventoryAlerts(): Promise<InventoryAlertRow[]> {
  if (env.useMockData) {
    return mockAlerts.map((alert) => ({ ...alert }));
  }
  const pool = await getPool();
  const result = await pool.request().query<{
    id: number;
    name: string;
    description: string | null;
    threshold: number;
    unit_code: string | null;
    notify_channel: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT id, name, description, threshold, unit_code, notify_channel, is_active, created_at, updated_at
    FROM app.inventory_alerts
    ORDER BY name;
  `);
  return result.recordset.map((row) => ({
    id: Number(row.id),
    name: row.name,
    description: row.description,
    threshold: Number(row.threshold ?? 0),
    unitCode: row.unit_code,
    notifyChannel: row.notify_channel,
    isActive: !!row.is_active,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  } satisfies InventoryAlertRow));
}

export async function upsertInventoryAlert(input: UpsertInventoryAlertInput): Promise<{ id: number }> {
  if (env.useMockData) {
    if (input.id) {
      const index = mockAlerts.findIndex((alert) => alert.id === input.id);
      if (index >= 0) {
        mockAlerts[index] = {
          ...mockAlerts[index],
          name: input.name,
          description: input.description ?? null,
          threshold: input.threshold,
          unitCode: input.unitCode ?? null,
          notifyChannel: input.notifyChannel ?? null,
          isActive: input.isActive ?? mockAlerts[index].isActive,
          updatedAt: new Date().toISOString(),
        };
        return { id: input.id };
      }
    }
    const id = mockAlerts.length ? Math.max(...mockAlerts.map((alert) => alert.id)) + 1 : 1;
    const now = new Date().toISOString();
    mockAlerts.push({
      id,
      name: input.name,
      description: input.description ?? null,
      threshold: input.threshold,
      unitCode: input.unitCode ?? null,
      notifyChannel: input.notifyChannel ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  }

  const pool = await getPool();
  const req = pool.request();
  req.input("name", sql.NVarChar(80), input.name);
  req.input("description", sql.NVarChar(200), input.description ?? null);
  req.input("threshold", sql.Decimal(18, 2), input.threshold);
  req.input("unit_code", sql.NVarChar(20), input.unitCode ?? null);
  req.input("notify_channel", sql.NVarChar(200), input.notifyChannel ?? null);
  req.input("is_active", sql.Bit, input.isActive ?? true);
  if (input.id) {
    req.input("id", sql.Int, input.id);
    await req.query(`
      UPDATE app.inventory_alerts
      SET name = @name,
          description = @description,
          threshold = @threshold,
          unit_code = @unit_code,
          notify_channel = @notify_channel,
          is_active = @is_active,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id;
    `);
    return { id: input.id };
  }
  const insertResult = await req.query<{ id: number }>(`
    INSERT INTO app.inventory_alerts (name, description, threshold, unit_code, notify_channel, is_active)
    OUTPUT INSERTED.id
    VALUES (@name, @description, @threshold, @unit_code, @notify_channel, @is_active);
  `);
  return { id: Number(insertResult.recordset[0].id) };
}

export async function setInventoryAlertStatus(id: number, isActive: boolean): Promise<void> {
  if (env.useMockData) {
    const index = mockAlerts.findIndex((alert) => alert.id === id);
    if (index >= 0) {
      mockAlerts[index].isActive = isActive;
      mockAlerts[index].updatedAt = new Date().toISOString();
    }
    return;
  }
  const pool = await getPool();
  const req = pool.request();
  req.input("id", sql.Int, id);
  req.input("is_active", sql.Bit, isActive);
  await req.query(`
    UPDATE app.inventory_alerts
    SET is_active = @is_active,
        updated_at = SYSUTCDATETIME()
    WHERE id = @id;
  `);
}
