// No importar InventoryAlert directamente desde @prisma/client

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

export interface IInventoryAlertRepository {
  listInventoryAlerts(): Promise<InventoryAlertRow[]>;
  upsertInventoryAlert(input: UpsertInventoryAlertInput): Promise<{ id: number }>;
  setInventoryAlertStatus(id: number, isActive: boolean): Promise<void>;
}
