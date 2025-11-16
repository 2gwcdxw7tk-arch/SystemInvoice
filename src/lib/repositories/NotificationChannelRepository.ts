import { prisma } from "@/lib/db/prisma";
import {
  INotificationChannelRepository,
  NotificationChannelRow,
  UpsertNotificationChannelInput,
} from "./INotificationChannelRepository";

export class NotificationChannelRepository implements INotificationChannelRepository {
  async listNotificationChannels(): Promise<NotificationChannelRow[]> {
    const channels = await prisma.notification_channels.findMany({
      orderBy: { name: "asc" },
    });

    return channels.map((row) => ({
      id: Number(row.id),
      name: row.name,
      channelType: row.channel_type,
      target: row.target,
      preferences: row.preferences ?? null,
      isActive: !!row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async upsertNotificationChannel(input: UpsertNotificationChannelInput): Promise<{ id: number }> {
    const name = input.name.trim();
    const channelType = input.channelType.trim();
    const target = input.target.trim();
    const preferences = input.preferences?.trim() ?? null;
    const isActive = input.isActive ?? true;

    if (input.id) {
      const channel = await prisma.notification_channels.update({
        where: { id: input.id },
        data: {
          name,
          channel_type: channelType,
          target,
          preferences,
          is_active: isActive,
          updated_at: new Date(),
        },
        select: { id: true },
      });
      return { id: Number(channel.id) };
    }

    const channel = await prisma.notification_channels.create({
      data: {
        name,
        channel_type: channelType,
        target,
        preferences,
        is_active: isActive,
      },
      select: { id: true },
    });

    return { id: Number(channel.id) };
  }

  async setNotificationChannelStatus(id: number, isActive: boolean): Promise<void> {
    await prisma.notification_channels.update({
      where: { id },
      data: {
        is_active: isActive,
        updated_at: new Date(),
      },
    });
  }
}
