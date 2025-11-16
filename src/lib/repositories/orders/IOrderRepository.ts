import { KitchenOrder, KitchenOrderStatus } from "@/lib/db/orders"; // Reutilizar tipos existentes

// Definir interfaces locales para Order y OrderItem
export interface Order {
  id: number;
  order_code: string;
  table_id: string | null;
  waiter_code: string | null;
  waiter_name: string | null;
  guests: number | null;
  status: KitchenOrderStatus;
  opened_at: Date;
  closed_at: Date | null;
  notes: string | null;
}

export type OrderStatus = "normal" | "facturado" | "anulado";

export interface OrderItem {
  id: number;
  order_id: number;
  article_code: string;
  description: string;
  quantity: number;
  unit_price: number;
  modifiers: string[] | null;
  notes: string | null;
}

export interface IOrderRepository {
  listOpenOrders(): Promise<KitchenOrder[]>;
  createOrder(input: {
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
  }): Promise<number>;
  addOrderItem(
    orderId: number,
    input: {
      articleCode: string;
      name: string;
      unitPrice: number;
      quantity: number;
      modifiers?: string[];
      notes?: string | null;
    }
  ): Promise<void>;
  updateOrderItem(
    orderId: number,
    itemId: number,
    updates: Partial<{
      quantity: number;
      unitPrice: number;
      modifiers: string[];
      notes: string | null;
    }>
  ): Promise<void>;
  removeOrderItem(orderId: number, itemId: number): Promise<void>;
  updateOrderNotes(orderId: number, notes: string | null): Promise<void>;
  updateOrderGuests(orderId: number, guests: number | null): Promise<void>;
  markOrderAsInvoiced(orderId: number, invoiceDate: Date): Promise<void>;
  cancelOrder(orderId: number): Promise<void>;
  syncWaiterOrderForTable(params: {
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
  }): Promise<number | null>;
}
