import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import type { PoolClient } from "@/lib/db/postgres";
import { query, withTransaction } from "@/lib/db/postgres";
import { setTableOrderStatus } from "@/lib/services/TableService";
import type { OrderLine, OrderStatus } from "@/lib/orders/types";

export type KitchenOrderStatus = "OPEN" | "CANCELLED" | "INVOICED";

export type KitchenOrderItem = {
  id: number;
  articleCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: string[];
  notes?: string | null;
};

export type KitchenOrder = {
  id: number;
  orderCode: string;
  tableId: string | null;
  tableLabel: string | null;
  waiterCode: string | null;
  waiterName: string | null;
  guests: number | null;
  status: KitchenOrderStatus;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  items: KitchenOrderItem[];
};

type OrderRow = {
  id: number;
  order_code: string;
  table_id: string | null;
  table_label: string | null;
  waiter_code: string | null;
  waiter_name: string | null;
  guests: number | null;
  status: KitchenOrderStatus;
  opened_at: Date | string;
  closed_at: Date | string | null;
  notes: string | null;
};

type OrderItemRow = {
  id: number;
  order_id: number;
  article_code: string;
  description: string;
  quantity: number;
  unit_price: number;
  modifiers: unknown | null;
  notes: string | null;
};

type SyncContext = {
  client: PoolClient;
  orderId: number;
};

type MockOrder = KitchenOrder;

type MockOrderItemInput = {
  articleCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifiers?: string[];
  notes?: string | null;
};

const mockOrders: MockOrder[] = [
  {
    id: 1,
    orderCode: "ORD-0001",
    tableId: "mesa-1",
    tableLabel: "Mesa 1",
    waiterCode: "MESERO-001",
    waiterName: "Luis García",
    guests: 2,
    status: "OPEN",
    openedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    closedAt: null,
    notes: "Sin cebolla en la hamburguesa",
    items: [
      {
        id: 1,
        articleCode: "HAMB-001",
        name: "Hamburguesa Especial",
        quantity: 2,
        unitPrice: 140,
        modifiers: ["Queso extra", "Sin cebolla"],
      },
      {
        id: 2,
        articleCode: "BEB-002",
        name: "Limonada Natural",
        quantity: 2,
        unitPrice: 45,
        modifiers: [],
      },
    ],
  },
  {
    id: 2,
    orderCode: "ORD-0002",
    tableId: "mesa-2",
    tableLabel: "Mesa 2",
    waiterCode: "MESERO-003",
    waiterName: "Ana Martínez",
    guests: 4,
    status: "OPEN",
    openedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    closedAt: null,
    notes: "Mesa en celebración de cumpleaños",
    items: [
      {
        id: 3,
        articleCode: "PIZ-001",
        name: "Pizza Margarita",
        quantity: 1,
        unitPrice: 180,
        modifiers: ["Extra queso"],
      },
      {
        id: 4,
        articleCode: "BEB-001",
        name: "Refresco",
        quantity: 4,
        unitPrice: 35,
        modifiers: [],
      },
    ],
  },
];

let mockAutoIncrement = mockOrders.reduce((acc, order) => Math.max(acc, order.id), 0);
let mockItemAutoIncrement = mockOrders.reduce(
  (acc, order) => Math.max(acc, ...order.items.map((item) => item.id)),
  0
);

function toOrderLine(item: KitchenOrderItem): OrderLine {
  return {
    articleCode: item.articleCode,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    notes: item.notes ?? undefined,
  } as OrderLine;
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapOrderRow(row: OrderRow, items: OrderItemRow[]): KitchenOrder {
  return {
    id: row.id,
    orderCode: row.order_code,
    tableId: row.table_id,
    tableLabel: row.table_label,
    waiterCode: row.waiter_code,
    waiterName: row.waiter_name,
    guests: row.guests,
    status: row.status,
    openedAt: toIsoString(row.opened_at) ?? new Date().toISOString(),
    closedAt: toIsoString(row.closed_at),
    notes: row.notes,
    items: items.map((item) => {
      const mapped: KitchenOrderItem = {
        id: item.id,
        articleCode: item.article_code,
        name: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        modifiers: Array.isArray(item.modifiers)
          ? (item.modifiers.filter((value): value is string => typeof value === "string"))
          : [],
        notes: item.notes,
      };
      return mapped;
    }),
  } as KitchenOrder;
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

async function syncTableState({ client, orderId }: SyncContext): Promise<void> {
  const orderResult = await client.query<OrderRow>(
    `SELECT o.id,
            o.order_code,
            o.table_id,
            t.label AS table_label,
            o.waiter_code,
            o.waiter_name,
            o.guests,
            o.status,
            o.opened_at,
            o.closed_at,
            o.notes
       FROM app.orders o
  LEFT JOIN app.tables t ON t.id = o.table_id
      WHERE o.id = $1`,
    [orderId]
  );

  const order = orderResult.rows[0];
  if (!order?.table_id) {
    return;
  }

  const itemsResult = await client.query<OrderItemRow>(
    `SELECT id,
            order_id,
            article_code,
            description,
            quantity,
            unit_price,
            modifiers,
            notes
       FROM app.order_items
      WHERE order_id = $1
   ORDER BY id`,
    [orderId]
  );

  const orderLines: OrderLine[] = itemsResult.rows.map((item) => toOrderLine({
    id: item.id,
    articleCode: item.article_code,
    name: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    modifiers: [],
    notes: item.notes,
  }));

  const statusForTable = mapStatusToTable(order.status);
  const serialized = JSON.stringify(orderLines);

  await client.query(
    `INSERT INTO app.table_state (table_id, assigned_waiter_id, assigned_waiter_name, status, pending_items, sent_items)
     VALUES ($1, NULL, $2, $3, '[]', $4)
     ON CONFLICT (table_id)
     DO UPDATE SET
       assigned_waiter_id = EXCLUDED.assigned_waiter_id,
       assigned_waiter_name = EXCLUDED.assigned_waiter_name,
       status = EXCLUDED.status,
       pending_items = EXCLUDED.pending_items,
       sent_items = EXCLUDED.sent_items`,
    [order.table_id, order.waiter_name, statusForTable, serialized]
  );
}

function syncMockTableState(order: MockOrder): void {
  if (!order.tableId) {
    return;
  }
  const status = mapStatusToTable(order.status);
  const orderLines = order.items.map(toOrderLine);
  const payload = JSON.stringify(orderLines);
  // reutilizar setTableOrderStatus para mantener consistencia en la capa mock
  void setTableOrderStatus(order.tableId, status).catch((error) => {
    console.warn("No se pudo sincronizar el estado de la mesa en mock", error);
  });
  // No podemos escribir en table_state mock directamente desde aquí, los módulos mock usan mapas internos.
  // Este bloque mantiene el side effect pero ignora errores para no interrumpir pruebas locales.
  void payload;
}

function sanitizeWaiterField(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeWaiterSyncItems(items: OrderLine[]): Array<{
  articleCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
}> {
  return items.map((line) => ({
    articleCode: line.articleCode,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice ?? 0,
    notes: line.notes ?? null,
  }));
}

export async function syncWaiterOrderForTable(params: {
  tableId: string;
  waiterId: number | null;
  waiterCode: string | null;
  waiterName: string | null;
  sentItems: OrderLine[];
}): Promise<number | null> {
  const normalizedCode = sanitizeWaiterField(params.waiterCode);
  const normalizedName = sanitizeWaiterField(params.waiterName);
  const items = normalizeWaiterSyncItems(params.sentItems);

  if (env.useMockData) {
    const existing = mockOrders.find((order) => order.tableId === params.tableId && order.status === "OPEN");
    if (!existing) {
      if (items.length === 0) {
        return null;
      }
      return await createOrder({
        tableId: params.tableId,
        waiterCode: normalizedCode,
        waiterName: normalizedName,
        guests: null,
        notes: null,
        items: items.map((item) => ({
          articleCode: item.articleCode,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          modifiers: [],
          notes: item.notes,
        })),
      });
    }

    existing.waiterCode = normalizedCode ?? existing.waiterCode;
    existing.waiterName = normalizedName ?? existing.waiterName;
    existing.items = items.map((item) => ({
      id: ++mockItemAutoIncrement,
      articleCode: item.articleCode,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      modifiers: [],
      notes: item.notes,
    }));
    syncMockTableState(existing);
    return existing.id;
  }

  const existing = await query<{ id: number }>(
    `SELECT id FROM app.orders WHERE table_id = $1 AND status = 'OPEN' ORDER BY opened_at ASC LIMIT 1`,
    [params.tableId]
  );

  const orderId = existing.rows[0]?.id ?? null;
  if (!orderId) {
    if (items.length === 0) {
      return null;
    }
    const newOrderId = await createOrder({
      tableId: params.tableId,
      waiterCode: normalizedCode,
      waiterName: normalizedName,
      guests: null,
      notes: null,
      items: items.map((item) => ({
        articleCode: item.articleCode,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        modifiers: [],
        notes: item.notes,
      })),
    });

    await query(
      `UPDATE app.table_state
          SET assigned_waiter_id = $2,
              assigned_waiter_name = COALESCE($3, assigned_waiter_name),
              updated_at = NOW()
        WHERE table_id = $1`,
      [params.tableId, params.waiterId ?? null, normalizedName]
    );

    return newOrderId;
  }

  await withTransaction(async (client) => {
    await client.query(`UPDATE app.orders SET waiter_code = $2, waiter_name = $3 WHERE id = $1`, [orderId, normalizedCode, normalizedName]);
    await client.query(`DELETE FROM app.order_items WHERE order_id = $1`, [orderId]);

    if (items.length > 0) {
      for (const item of items) {
        await client.query(
          `INSERT INTO app.order_items (order_id, article_code, description, quantity, unit_price, modifiers, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [orderId, item.articleCode, item.name, item.quantity, item.unitPrice, "[]", item.notes]
        );
      }
    }

    await syncTableState({ client, orderId });

    await client.query(
      `UPDATE app.table_state
          SET assigned_waiter_id = $2,
              assigned_waiter_name = COALESCE($3, assigned_waiter_name),
              updated_at = NOW()
        WHERE table_id = $1`,
      [params.tableId, params.waiterId ?? null, normalizedName]
    );
  });
  return orderId;
}

function ensureMockOrder(orderId: number): MockOrder {
  const order = mockOrders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
  }
  return order;
}

export async function listOpenOrders(): Promise<KitchenOrder[]> {
  if (env.useMockData) {
    return mockOrders.filter((order) => order.status === "OPEN");
  }

  const ordersResult = await query<OrderRow>(
    `SELECT o.id,
            o.order_code,
            o.table_id,
            t.label AS table_label,
            o.waiter_code,
            o.waiter_name,
            o.guests,
            o.status,
            o.opened_at,
            o.closed_at,
            o.notes
       FROM app.orders o
  LEFT JOIN app.tables t ON t.id = o.table_id
      WHERE o.status = 'OPEN'
   ORDER BY o.opened_at ASC`
  );

  if (ordersResult.rowCount === 0) {
    return [];
  }

  const orderIds = ordersResult.rows.map((row) => row.id);
  const itemsResult = await query<OrderItemRow>(
    `SELECT id,
            order_id,
            article_code,
            description,
            quantity,
            unit_price,
            modifiers,
            notes
       FROM app.order_items
      WHERE order_id = ANY($1::bigint[])
   ORDER BY order_id, id`,
    [orderIds]
  );

  return ordersResult.rows.map((row) => {
    const orderItems = itemsResult.rows.filter((item) => item.order_id === row.id);
    return mapOrderRow(row, orderItems);
  });
}

export async function addOrderItem(orderId: number, input: MockOrderItemInput): Promise<void> {
  if (!input.articleCode || !input.name) {
    throw new Error("El artículo necesita código y nombre");
  }
  if (input.quantity <= 0) {
    throw new Error("La cantidad debe ser mayor a cero");
  }

  if (env.useMockData) {
    const order = ensureMockOrder(orderId);
    mockItemAutoIncrement += 1;
    order.items.push({
      id: mockItemAutoIncrement,
      articleCode: input.articleCode,
      name: input.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      modifiers: input.modifiers ?? [],
      notes: input.notes ?? null,
    });
    syncMockTableState(order);
    return;
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO app.order_items (order_id, article_code, description, quantity, unit_price, modifiers, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, input.articleCode, input.name, input.quantity, input.unitPrice, JSON.stringify(input.modifiers ?? []), input.notes ?? null]
    );

    await syncTableState({ client, orderId });
  });
}

export async function updateOrderItem(
  orderId: number,
  itemId: number,
  updates: Partial<Pick<MockOrderItemInput, "quantity" | "unitPrice" | "modifiers" | "notes">>
): Promise<void> {
  if (env.useMockData) {
    const order = ensureMockOrder(orderId);
    const item = order.items.find((record) => record.id === itemId);
    if (!item) {
      throw new Error("Artículo no encontrado en el pedido (mock)");
    }
    if (updates.quantity !== undefined) {
      if (updates.quantity <= 0) {
        throw new Error("La cantidad debe ser mayor a cero");
      }
      item.quantity = updates.quantity;
    }
    if (updates.unitPrice !== undefined) {
      item.unitPrice = updates.unitPrice;
    }
    if (updates.modifiers) {
      item.modifiers = [...updates.modifiers];
    }
    if (updates.notes !== undefined) {
      item.notes = updates.notes;
    }
    syncMockTableState(order);
    return;
  }

  await withTransaction(async (client) => {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.quantity !== undefined) {
      fields.push(`quantity = $${fields.length + 2}`);
      values.push(updates.quantity);
    }
    if (updates.unitPrice !== undefined) {
      fields.push(`unit_price = $${fields.length + 2}`);
      values.push(updates.unitPrice);
    }
    if (updates.modifiers !== undefined) {
      fields.push(`modifiers = $${fields.length + 2}`);
      values.push(JSON.stringify(updates.modifiers));
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${fields.length + 2}`);
      values.push(updates.notes);
    }

    if (fields.length === 0) {
      return;
    }

    await client.query(
      `UPDATE app.order_items
          SET ${fields.join(", ")}
        WHERE id = $1 AND order_id = $${fields.length + 2}`,
      [itemId, ...values, orderId]
    );

    await syncTableState({ client, orderId });
  });
}

export async function removeOrderItem(orderId: number, itemId: number): Promise<void> {
  if (env.useMockData) {
    const order = ensureMockOrder(orderId);
    order.items = order.items.filter((item) => item.id !== itemId);
    syncMockTableState(order);
    return;
  }

  await withTransaction(async (client) => {
    await client.query(`DELETE FROM app.order_items WHERE id = $1 AND order_id = $2`, [itemId, orderId]);
    await syncTableState({ client, orderId });
  });
}

export async function updateOrderNotes(orderId: number, notes: string | null): Promise<void> {
  if (env.useMockData) {
    const order = ensureMockOrder(orderId);
    order.notes = notes;
    syncMockTableState(order);
    return;
  }

  await withTransaction(async (client) => {
    await client.query(`UPDATE app.orders SET notes = $2 WHERE id = $1`, [orderId, notes]);
    await syncTableState({ client, orderId });
  });
}

export async function updateOrderGuests(orderId: number, guests: number | null): Promise<void> {
  if (env.useMockData) {
    const order = ensureMockOrder(orderId);
    order.guests = guests;
    syncMockTableState(order);
    return;
  }

  await withTransaction(async (client) => {
    await client.query(`UPDATE app.orders SET guests = $2 WHERE id = $1`, [orderId, guests]);
    await syncTableState({ client, orderId });
  });
}

export async function markOrderAsInvoiced(orderId: number, invoiceDate: Date): Promise<void> {
  if (env.useMockData) {
    const order = ensureMockOrder(orderId);
    order.status = "INVOICED";
    order.closedAt = invoiceDate.toISOString();
    syncMockTableState(order);
    if (order.tableId) {
      await setTableOrderStatus(order.tableId, "facturado");
    }
    return;
  }

  let tableId: string | null = null;
  await withTransaction(async (client) => {
    const result = await client.query<{ table_id: string | null }>(
      `UPDATE app.orders
          SET status = 'INVOICED',
              closed_at = $2
        WHERE id = $1
    RETURNING table_id`,
      [orderId, invoiceDate]
    );

    tableId = result.rows[0]?.table_id ?? null;
    await syncTableState({ client, orderId });
  });

  if (tableId) {
    await setTableOrderStatus(tableId, "facturado");
  }
}

export async function cancelOrder(orderId: number): Promise<void> {
  if (env.useMockData) {
    const order = ensureMockOrder(orderId);
    order.status = "CANCELLED";
    order.closedAt = new Date().toISOString();
    syncMockTableState(order);
    if (order.tableId) {
      await setTableOrderStatus(order.tableId, "anulado");
    }
    return;
  }

  let tableId: string | null = null;
  await withTransaction(async (client) => {
    const result = await client.query<{ table_id: string | null }>(
      `UPDATE app.orders
          SET status = 'CANCELLED',
              closed_at = CURRENT_TIMESTAMP
        WHERE id = $1
    RETURNING table_id`,
      [orderId]
    );
    tableId = result.rows[0]?.table_id ?? null;
    await syncTableState({ client, orderId });
  });

  if (tableId) {
    await setTableOrderStatus(tableId, "anulado");
  }
}

export async function createOrder(input: {
  tableId: string | null;
  waiterCode: string | null;
  waiterName: string | null;
  guests: number | null;
  notes?: string | null;
  items?: MockOrderItemInput[];
}): Promise<number> {
  if (env.useMockData) {
    mockAutoIncrement += 1;
    const order: MockOrder = {
      id: mockAutoIncrement,
      orderCode: `ORD-${String(mockAutoIncrement).padStart(4, "0")}`,
      tableId: input.tableId,
      tableLabel: input.tableId,
      waiterCode: input.waiterCode,
      waiterName: input.waiterName,
      guests: input.guests ?? null,
      status: "OPEN",
      openedAt: new Date().toISOString(),
      closedAt: null,
      notes: input.notes ?? null,
      items: [],
    };
    mockOrders.push(order);
    if (input.items?.length) {
      for (const item of input.items) {
        await addOrderItem(order.id, item);
      }
    }
    syncMockTableState(order);
    return order.id;
  }

  return withTransaction(async (client) => {
    const orderCode = `ORD-${randomUUID().slice(0, 8).toUpperCase()}`;
    const orderResult = await client.query<{ id: number }>(
      `INSERT INTO app.orders (order_code, table_id, waiter_code, waiter_name, guests, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id`,
      [orderCode, input.tableId, input.waiterCode, input.waiterName, input.guests, input.notes ?? null]
    );
    const orderId = orderResult.rows[0]?.id;
    if (!orderId) {
      throw new Error("No se pudo crear el pedido");
    }

    if (input.items?.length) {
      for (const item of input.items) {
        await client.query(
          `INSERT INTO app.order_items (order_id, article_code, description, quantity, unit_price, modifiers, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [orderId, item.articleCode, item.name, item.quantity, item.unitPrice, JSON.stringify(item.modifiers ?? []), item.notes ?? null]
        );
      }
    }

    await syncTableState({ client, orderId });
    return orderId;
  });
}
