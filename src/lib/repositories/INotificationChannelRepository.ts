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

export interface INotificationChannelRepository {
  listNotificationChannels(): Promise<NotificationChannelRow[]>;
  upsertNotificationChannel(input: UpsertNotificationChannelInput): Promise<{ id: number }>;
  setNotificationChannelStatus(id: number, isActive: boolean): Promise<void>;
}
