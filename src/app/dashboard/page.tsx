import { env } from "@/lib/env";
import DashboardClient from "./dashboard-client";
import { getDashboardSnapshot, type DashboardSnapshot } from "@/lib/db/dashboard";

const longDateFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const MOCK_SNAPSHOT: DashboardSnapshot = {
  summary: {
    totalSales: 21874.8,
    invoices: 132,
    cfdi: 118,
    simplified: 14,
    openingTime: "08:00",
    openedBy: "Laura G.",
    closingTime: "23:00",
    closingSupervisor: "Javier R.",
    cashOnHand: 5630.4,
  },
  tableStatus: { occupied: 18, available: 9, reserved: 4, total: 31 },
  topProducts: [
    { name: "Flat white 12oz", category: "Bebidas", units: 96, revenue: 13440 },
    { name: "Croissant almendrado", category: "Panadería", units: 88, revenue: 9240 },
    { name: "Ensalada mediterránea", category: "Cocina fría", units: 74, revenue: 19620 },
    { name: "Pasta al pesto", category: "Cocina caliente", units: 65, revenue: 25350 },
    { name: "Cheesecake frutos rojos", category: "Postres", units: 58, revenue: 14500 },
    { name: "Latte de avena", category: "Bebidas", units: 54, revenue: 7020 },
    { name: "Chilaquiles verdes", category: "Desayunos", units: 48, revenue: 11040 },
    { name: "Sándwich caprese", category: "Cocina fría", units: 46, revenue: 9200 },
    { name: "Té matcha frío", category: "Bebidas", units: 42, revenue: 5880 },
    { name: "Brownie de cacao", category: "Postres", units: 38, revenue: 5700 },
  ],
  lowInventory: [
    {
      articleCode: "QUESO-BURRATA",
      articleName: "Queso burrata",
      warehouseName: "Almacén principal",
      availableRetail: 6,
      availableStorage: 0.6,
      unit: "pz",
    },
    {
      articleCode: "HARINA-INTEGRAL",
      articleName: "Harina integral",
      warehouseName: "Bodega seca",
      availableRetail: 18,
      availableStorage: 18,
      unit: "kg",
    },
    {
      articleCode: "VINO-ROSADO",
      articleName: "Vino rosado reserva",
      warehouseName: "Cava",
      availableRetail: 9,
      availableStorage: 9,
      unit: "bot",
    },
    {
      articleCode: "HOJAS-MIX",
      articleName: "Hojas verdes mix",
      warehouseName: "Cámara fría",
      availableRetail: 5,
      availableStorage: 5,
      unit: "kg",
    },
  ],
  waiterSales: [
    { waiter: "María P.", tickets: 21, revenue: 6540, avgTicket: 311 },
    { waiter: "Jorge M.", tickets: 18, revenue: 5980, avgTicket: 332 },
    { waiter: "Daniela R.", tickets: 16, revenue: 5725, avgTicket: 358 },
    { waiter: "Luis C.", tickets: 14, revenue: 4340, avgTicket: 310 },
    { waiter: "Andrea T.", tickets: 13, revenue: 4120, avgTicket: 317 },
  ],
};

export default async function DashboardPage() {
  const today = new Date();
  const todayLabel = longDateFormatter.format(today);
  const dateString = today.toISOString().slice(0, 10);

  const snapshot = env.useMockData ? MOCK_SNAPSHOT : await getDashboardSnapshot(dateString);

  return (
    <DashboardClient
      todayLabel={todayLabel}
      summary={snapshot.summary}
      tableStatus={snapshot.tableStatus}
      topProducts={snapshot.topProducts}
      lowInventory={snapshot.lowInventory}
      waiterSales={snapshot.waiterSales}
    />
  );
}
