import { Prisma } from "@prisma/client";

import { IOrderRepository, OrderStatus } from "./IOrderRepository";
import type { KitchenOrder, KitchenOrderStatus } from "@/lib/db/orders";
import { setTableOrderStatus } from "@/lib/db/tables";
import { prisma } from "@/lib/db/prisma";

type OrderWithItems = Prisma.ordersGetPayload<{
  include: {
    order_items: {
      select: {
        id: true;
        order_id: true;
        article_code: true;
        description: true;
        quantity: true;
        unit_price: true;
        modifiers: true;
        notes: true;
      };
    };
    tables: { select: { label: true } };
  };
}>;

type OrderItemRow = OrderWithItems["order_items"][number];

function toIsoString(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString();
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || typeof value === "undefined") {
    return 0;
  }
  return Number(value);
}

function jsonToStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === "string");
      }
    } catch {
      return value.length > 0 ? [value] : [];
    }
  }

  return [];
}

function mapOrderToKitchenOrder(order: OrderWithItems): KitchenOrder {
  return {
    id: Number(order.id),
    orderCode: order.order_code,
    tableId: order.table_id,
    tableLabel: order.tables?.label ?? null,
    waiterCode: order.waiter_code,
    waiterName: order.waiter_name,
    guests: order.guests,
    status: order.status as KitchenOrderStatus,
    openedAt: toIsoString(order.opened_at) ?? new Date().toISOString(),
    closedAt: toIsoString(order.closed_at),
    notes: order.notes,
    items: order.order_items.map(mapOrderItemToKitchenItem),
  };
}

function mapOrderItemToKitchenItem(item: OrderItemRow) {
  return {
    id: Number(item.id),
    articleCode: item.article_code,
    name: item.description,
    quantity: decimalToNumber(item.quantity),
    unitPrice: decimalToNumber(item.unit_price),
    modifiers: jsonToStringArray(item.modifiers),
    notes: item.notes,
  };
}

function mapStatusToTable(status: KitchenOrderStatus): OrderStatus {
  switch (status) {
    case "OPEN":
      return "normal";
    case "INVOICED":
      return "facturado";
    case "CANCELLED":
    default:
      return "anulado";
  }
}

async function syncTableState(orderId: number): Promise<void> {
  const order = await prisma.orders.findUnique({
    where: { id: BigInt(orderId) },
    select: {
      id: true,
      table_id: true,
      waiter_name: true,
      status: true,
      order_items: {
        select: {
          article_code: true,
          description: true,
          quantity: true,
          unit_price: true,
          notes: true,
        },
      },
    },
  });

  if (!order?.table_id) {
    return;
  }

  const orderLines = order.order_items.map((item) => ({
    articleCode: item.article_code,
    name: item.description,
    quantity: decimalToNumber(item.quantity),
    unitPrice: decimalToNumber(item.unit_price),
    notes: item.notes ?? undefined,
  }));

  const statusForTable = mapStatusToTable(order.status as KitchenOrderStatus);
  const serialized = JSON.stringify(orderLines);

  await prisma.table_state.upsert({
    where: { table_id: order.table_id },
    update: {
      assigned_waiter_name: order.waiter_name,
      status: statusForTable,
      sent_items: serialized,
      updated_at: new Date(),
    },
    create: {
      table_id: order.table_id,
      assigned_waiter_name: order.waiter_name,
      status: statusForTable,
      pending_items: "[]",
      sent_items: serialized,
      updated_at: new Date(),
    },
  });
}

function buildOrderCode(): string {
  return `ORD-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

export class OrderRepository implements IOrderRepository {
  async listOpenOrders(): Promise<KitchenOrder[]> {
    const orders = await prisma.orders.findMany({
      where: { status: "OPEN" },
      include: {
        order_items: {
          select: {
            id: true,
            order_id: true,
            article_code: true,
            description: true,
            quantity: true,
            unit_price: true,
            modifiers: true,
            notes: true,
          },
        },
        tables: { select: { label: true } },
      },
      orderBy: { opened_at: "asc" },
    });

    return orders.map(mapOrderToKitchenOrder);
  }

  async createOrder(input: {
    tableId: string | null;
    waiterCode: string | null;
    waiterName: string | null;
    guests: number | null;
    notes?: string | null;
    items?: {
      articleCode: string;
      name: string;
      unitPrice: number;
      quantity: number;
      modifiers?: string[];
      notes?: string | null;
    }[];
  }): Promise<number> {
    const orderCode = buildOrderCode();

    const order = await prisma.orders.create({
      data: {
        order_code: orderCode,
        table_id: input.tableId,
        waiter_code: input.waiterCode,
        waiter_name: input.waiterName,
        guests: input.guests,
        notes: input.notes,
        order_items: {
          create: (input.items ?? []).map((item) => ({
            article_code: item.articleCode,
            description: item.name,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            modifiers: item.modifiers ?? [],
            notes: item.notes,
          })),
        },
      },
      select: { id: true },
    });

    const orderId = Number(order.id);
    await syncTableState(orderId);
    return orderId;
  }

  async addOrderItem(
    orderId: number,
    input: {
      articleCode: string;
      name: string;
      unitPrice: number;
      quantity: number;
      modifiers?: string[];
      notes?: string | null;
    },
  ): Promise<void> {
    await prisma.order_items.create({
      data: {
        order_id: BigInt(orderId),
        article_code: input.articleCode,
        description: input.name,
        quantity: input.quantity,
        unit_price: input.unitPrice,
        modifiers: input.modifiers ?? [],
        notes: input.notes,
      },
    });
    await syncTableState(orderId);
  }

  async updateOrderItem(
    orderId: number,
    itemId: number,
    updates: Partial<{
      quantity: number;
      unitPrice: number;
      modifiers: string[];
      notes: string | null;
    }>,
  ): Promise<void> {
    await prisma.order_items.update({
      where: { id: BigInt(itemId) },
      data: {
        quantity: updates.quantity,
        unit_price: updates.unitPrice,
        modifiers: updates.modifiers ?? undefined,
        notes: updates.notes,
      },
    });
    await syncTableState(orderId);
  }

  async removeOrderItem(orderId: number, itemId: number): Promise<void> {
    await prisma.order_items.delete({
      where: { id: BigInt(itemId) },
    });
    await syncTableState(orderId);
  }

  async updateOrderNotes(orderId: number, notes: string | null): Promise<void> {
    await prisma.orders.update({
      where: { id: BigInt(orderId) },
      data: { notes },
    });
    await syncTableState(orderId);
  }

  async updateOrderGuests(orderId: number, guests: number | null): Promise<void> {
    await prisma.orders.update({
      where: { id: BigInt(orderId) },
      data: { guests },
    });
    await syncTableState(orderId);
  }

  async markOrderAsInvoiced(orderId: number, invoiceDate: Date): Promise<void> {
    const order = await prisma.orders.update({
      where: { id: BigInt(orderId) },
      data: {
        status: "INVOICED",
        closed_at: invoiceDate,
      },
      select: { table_id: true },
    });

    if (order.table_id) {
      await setTableOrderStatus(order.table_id, "facturado");
    }
    await syncTableState(orderId);
  }

  async cancelOrder(orderId: number): Promise<void> {
    const order = await prisma.orders.update({
      where: { id: BigInt(orderId) },
      data: {
        status: "CANCELLED",
        closed_at: new Date(),
      },
      select: { table_id: true },
    });

    if (order.table_id) {
      await setTableOrderStatus(order.table_id, "anulado");
    }
    await syncTableState(orderId);
  }

  async syncWaiterOrderForTable(params: {
    tableId: string;
    waiterId: number | null;
    waiterCode: string | null;
    waiterName: string | null;
    sentItems: {
      articleCode: string;
      name: string;
      quantity: number;
      unitPrice: number;
      notes: string | null;
    }[];
  }): Promise<number | null> {
    const existingOrder = await prisma.orders.findFirst({
      where: { table_id: params.tableId, status: "OPEN" },
      orderBy: { opened_at: "asc" },
      select: { id: true },
    });

    let orderId: number | null = existingOrder ? Number(existingOrder.id) : null;

    if (!orderId) {
      if (params.sentItems.length === 0) {
        return null;
      }

      orderId = await this.createOrder({
        tableId: params.tableId,
        waiterCode: params.waiterCode,
        waiterName: params.waiterName,
        guests: null,
        notes: null,
        items: params.sentItems.map((item) => ({
          articleCode: item.articleCode,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          modifiers: [],
          notes: item.notes,
        })),
      });

      await prisma.table_state.upsert({
        where: { table_id: params.tableId },
        update: {
          assigned_waiter_id: params.waiterId,
          assigned_waiter_name: params.waiterName,
          updated_at: new Date(),
        },
        create: {
          table_id: params.tableId,
          assigned_waiter_id: params.waiterId,
          assigned_waiter_name: params.waiterName,
          status: "normal",
          pending_items: "[]",
          sent_items: "[]",
          updated_at: new Date(),
        },
      });

      return orderId;
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.orders.update({
        where: { id: BigInt(orderId) },
        data: {
          waiter_code: params.waiterCode,
          waiter_name: params.waiterName,
        },
      });

      await tx.order_items.deleteMany({
        where: { order_id: BigInt(orderId) },
      });

      if (params.sentItems.length > 0) {
        await tx.order_items.createMany({
          data: params.sentItems.map((item) => ({
            order_id: BigInt(orderId),
            article_code: item.articleCode,
            description: item.name,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            modifiers: [],
            notes: item.notes,
          })),
        });
      }

      await tx.table_state.upsert({
        where: { table_id: params.tableId },
        update: {
          assigned_waiter_id: params.waiterId,
          assigned_waiter_name: params.waiterName,
          updated_at: new Date(),
        },
        create: {
          table_id: params.tableId,
          assigned_waiter_id: params.waiterId,
          assigned_waiter_name: params.waiterName,
          status: "normal",
          pending_items: "[]",
          sent_items: "[]",
          updated_at: new Date(),
        },
      });
    });

    await syncTableState(orderId);
    return orderId;
  }
}
