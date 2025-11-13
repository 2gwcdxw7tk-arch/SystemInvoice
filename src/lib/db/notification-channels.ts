import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

export interface NotificationChannelRow {
  id: number;
  name: string;
  channelType: string;
  target: string;
  preferences: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNotificationChannelInput {
  id?: number;
  name: string;
  channelType: string;
  target: string;
  preferences?: string | null;
  isActive?: boolean;
}

const mockChannels: NotificationChannelRow[] = [
  {
    id: 1,
    name: "Correo gerencia",
    channelType: "EMAIL",
    target: "gerencia@restaurante.test",
    preferences: "Resúmenes diarios",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Whatsapp compras",
    channelType: "WHATSAPP",
    target: "+52 55 1234 5678",
    preferences: "Alertas de inventario",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function listNotificationChannels(): Promise<NotificationChannelRow[]> {
  if (env.useMockData) {
    return mockChannels.map((channel) => ({ ...channel }));
  }
  const pool = await getPool();
  const result = await pool.request().query<{
    id: number;
    name: string;
    channel_type: string;
    target: string;
    preferences: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT id, name, channel_type, target, preferences, is_active, created_at, updated_at
    FROM app.notification_channels
    ORDER BY name;
  `);
  return result.recordset.map((row) => ({
    id: Number(row.id),
    name: row.name,
    channelType: row.channel_type,
    target: row.target,
    preferences: row.preferences,
    isActive: !!row.is_active,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
  } satisfies NotificationChannelRow));
}

export async function upsertNotificationChannel(input: UpsertNotificationChannelInput): Promise<{ id: number }> {
  if (env.useMockData) {
    if (input.id) {
      const index = mockChannels.findIndex((channel) => channel.id === input.id);
      if (index >= 0) {
        mockChannels[index] = {
          ...mockChannels[index],
          name: input.name,
          channelType: input.channelType,
          target: input.target,
          preferences: input.preferences ?? null,
          isActive: input.isActive ?? mockChannels[index].isActive,
          updatedAt: new Date().toISOString(),
        };
        return { id: input.id };
      }
    }
    const id = mockChannels.length ? Math.max(...mockChannels.map((channel) => channel.id)) + 1 : 1;
    const now = new Date().toISOString();
    mockChannels.push({
      id,
      name: input.name,
      channelType: input.channelType,
      target: input.target,
      preferences: input.preferences ?? null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  }

  const pool = await getPool();
  const req = pool.request();
  req.input("name", sql.NVarChar(80), input.name);
  req.input("channel_type", sql.NVarChar(40), input.channelType);
  req.input("target", sql.NVarChar(200), input.target);
  req.input("preferences", sql.NVarChar(500), input.preferences ?? null);
  req.input("is_active", sql.Bit, input.isActive ?? true);
  if (input.id) {
    req.input("id", sql.Int, input.id);
    await req.query(`
      UPDATE app.notification_channels
      SET name = @name,
          channel_type = @channel_type,
          target = @target,
          preferences = @preferences,
          is_active = @is_active,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id;
    `);
    return { id: input.id };
  }
  const insertResult = await req.query<{ id: number }>(`
    INSERT INTO app.notification_channels (name, channel_type, target, preferences, is_active)
    OUTPUT INSERTED.id
    VALUES (@name, @channel_type, @target, @preferences, @is_active);
  `);
  return { id: Number(insertResult.recordset[0].id) };
}

export async function setNotificationChannelStatus(id: number, isActive: boolean): Promise<void> {
  if (env.useMockData) {
    const index = mockChannels.findIndex((channel) => channel.id === id);
    if (index >= 0) {
      mockChannels[index].isActive = isActive;
      mockChannels[index].updatedAt = new Date().toISOString();
    }
    return;
  }
  const pool = await getPool();
  const req = pool.request();
  req.input("id", sql.Int, id);
  req.input("is_active", sql.Bit, isActive);
  await req.query(`
    UPDATE app.notification_channels
    SET is_active = @is_active,
        updated_at = SYSUTCDATETIME()
    WHERE id = @id;
  `);
}
