import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";

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
  const result = await query<{
    id: number;
    name: string;
    channel_type: string;
    target: string;
    preferences: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, name, channel_type, target, preferences, is_active, created_at, updated_at
     FROM app.notification_channels
     ORDER BY name`
  );
  return result.rows.map((row) => ({
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

  const name = input.name.trim();
  const channelType = input.channelType;
  const target = input.target;
  const preferences = input.preferences ?? null;
  const isActive = input.isActive ?? true;

  if (input.id) {
    await query(
      `UPDATE app.notification_channels
       SET name = $1,
           channel_type = $2,
           target = $3,
           preferences = $4,
           is_active = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [name, channelType, target, preferences, isActive, input.id]
    );
    return { id: input.id };
  }

  const insertResult = await query<{ id: number }>(
    `INSERT INTO app.notification_channels (name, channel_type, target, preferences, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [name, channelType, target, preferences, isActive]
  );
  return { id: Number(insertResult.rows[0].id) };
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
  await query(
    `UPDATE app.notification_channels
     SET is_active = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [isActive, id]
  );
}
