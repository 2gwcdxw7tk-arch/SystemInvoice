import { env } from "@/lib/env";
import {
  INotificationChannelRepository,
  NotificationChannelRow,
  UpsertNotificationChannelInput,
} from "@/lib/repositories/INotificationChannelRepository";

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

export class NotificationChannelService {
  constructor(private readonly repository: INotificationChannelRepository) {}

  async listNotificationChannels(): Promise<NotificationChannelRow[]> {
    if (env.useMockData) {
      return mockChannels.map((channel) => ({ ...channel }));
    }
    return this.repository.listNotificationChannels();
  }

  async upsertNotificationChannel(input: UpsertNotificationChannelInput): Promise<{ id: number }> {
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
    return this.repository.upsertNotificationChannel(input);
  }

  async setNotificationChannelStatus(id: number, isActive: boolean): Promise<void> {
    if (env.useMockData) {
      const index = mockChannels.findIndex((channel) => channel.id === id);
      if (index >= 0) {
        mockChannels[index].isActive = isActive;
        mockChannels[index].updatedAt = new Date().toISOString();
      }
      return;
    }
    await this.repository.setNotificationChannelStatus(id, isActive);
  }
}
