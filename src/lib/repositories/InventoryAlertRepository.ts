import { IInventoryAlertRepository, InventoryAlertRow, UpsertInventoryAlertInput } from "./IInventoryAlertRepository";
import { prisma } from "@/lib/db/prisma";

export class InventoryAlertRepository implements IInventoryAlertRepository {
  async listInventoryAlerts(): Promise<InventoryAlertRow[]> {
    const alerts = await prisma.inventory_alerts.findMany({
      orderBy: { name: "asc" },
    });

    return alerts.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      threshold: Number(row.threshold ?? 0),
      unitCode: row.unit_code,
      notifyChannel: row.notify_channel,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async upsertInventoryAlert(input: UpsertInventoryAlertInput): Promise<{ id: number }> {
    const name = input.name.trim();
    const description = input.description ?? null;
    const threshold = input.threshold;
    const unitCode = input.unitCode ?? null;
    const notifyChannel = input.notifyChannel ?? null;
    const isActive = input.isActive ?? true;

    if (input.id) {
      const alert = await prisma.inventory_alerts.update({
        where: { id: input.id },
        data: {
          name,
          description,
          threshold,
          unit_code: unitCode,
          notify_channel: notifyChannel,
          is_active: isActive,
          updated_at: new Date(),
        },
        select: { id: true },
      });
      return { id: alert.id };
    }

    const alert = await prisma.inventory_alerts.create({
      data: {
        name,
        description,
        threshold,
        unit_code: unitCode,
        notify_channel: notifyChannel,
        is_active: isActive,
      },
      select: { id: true },
    });

    return { id: alert.id };
  }

  async setInventoryAlertStatus(id: number, isActive: boolean): Promise<void> {
    await prisma.inventory_alerts.update({
      where: { id },
      data: {
        is_active: isActive,
        updated_at: new Date(),
      },
    });
  }
}
