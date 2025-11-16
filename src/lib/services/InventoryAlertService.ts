import { env } from "@/lib/env";
import { IInventoryAlertRepository, InventoryAlertRow, UpsertInventoryAlertInput } from "@/lib/repositories/IInventoryAlertRepository";
import { InventoryAlertRepository } from "@/lib/repositories/InventoryAlertRepository";

// Mock stores (copia de src/lib/db/alerts.ts para el modo MOCK)
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

export class InventoryAlertService {
  private inventoryAlertRepository: IInventoryAlertRepository;

  constructor(inventoryAlertRepository: IInventoryAlertRepository = new InventoryAlertRepository()) {
    this.inventoryAlertRepository = inventoryAlertRepository;
  }

  async listInventoryAlerts(): Promise<InventoryAlertRow[]> {
    if (env.useMockData) {
      return mockAlerts.map((alert) => ({ ...alert }));
    }
    return this.inventoryAlertRepository.listInventoryAlerts();
  }

  async upsertInventoryAlert(input: UpsertInventoryAlertInput): Promise<{ id: number }> {
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
    return this.inventoryAlertRepository.upsertInventoryAlert(input);
  }

  async setInventoryAlertStatus(id: number, isActive: boolean): Promise<void> {
    if (env.useMockData) {
      const index = mockAlerts.findIndex((alert) => alert.id === id);
      if (index >= 0) {
        mockAlerts[index].isActive = isActive;
        mockAlerts[index].updatedAt = new Date().toISOString();
      }
      return;
    }
    return this.inventoryAlertRepository.setInventoryAlertStatus(id, isActive);
  }
}
