export type OrderLine = {
  articleCode: string;
  name: string;
  unitPrice: number | null;
  quantity: number;
  notes?: string;
};

export type OrderStatus = "normal" | "facturado" | "anulado";
