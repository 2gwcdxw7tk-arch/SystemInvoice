import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";

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
  const result = await query<{
    id: number;
    name: string;
    description: string | null;
    threshold: number;
    unit_code: string | null;
    notify_channel: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, description, threshold, unit_code, notify_channel, is_active, created_at, updated_at
     FROM app.inventory_alerts
     ORDER BY name`
  );
  return result.rows.map((row) => ({
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

  const name = input.name.trim();
  const description = input.description ?? null;
  const threshold = input.threshold;
  const unitCode = input.unitCode ?? null;
  const notifyChannel = input.notifyChannel ?? null;
  const isActive = input.isActive ?? true;

  if (input.id) {
    await query(
      `UPDATE app.inventory_alerts
       SET name = $1,
           description = $2,
           threshold = $3,
           unit_code = $4,
           notify_channel = $5,
           is_active = $6,
           updated_at = NOW()
       WHERE id = $7`,
      [name, description, threshold, unitCode, notifyChannel, isActive, input.id]
    );
    return { id: input.id };
  }

  const insertResult = await query<{ id: number }>(
    `INSERT INTO app.inventory_alerts (name, description, threshold, unit_code, notify_channel, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [name, description, threshold, unitCode, notifyChannel, isActive]
  );
  return { id: Number(insertResult.rows[0].id) };
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
  await query(
    `UPDATE app.inventory_alerts
     SET is_active = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [isActive, id]
  );
}
