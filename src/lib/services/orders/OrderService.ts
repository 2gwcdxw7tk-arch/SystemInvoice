import { env } from "@/lib/env";
import { IOrderRepository, OrderStatus } from "@/lib/repositories/orders/IOrderRepository";
import { OrderRepository } from "@/lib/repositories/orders/OrderRepository";
import { KitchenOrder, KitchenOrderItem, KitchenOrderStatus } from "@/lib/db/orders"; // Reutilizar tipos existentes
import { setTableOrderStatus } from "@/lib/db/tables"; // Mantener por ahora para la lógica MOCK

// Definir OrderLine localmente
type OrderLine = {
  articleCode: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string | null; // Permitir null o undefined
};

// Mock stores (copia de src/lib/db/orders.ts para el modo MOCK)
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

export class OrderService {
  private orderRepository: IOrderRepository;

  constructor(orderRepository: IOrderRepository = new OrderRepository()) {
    this.orderRepository = orderRepository;
  }

  async listOpenOrders(): Promise<KitchenOrder[]> {
    if (env.useMockData) {
      return mockOrders.filter((order) => order.status === "OPEN");
    }
    return this.orderRepository.listOpenOrders();
  }

  async createOrder(input: {
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
          await this.addOrderItem(order.id, item); // Usar el método del servicio
        }
      }
      syncMockTableState(order);
      return order.id;
    }
    return this.orderRepository.createOrder(input);
  }

  async addOrderItem(orderId: number, input: MockOrderItemInput): Promise<void> {
    if (!input.articleCode || !input.name) {
      throw new Error("El artículo necesita código y nombre");
    }
    if (input.quantity <= 0) {
      throw new Error("La cantidad debe ser mayor a cero");
    }

    if (env.useMockData) {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
      }
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
    return this.orderRepository.addOrderItem(orderId, input);
  }

  async updateOrderItem(
    orderId: number,
    itemId: number,
    updates: Partial<Pick<MockOrderItemInput, "quantity" | "unitPrice" | "modifiers" | "notes">>
  ): Promise<void> {
    if (env.useMockData) {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
      }
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
    return this.orderRepository.updateOrderItem(orderId, itemId, updates);
  }

  async removeOrderItem(orderId: number, itemId: number): Promise<void> {
    if (env.useMockData) {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
      }
      order.items = order.items.filter((item) => item.id !== itemId);
      syncMockTableState(order);
      return;
    }
    return this.orderRepository.removeOrderItem(orderId, itemId);
  }

  async updateOrderNotes(orderId: number, notes: string | null): Promise<void> {
    if (env.useMockData) {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
      }
      order.notes = notes;
      syncMockTableState(order);
      return;
    }
    return this.orderRepository.updateOrderNotes(orderId, notes);
  }

  async updateOrderGuests(orderId: number, guests: number | null): Promise<void> {
    if (env.useMockData) {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
      }
      order.guests = guests;
      syncMockTableState(order);
      return;
    }
    return this.orderRepository.updateOrderGuests(orderId, guests);
  }

  async markOrderAsInvoiced(orderId: number, invoiceDate: Date): Promise<void> {
    if (env.useMockData) {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
      }
      order.status = "INVOICED";
      order.closedAt = invoiceDate.toISOString();
      syncMockTableState(order);
      if (order.tableId) {
        await setTableOrderStatus(order.tableId, "facturado");
      }
      return;
    }
    return this.orderRepository.markOrderAsInvoiced(orderId, invoiceDate);
  }

  async cancelOrder(orderId: number): Promise<void> {
    if (env.useMockData) {
      const order = mockOrders.find((item) => item.id === orderId);
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado en modo mock`);
      }
      order.status = "CANCELLED";
      order.closedAt = new Date().toISOString();
      syncMockTableState(order);
      if (order.tableId) {
        await setTableOrderStatus(order.tableId, "anulado");
      }
      return;
    }
    return this.orderRepository.cancelOrder(orderId);
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
    const normalizedCode = sanitizeWaiterField(params.waiterCode);
    const normalizedName = sanitizeWaiterField(params.waiterName);
    const items = normalizeWaiterSyncItems(params.sentItems);

    if (env.useMockData) {
      const existing = mockOrders.find((order) => order.tableId === params.tableId && order.status === "OPEN");
      if (!existing) {
        if (items.length === 0) {
          return null;
        }
        return await this.createOrder({ // Usar el método del servicio
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
    return this.orderRepository.syncWaiterOrderForTable(params);
  }
}
