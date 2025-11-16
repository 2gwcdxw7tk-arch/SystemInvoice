"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileBarChart, Loader2, RefreshCw, Search, ShieldQuestion, Table2, TrendingUp, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/config/currency";
import type {
  InventoryMovementsResult,
  InventoryMovementsSummaryRow,
  InvoiceStatusResult,
  PurchasesReportRow,
  SalesSummaryResult,
  TopItemRow,
  WaiterPerformanceRow,
} from "@/lib/db/reports";

type FetchState<T> = {
  loading: boolean;
  data: T | null;
};

type ReportId = "sales" | "waiters" | "topItems" | "inventory" | "purchases" | "invoiceStatus";

type ArticlePickerOption = {
  code: string;
  name: string;
  storageUnit?: string | null;
  retailUnit?: string | null;
};

type WarehouseOption = {
  code: string;
  name: string;
};

const reportOptions: Array<{ id: ReportId; label: string; description: string }> = [
  {
    id: "sales",
    label: "Ventas consolidadas",
    description: "Totales de facturación y distribución por método de pago.",
  },
  {
    id: "waiters",
    label: "Desempeño de meseros",
    description: "Ventas, tickets y propinas por mesero.",
  },
  {
    id: "topItems",
    label: "Artículos más vendidos",
    description: "Ranking de productos por cantidad y monto vendido.",
  },
  {
    id: "inventory",
    label: "Movimientos de inventario",
    description: "Entradas y salidas netas por tipo de movimiento.",
  },
  {
    id: "purchases",
    label: "Compras a proveedores",
    description: "Montos, estatus y últimas compras por proveedor.",
  },
  {
    id: "invoiceStatus",
    label: "Estado de facturación",
    description: "Seguimiento de cobranza y saldos pendientes.",
  },
];

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
const datetimeFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const numberFormatter = new Intl.NumberFormat("es-MX");

const transactionTypeLabels: Record<string, string> = {
  PURCHASE: "Compras",
  CONSUMPTION: "Consumos",
  TRANSFER: "Traspasos",
  ADJUSTMENT: "Ajustes",
  SALE_RETURN: "Devoluciones",
  INITIAL_BALANCE: "Saldo inicial",
  PRODUCTION: "Producción",
};

function normalizeForLookup(value: string): string {
  return value
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");
}

const paymentMethodCatalog = [
  { code: "CASH", label: "Efectivo", terms: ["CASH", "EFECTIVO"] },
  { code: "CARD", label: "Tarjeta", terms: ["CARD", "TARJETA"] },
  { code: "CREDIT_CARD", label: "Tarjeta de crédito", terms: ["CREDIT CARD", "TARJETA DE CRÉDITO", "TARJETA DE CREDITO"] },
  { code: "DEBIT_CARD", label: "Tarjeta de débito", terms: ["DEBIT CARD", "TARJETA DE DÉBITO", "TARJETA DE DEBITO"] },
  { code: "TRANSFER", label: "Transferencia", terms: ["TRANSFER", "TRANSFERENCIA", "TRANSFERENCIAS"] },
  { code: "BANK_TRANSFER", label: "Transferencia bancaria", terms: ["BANK TRANSFER", "TRANSFERENCIA BANCARIA"] },
  { code: "WIRE", label: "Transferencia", terms: ["WIRE", "WIRE TRANSFER"] },
  { code: "DEPOSIT", label: "Depósito", terms: ["DEPOSIT", "DEPÓSITO", "DEPOSITO"] },
  { code: "CHECK", label: "Cheque", terms: ["CHECK", "CHEQUE"] },
  { code: "VOUCHER", label: "Vale", terms: ["VOUCHER", "VALE"] },
  { code: "COUPON", label: "Cupón", terms: ["COUPON", "CUPÓN", "CUPON"] },
  { code: "MOBILE", label: "Pago móvil", terms: ["MOBILE", "PAGO MÓVIL", "PAGO MOVIL", "MOVIL", "MÓVIL"] },
  { code: "ONLINE", label: "Pago en línea", terms: ["ONLINE", "PAGO EN LÍNEA", "PAGO EN LINEA"] },
  { code: "OTHER", label: "Otro", terms: ["OTHER", "OTRO", "OTROS", "OTRA"] },
  { code: "CASHLESS", label: "Sin efectivo", terms: ["CASHLESS", "SIN EFECTIVO"] },
];

const paymentMethodLabels = paymentMethodCatalog.reduce<Record<string, string>>((acc, item) => {
  acc[item.code] = item.label;
  return acc;
}, {});

const paymentMethodLookup = paymentMethodCatalog.reduce<Record<string, string>>((acc, item) => {
  item.terms.forEach((term) => {
    acc[normalizeForLookup(term)] = item.code;
  });
  return acc;
}, {});

const paymentMethodSegmentTranslations: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  CREDIT: "Crédito",
  DEBIT: "Débito",
  TRANSFER: "Transferencia",
  BANK: "Bancaria",
  WIRE: "Transferencia",
  OTHER: "Otro",
  PAYMENT: "Pago",
  PAYMENTS: "Pagos",
  MOBILE: "Móvil",
  ONLINE: "En línea",
  DIGITAL: "Digital",
  CHECK: "Cheque",
  CHEQUE: "Cheque",
  VOUCHER: "Vale",
  COUPON: "Cupón",
  GIFT: "Regalo",
  CARDHOLDER: "Tarjetahabiente",
  WALLET: "Billetera",
  CASHLESS: "Sin efectivo",
  MANUAL: "Manual",
  STORE: "Tienda",
  POS: "POS",
};

const invoiceStatusLabels: Record<string, string> = {
  PAGADA: "Pagada",
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
  ANULADA: "Anulada",
  BORRADOR: "Borrador",
  EMITIDA: "Emitida",
  PROGRAMADA: "Programada",
  RECHAZADA: "Rechazada",
};

function translateTransactionType(value: string): string {
  if (!value) return "Otro movimiento";
  const normalized = value.toUpperCase();
  if (transactionTypeLabels[normalized]) return transactionTypeLabels[normalized];
  return "Otro movimiento";
}

function translatePaymentMethod(value: string): string {
  if (!value) return "Sin dato";
  const normalizedCode = value.toUpperCase();
  if (paymentMethodLabels[normalizedCode]) return paymentMethodLabels[normalizedCode];
  const lookupCode = paymentMethodLookup[normalizeForLookup(value)];
  if (lookupCode && paymentMethodLabels[lookupCode]) return paymentMethodLabels[lookupCode];
  const segments = normalizedCode.split(/[_\s]+/).filter(Boolean);
  const translatedSegments = segments
    .map((segment) => paymentMethodSegmentTranslations[segment] ?? "")
    .filter((segment) => segment.length > 0);
  if (translatedSegments.length > 0) {
    return translatedSegments.join(" ");
  }
  return "Método personalizado";
}

function mapPaymentMethodToQuery(value: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lookupCode = paymentMethodLookup[normalizeForLookup(trimmed)];
  if (lookupCode) return lookupCode;
  return trimmed.toUpperCase();
}

function translateInvoiceStatus(value: string): string {
  if (!value) return "Sin estatus";
  const normalized = value.toUpperCase();
  if (invoiceStatusLabels[normalized]) return invoiceStatusLabels[normalized];
  return "Estatus personalizado";
}

function todayISO(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function firstDayOfMonthISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-01`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return dateFormatter.format(date);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return datetimeFormatter.format(date);
}

function buildQuery(params: Record<string, string | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (!value) return;
    query.append(key, value);
  });
  return query.toString();
}

export default function ReportesPage() {
  const { toast } = useToast();
  const defaultFrom = useMemo(() => firstDayOfMonthISO(), []);
  const defaultTo = useMemo(() => todayISO(), []);

  const [activeReport, setActiveReport] = useState<ReportId>("sales");
  const [initialFetchMap, setInitialFetchMap] = useState<Record<ReportId, boolean>>({
    sales: false,
    waiters: false,
    topItems: false,
    inventory: false,
    purchases: false,
    invoiceStatus: false,
  });

  const [salesFilters, setSalesFilters] = useState({
    from: defaultFrom,
    to: defaultTo,
    waiterCode: "",
    tableCode: "",
    customer: "",
    paymentMethod: "",
    currency: "",
  });
  const [salesState, setSalesState] = useState<FetchState<SalesSummaryResult>>({ loading: false, data: null });

  const [waitersFilters, setWaitersFilters] = useState({
    from: defaultFrom,
    to: defaultTo,
    waiterCode: "",
  });
  const [waitersState, setWaitersState] = useState<FetchState<WaiterPerformanceRow[]>>({ loading: false, data: null });

  const [topItemsFilters, setTopItemsFilters] = useState({
    from: defaultFrom,
    to: defaultTo,
    search: "",
    limit: "15",
  });
  const [topItemsState, setTopItemsState] = useState<FetchState<TopItemRow[]>>({ loading: false, data: null });

  const [inventoryFilters, setInventoryFilters] = useState({
    from: defaultFrom,
    to: defaultTo,
    article: "",
    warehouse: "",
    transactionType: "",
  });
  const [inventoryState, setInventoryState] = useState<FetchState<InventoryMovementsResult>>({ loading: false, data: null });

  const [purchasesFilters, setPurchasesFilters] = useState({
    from: defaultFrom,
    to: defaultTo,
    supplier: "",
    status: "",
  });
  const [purchasesState, setPurchasesState] = useState<FetchState<PurchasesReportRow[]>>({ loading: false, data: null });

  const [invoiceStatusFilters, setInvoiceStatusFilters] = useState({
    from: defaultFrom,
    to: defaultTo,
    customer: "",
    waiterCode: "",
  });
  const [invoiceStatusState, setInvoiceStatusState] = useState<FetchState<InvoiceStatusResult>>({ loading: false, data: null });

  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  const [topItemsSelectedArticle, setTopItemsSelectedArticle] = useState<ArticlePickerOption | null>(null);
  const [inventorySelectedArticle, setInventorySelectedArticle] = useState<ArticlePickerOption | null>(null);

  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [articleModalTarget, setArticleModalTarget] = useState<"inventory" | "topItems" | null>(null);
  const [articleCatalog, setArticleCatalog] = useState<ArticlePickerOption[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articleSearchTerm, setArticleSearchTerm] = useState("");

  const fetchSalesSummary = useCallback(async () => {
    if (!salesFilters.from || !salesFilters.to) {
      toast({ variant: "warning", title: "Ventas", description: "Selecciona el rango de fechas" });
      return;
    }
    setSalesState((prev) => ({ ...prev, loading: true }));
    try {
      const query = buildQuery({
        from: salesFilters.from,
        to: salesFilters.to,
        waiter_code: salesFilters.waiterCode || undefined,
        table_code: salesFilters.tableCode || undefined,
        customer: salesFilters.customer || undefined,
        payment_method: mapPaymentMethodToQuery(salesFilters.paymentMethod),
        currency: salesFilters.currency || undefined,
      });
      const response = await fetch(`/api/reportes/ventas/resumen?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo consultar el reporte");
      setSalesState({ loading: false, data: payload.report as SalesSummaryResult });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo consultar el reporte";
      toast({ variant: "error", title: "Ventas", description: message });
      setSalesState({ loading: false, data: null });
    }
  }, [salesFilters, toast]);

  const fetchWaiterPerformance = useCallback(async () => {
    if (!waitersFilters.from || !waitersFilters.to) {
      toast({ variant: "warning", title: "Meseros", description: "Selecciona el rango de fechas" });
      return;
    }
    setWaitersState((prev) => ({ ...prev, loading: true }));
    try {
      const query = buildQuery({
        from: waitersFilters.from,
        to: waitersFilters.to,
        waiter_code: waitersFilters.waiterCode || undefined,
      });
      const response = await fetch(`/api/reportes/ventas/meseros?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo consultar el reporte");
      setWaitersState({ loading: false, data: payload.rows as WaiterPerformanceRow[] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo consultar el reporte";
      toast({ variant: "error", title: "Meseros", description: message });
      setWaitersState({ loading: false, data: null });
    }
  }, [waitersFilters, toast]);

  const fetchTopItems = useCallback(async () => {
    if (!topItemsFilters.from || !topItemsFilters.to) {
      toast({ variant: "warning", title: "Artículos", description: "Selecciona el rango de fechas" });
      return;
    }
    setTopItemsState((prev) => ({ ...prev, loading: true }));
    try {
      const query = buildQuery({
        from: topItemsFilters.from,
        to: topItemsFilters.to,
        search: topItemsFilters.search || undefined,
        limit: topItemsFilters.limit || undefined,
      });
      const response = await fetch(`/api/reportes/articulos/top?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo consultar el ranking");
      setTopItemsState({ loading: false, data: payload.rows as TopItemRow[] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo consultar el ranking";
      toast({ variant: "error", title: "Artículos", description: message });
      setTopItemsState({ loading: false, data: null });
    }
  }, [topItemsFilters, toast]);

  const fetchInventory = useCallback(async () => {
    if (!inventoryFilters.from || !inventoryFilters.to) {
      toast({ variant: "warning", title: "Inventario", description: "Selecciona el rango de fechas" });
      return;
    }
    setInventoryState((prev) => ({ ...prev, loading: true }));
    try {
      const query = buildQuery({
        from: inventoryFilters.from,
        to: inventoryFilters.to,
        article: inventoryFilters.article || undefined,
        warehouse: inventoryFilters.warehouse || undefined,
        transaction_type: inventoryFilters.transactionType || undefined,
      });
      const response = await fetch(`/api/reportes/inventario/movimientos?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudieron obtener los movimientos");
      setInventoryState({ loading: false, data: payload.report as InventoryMovementsResult });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron obtener los movimientos";
      toast({ variant: "error", title: "Inventario", description: message });
      setInventoryState({ loading: false, data: null });
    }
  }, [inventoryFilters, toast]);

  const fetchPurchases = useCallback(async () => {
    if (!purchasesFilters.from || !purchasesFilters.to) {
      toast({ variant: "warning", title: "Compras", description: "Selecciona el rango de fechas" });
      return;
    }
    setPurchasesState((prev) => ({ ...prev, loading: true }));
    try {
      const query = buildQuery({
        from: purchasesFilters.from,
        to: purchasesFilters.to,
        supplier: purchasesFilters.supplier || undefined,
        status: purchasesFilters.status || undefined,
      });
      const response = await fetch(`/api/reportes/compras?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo consultar el reporte de compras");
      setPurchasesState({ loading: false, data: payload.rows as PurchasesReportRow[] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo consultar el reporte de compras";
      toast({ variant: "error", title: "Compras", description: message });
      setPurchasesState({ loading: false, data: null });
    }
  }, [purchasesFilters, toast]);

  const fetchInvoiceStatus = useCallback(async () => {
    if (!invoiceStatusFilters.from || !invoiceStatusFilters.to) {
      toast({ variant: "warning", title: "Facturación", description: "Selecciona el rango de fechas" });
      return;
    }
    setInvoiceStatusState((prev) => ({ ...prev, loading: true }));
    try {
      const query = buildQuery({
        from: invoiceStatusFilters.from,
        to: invoiceStatusFilters.to,
        customer: invoiceStatusFilters.customer || undefined,
        waiter_code: invoiceStatusFilters.waiterCode || undefined,
      });
      const response = await fetch(`/api/reportes/facturacion/estatus?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message ?? "No se pudo consultar el estado de facturación");
      setInvoiceStatusState({ loading: false, data: payload.report as InvoiceStatusResult });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo consultar el estado de facturación";
      toast({ variant: "error", title: "Facturación", description: message });
      setInvoiceStatusState({ loading: false, data: null });
    }
  }, [invoiceStatusFilters, toast]);

  const loadWarehouses = useCallback(async () => {
    setWarehousesLoading(true);
    try {
      const response = await fetch("/api/inventario/warehouses", { cache: "no-store", credentials: "include" });
      if (!response.ok) throw new Error("No se pudieron obtener las bodegas disponibles");
      const payload = (await response.json()) as { items?: Array<{ code: string; name: string }> };
      const mapped: WarehouseOption[] = Array.isArray(payload.items)
        ? payload.items.map((item) => ({ code: item.code, name: item.name }))
        : [];
      setWarehouseOptions(mapped);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron obtener las bodegas disponibles";
      toast({ variant: "warning", title: "Bodegas", description: message });
    } finally {
      setWarehousesLoading(false);
    }
  }, [toast]);

  const loadArticles = useCallback(async () => {
    setArticlesLoading(true);
    try {
      const response = await fetch("/api/articulos", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo recuperar el catálogo de artículos");
      const payload = (await response.json()) as {
        items?: Array<{ article_code: string; name: string; storage_unit?: string | null; retail_unit?: string | null }>;
      };
      const mapped: ArticlePickerOption[] = Array.isArray(payload.items)
        ? payload.items.map((item) => ({
            code: item.article_code,
            name: item.name,
            storageUnit: item.storage_unit ?? null,
            retailUnit: item.retail_unit ?? null,
          }))
        : [];
      setArticleCatalog(mapped);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo recuperar el catálogo de artículos";
      toast({ variant: "warning", title: "Artículos", description: message });
    } finally {
      setArticlesLoading(false);
    }
  }, [toast]);

  const runFetch = useCallback(
    async (report: ReportId) => {
      switch (report) {
        case "sales":
          return fetchSalesSummary();
        case "waiters":
          return fetchWaiterPerformance();
        case "topItems":
          return fetchTopItems();
        case "inventory":
          return fetchInventory();
        case "purchases":
          return fetchPurchases();
        case "invoiceStatus":
          return fetchInvoiceStatus();
        default:
          return Promise.resolve();
      }
    },
    [
      fetchSalesSummary,
      fetchWaiterPerformance,
      fetchTopItems,
      fetchInventory,
      fetchPurchases,
      fetchInvoiceStatus,
    ]
  );

  const hasFetchedActiveReport = initialFetchMap[activeReport];

  useEffect(() => {
    if (hasFetchedActiveReport) return;
    setInitialFetchMap((prev) => ({ ...prev, [activeReport]: true }));
    void runFetch(activeReport);
  }, [activeReport, hasFetchedActiveReport, runFetch]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  const openArticleModal = useCallback(
    (target: "inventory" | "topItems") => {
      setArticleModalTarget(target);
      setArticleSearchTerm("");
      setArticleModalOpen(true);
      if (articleCatalog.length === 0 && !articlesLoading) {
        void loadArticles();
      }
    },
    [articleCatalog.length, articlesLoading, loadArticles]
  );

  const closeArticleModal = useCallback(() => {
    setArticleModalOpen(false);
    setArticleModalTarget(null);
    setArticleSearchTerm("");
  }, []);

  const handleArticleSelection = useCallback(
    (option: ArticlePickerOption) => {
      if (articleModalTarget === "inventory") {
        setInventorySelectedArticle(option);
        setInventoryFilters((prev) => ({ ...prev, article: option.code }));
      } else if (articleModalTarget === "topItems") {
        setTopItemsSelectedArticle(option);
        setTopItemsFilters((prev) => ({ ...prev, search: option.name }));
      }
      closeArticleModal();
    },
    [articleModalTarget, closeArticleModal, setInventoryFilters, setTopItemsFilters]
  );

  const paymentsTotal = useMemo(() => {
    if (!salesState.data?.payments) return 0;
    return salesState.data.payments.reduce((sum, row) => sum + row.amount, 0);
  }, [salesState.data]);

  const inventoryTotals = useMemo(() => {
    if (!inventoryState.data) return { entries: 0, exits: 0 };
    return inventoryState.data.summary.reduce(
      (acc, row) => ({
        entries: acc.entries + row.entriesRetail,
        exits: acc.exits + row.exitsRetail,
      }),
      { entries: 0, exits: 0 }
    );
  }, [inventoryState.data]);

  const inventoryStorageTotals = useMemo(() => {
    if (!inventoryState.data) return { entries: 0, exits: 0 };
    return inventoryState.data.summary.reduce(
      (acc, row) => ({
        entries: acc.entries + row.entriesStorage,
        exits: acc.exits + row.exitsStorage,
      }),
      { entries: 0, exits: 0 }
    );
  }, [inventoryState.data]);

  const inventoryVolumeTotal = useMemo(() => {
    if (!inventoryState.data) return 0;
    return inventoryState.data.summary.reduce((acc, row) => acc + Math.max(row.entriesRetail, 0) + Math.max(row.exitsRetail, 0), 0);
  }, [inventoryState.data]);

  const filteredArticleCatalog = useMemo(() => {
    const term = articleSearchTerm.trim().toLowerCase();
    if (!term) return articleCatalog;
    return articleCatalog.filter((item) =>
      item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)
    );
  }, [articleCatalog, articleSearchTerm]);

  const selectedArticleCode = useMemo(() => {
    if (articleModalTarget === "inventory") {
      return inventorySelectedArticle?.code || inventoryFilters.article || "";
    }
    if (articleModalTarget === "topItems") {
      return topItemsSelectedArticle?.code || "";
    }
    return "";
  }, [articleModalTarget, inventoryFilters.article, inventorySelectedArticle, topItemsSelectedArticle]);

  const reportComboboxOptions = useMemo(
    () =>
      reportOptions.map(
        ({ id, label, description }): ComboboxOption<ReportId> => ({
          value: id,
          label,
          description,
        })
      ),
    []
  );

  const warehouseComboboxOptions = useMemo<ComboboxOption<string>[]>(
    () =>
      warehouseOptions.map((option) => ({
        value: option.code,
        label: `${option.code} · ${option.name}`,
      })),
    [warehouseOptions]
  );

  const activeOption = useMemo(() => reportOptions.find((option) => option.id === activeReport) ?? reportOptions[0], [activeReport]);

  const articleModalDescription = useMemo(() => {
    if (articleModalTarget === "inventory") {
      return "Selecciona un artículo para filtrar los movimientos de inventario.";
    }
    if (articleModalTarget === "topItems") {
      return "Selecciona un artículo para refinar el ranking de ventas.";
    }
    return undefined;
  }, [articleModalTarget]);

  return (
  <section className="space-y-10 pb-16">
      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Reportería</h1>
          <p className="text-sm text-muted-foreground">
            Selecciona un reporte para consultar sus indicadores y filtra según el período o los criterios que necesites.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-3xl border border-dashed border-muted bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <Combobox<ReportId>
              value={activeReport}
              onChange={(next) => setActiveReport(next)}
              options={reportComboboxOptions}
              label="Reporte activo"
              placeholder="Selecciona un reporte"
              searchEnabled={false}
            />
          </div>
          <p className="text-sm text-muted-foreground sm:max-w-xl">{activeOption.description}</p>
        </div>
      </header>

      {activeReport === "sales" ? (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Ventas consolidadas</span>
            </div>
            <CardTitle className="text-xl">Resumen de ingresos</CardTitle>
            <CardDescription>
              Totales de facturación y desglose por método de pago. Las fechas son obligatorias; filtra además por mesero, mesa, cliente o moneda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
              <DatePicker value={salesFilters.from} onChange={(value) => setSalesFilters((prev) => ({ ...prev, from: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
              <DatePicker value={salesFilters.to} onChange={(value) => setSalesFilters((prev) => ({ ...prev, to: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Mesero</Label>
              <Input
                value={salesFilters.waiterCode}
                onChange={(event) => setSalesFilters((prev) => ({ ...prev, waiterCode: event.target.value.toUpperCase() }))}
                placeholder="Código de mesero"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Mesa / zona</Label>
              <Input
                value={salesFilters.tableCode}
                onChange={(event) => setSalesFilters((prev) => ({ ...prev, tableCode: event.target.value.toUpperCase() }))}
                placeholder="Código de mesa"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Cliente</Label>
              <Input
                value={salesFilters.customer}
                onChange={(event) => setSalesFilters((prev) => ({ ...prev, customer: event.target.value }))}
                placeholder="Nombre o RFC"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Método de pago</Label>
              <Input
                value={salesFilters.paymentMethod}
                onChange={(event) => setSalesFilters((prev) => ({ ...prev, paymentMethod: event.target.value.toUpperCase() }))}
                placeholder="EFECTIVO, TARJETA, TRANSFERENCIA..."
                className="rounded-2xl"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="rounded-2xl" onClick={() => void fetchSalesSummary()} disabled={salesState.loading}>
              {salesState.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar
            </Button>
            <Input
              value={salesFilters.currency}
              onChange={(event) => setSalesFilters((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
              placeholder="Código de moneda (opcional)"
              className="h-10 w-48 rounded-2xl"
            />
          </div>

          {salesState.data ? (
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="rounded-3xl bg-muted/40 p-5">
                <p className="text-xs uppercase text-muted-foreground">Ingresos</p>
                <p className="text-3xl font-semibold text-foreground">{formatCurrency(salesState.data.totals.total)}</p>
                <p className="text-xs text-muted-foreground">Ticket promedio: {formatCurrency(salesState.data.totals.averageTicket)}</p>
              </div>
              <div className="rounded-3xl bg-muted/40 p-5">
                <p className="text-xs uppercase text-muted-foreground">Facturas</p>
                <p className="text-3xl font-semibold text-foreground">{numberFormatter.format(salesState.data.totals.invoices)}</p>
                <p className="text-xs text-muted-foreground">Subtotal: {formatCurrency(salesState.data.totals.subtotal)}</p>
              </div>
              <div className="rounded-3xl bg-muted/40 p-5">
                <p className="text-xs uppercase text-muted-foreground">Servicio</p>
                <p className="text-3xl font-semibold text-foreground">{formatCurrency(salesState.data.totals.serviceCharge)}</p>
                <p className="text-xs text-muted-foreground">IVA: {formatCurrency(salesState.data.totals.vat)}</p>
              </div>
              <div className="rounded-3xl bg-muted/40 p-5">
                <p className="text-xs uppercase text-muted-foreground">Pagos registrados</p>
                <p className="text-3xl font-semibold text-foreground">{formatCurrency(paymentsTotal)}</p>
                <p className="text-xs text-muted-foreground">Distribución por método a continuación</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Ingresa un rango válido y consulta para ver resultados.</p>
          )}

          {salesState.data ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Método</th>
                    <th className="px-3 py-2">Monto</th>
                    <th className="px-3 py-2">Participación</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salesState.data.payments && salesState.data.payments.length > 0 ? (
                    salesState.data.payments.map((payment) => {
                      const ratio = paymentsTotal > 0 ? (payment.amount / paymentsTotal) * 100 : 0;
                      const methodLabel = translatePaymentMethod(payment.method);
                      return (
                        <tr key={payment.method}>
                          <td className="px-3 py-2 font-medium text-foreground">{methodLabel}</td>
                          <td className="px-3 py-2">{formatCurrency(payment.amount)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{ratio.toFixed(1)}%</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Sin pagos registrados en el periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {salesState.data ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Facturas</th>
                    <th className="px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salesState.data.byDay && salesState.data.byDay.length > 0 ? (
                    salesState.data.byDay.map((row) => (
                      <tr key={row.date}>
                        <td className="px-3 py-2">{formatDate(row.date)}</td>
                        <td className="px-3 py-2">{numberFormatter.format(row.invoices)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.total)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Sin ventas registradas por día en el periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          </CardContent>
        </Card>
      ) : null}

      {activeReport === "waiters" ? (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Desempeño</span>
            </div>
            <CardTitle className="text-xl">Ventas por mesero</CardTitle>
            <CardDescription>Evalúa tickets, ventas promedio y servicio generado por cada mesero.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
              <DatePicker value={waitersFilters.from} onChange={(value) => setWaitersFilters((prev) => ({ ...prev, from: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
              <DatePicker value={waitersFilters.to} onChange={(value) => setWaitersFilters((prev) => ({ ...prev, to: value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Mesero específico</Label>
              <Input
                value={waitersFilters.waiterCode}
                onChange={(event) => setWaitersFilters((prev) => ({ ...prev, waiterCode: event.target.value.toUpperCase() }))}
                placeholder="Código de mesero"
                className="rounded-2xl"
              />
            </div>
            <div className="md:flex md:items-end">
              <Button
                type="button"
                className="w-full rounded-2xl"
                onClick={() => void fetchWaiterPerformance()}
                disabled={waitersState.loading}
              >
                {waitersState.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Consultar
              </Button>
            </div>
          </div>

          {waitersState.data ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Mesero</th>
                    <th className="px-3 py-2">Ventas</th>
                    <th className="px-3 py-2">Tickets</th>
                    <th className="px-3 py-2">Ticket promedio</th>
                    <th className="px-3 py-2">Servicio</th>
                    <th className="px-3 py-2">Última venta</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {waitersState.data.length > 0 ? (
                    waitersState.data.map((row) => (
                      <tr key={row.waiterCode ?? row.waiterName}>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-foreground">{row.waiterName}</p>
                          <p className="font-mono text-xs text-muted-foreground">{row.waiterCode ?? "Sin código"}</p>
                        </td>
                        <td className="px-3 py-2">{formatCurrency(row.totalSales)}</td>
                        <td className="px-3 py-2">{numberFormatter.format(row.invoices)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.averageTicket)}</td>
                        <td className="px-3 py-2">{formatCurrency(row.serviceCharge)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDateTime(row.lastSaleAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Sin métricas para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay métricas disponibles. Consulta para ver resultados.</p>
          )}
          </CardContent>
        </Card>
      ) : null}

      {activeReport === "topItems" ? (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FileBarChart className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Top productos</span>
            </div>
            <CardTitle className="text-xl">Artículos más vendidos</CardTitle>
            <CardDescription>
              Ranking por cantidad y monto. Útil para validar estrategias de menú y disponibilidad en inventario.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
              <DatePicker value={topItemsFilters.from} onChange={(value) => setTopItemsFilters((prev) => ({ ...prev, from: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
              <DatePicker value={topItemsFilters.to} onChange={(value) => setTopItemsFilters((prev) => ({ ...prev, to: value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 justify-between rounded-2xl"
                  onClick={() => openArticleModal("topItems")}
                >
                  <span className="truncate text-left text-sm">
                    {topItemsSelectedArticle ? `${topItemsSelectedArticle.code} · ${topItemsSelectedArticle.name}` : "Buscar artículo"}
                  </span>
                  <Search className="h-4 w-4 text-muted-foreground" />
                </Button>
                {topItemsSelectedArticle ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-2xl"
                    onClick={() => {
                      setTopItemsSelectedArticle(null);
                      setTopItemsFilters((prev) => ({ ...prev, search: "" }));
                    }}
                  >
                    Limpiar
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Límite</Label>
              <Input
                value={topItemsFilters.limit}
                onChange={(event) => setTopItemsFilters((prev) => ({ ...prev, limit: event.target.value.replace(/[^0-9]/g, "") }))}
                placeholder="10"
                className="rounded-2xl"
              />
            </div>
          </div>
          <div className="md:flex md:justify-end">
            <Button type="button" className="rounded-2xl" onClick={() => void fetchTopItems()} disabled={topItemsState.loading}>
              {topItemsState.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar
            </Button>
          </div>

          {topItemsState.data ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Artículo</th>
                    <th className="px-3 py-2">Cantidad</th>
                    <th className="px-3 py-2">Monto</th>
                    <th className="px-3 py-2">Ticket promedio</th>
                    <th className="px-3 py-2">Primera venta</th>
                    <th className="px-3 py-2">Última venta</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topItemsState.data.map((item) => (
                    <tr key={item.description}>
                      <td className="px-3 py-2 font-medium text-foreground">{item.description}</td>
                      <td className="px-3 py-2">{numberFormatter.format(item.quantity)}</td>
                      <td className="px-3 py-2">{formatCurrency(item.total)}</td>
                      <td className="px-3 py-2">{formatCurrency(item.averagePrice)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(item.firstSaleAt)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(item.lastSaleAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos aún. Ajusta filtros y ejecuta el reporte.</p>
          )}
          </CardContent>
        </Card>
      ) : null}

      {activeReport === "inventory" ? (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Table2 className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Inventario</span>
            </div>
            <CardTitle className="text-xl">Movimientos por tipo</CardTitle>
            <CardDescription>Entradas y salidas netas para validar la salud del inventario por categoría de movimiento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
              <DatePicker value={inventoryFilters.from} onChange={(value) => setInventoryFilters((prev) => ({ ...prev, from: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
              <DatePicker value={inventoryFilters.to} onChange={(value) => setInventoryFilters((prev) => ({ ...prev, to: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 justify-between rounded-2xl"
                  onClick={() => openArticleModal("inventory")}
                >
                  <span className="truncate text-left text-sm">
                    {inventorySelectedArticle
                      ? `${inventorySelectedArticle.code} · ${inventorySelectedArticle.name}`
                      : inventoryFilters.article
                      ? inventoryFilters.article
                      : "Buscar artículo"}
                  </span>
                  <Search className="h-4 w-4 text-muted-foreground" />
                </Button>
                {inventoryFilters.article ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-2xl"
                    onClick={() => {
                      setInventorySelectedArticle(null);
                      setInventoryFilters((prev) => ({ ...prev, article: "" }));
                    }}
                  >
                    Limpiar
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Bodega</Label>
              <div className="flex items-center gap-2">
                <Combobox<string>
                  value={inventoryFilters.warehouse || null}
                  onChange={(value) => setInventoryFilters((prev) => ({ ...prev, warehouse: value }))}
                  options={warehouseComboboxOptions}
                  placeholder={warehousesLoading ? "Cargando bodegas..." : "Todas las bodegas"}
                  className="flex-1"
                  disabled={warehousesLoading || warehouseComboboxOptions.length === 0}
                />
                {inventoryFilters.warehouse ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-2xl"
                    onClick={() => setInventoryFilters((prev) => ({ ...prev, warehouse: "" }))}
                  >
                    Limpiar
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Tipo</Label>
              <Input
                value={inventoryFilters.transactionType}
                onChange={(event) => setInventoryFilters((prev) => ({ ...prev, transactionType: event.target.value.toUpperCase() }))}
                placeholder="COMPRA, CONSUMO..."
                className="rounded-2xl"
              />
            </div>
          </div>
          <div className="md:flex md:justify-end">
            <Button type="button" className="rounded-2xl" onClick={() => void fetchInventory()} disabled={inventoryState.loading}>
              {inventoryState.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar
            </Button>
          </div>

          {inventoryState.data ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl bg-muted/40 p-5">
                  <p className="text-xs uppercase text-muted-foreground">Entradas totales (detalle)</p>
                  <p className="text-2xl font-semibold text-foreground">{numberFormatter.format(Number(inventoryTotals.entries.toFixed(2)))}</p>
                </div>
                <div className="rounded-3xl bg-muted/40 p-5">
                  <p className="text-xs uppercase text-muted-foreground">Salidas totales (detalle)</p>
                  <p className="text-2xl font-semibold text-foreground">{numberFormatter.format(Number(inventoryTotals.exits.toFixed(2)))}</p>
                </div>
                <div className="rounded-3xl bg-muted/40 p-5">
                  <p className="text-xs uppercase text-muted-foreground">Saldo neto (detalle)</p>
                  <p
                    className={cn(
                      "text-2xl font-semibold",
                      inventoryTotals.entries - inventoryTotals.exits >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {numberFormatter.format(Number((inventoryTotals.entries - inventoryTotals.exits).toFixed(2)))}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl bg-muted/40 p-5">
                  <p className="text-xs uppercase text-muted-foreground">Entradas totales (almacén)</p>
                  <p className="text-2xl font-semibold text-foreground">{numberFormatter.format(Number(inventoryStorageTotals.entries.toFixed(2)))}</p>
                </div>
                <div className="rounded-3xl bg-muted/40 p-5">
                  <p className="text-xs uppercase text-muted-foreground">Salidas totales (almacén)</p>
                  <p className="text-2xl font-semibold text-foreground">{numberFormatter.format(Number(inventoryStorageTotals.exits.toFixed(2)))}</p>
                </div>
                <div className="rounded-3xl bg-muted/40 p-5">
                  <p className="text-xs uppercase text-muted-foreground">Saldo neto (almacén)</p>
                  <p
                    className={cn(
                      "text-2xl font-semibold",
                      inventoryStorageTotals.entries - inventoryStorageTotals.exits >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {numberFormatter.format(Number((inventoryStorageTotals.entries - inventoryStorageTotals.exits).toFixed(2)))}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border bg-background p-5">
                  <p className="text-xs uppercase text-muted-foreground">Saldo neto consolidado (detalle)</p>
                  <p
                    className={cn(
                      "text-3xl font-semibold",
                      (inventoryState.data.totals?.netRetail ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {numberFormatter.format(Number((inventoryState.data.totals?.netRetail ?? 0).toFixed(2)))}
                  </p>
                  <p className="text-sm text-muted-foreground">Diferencia acumulada de unidades en punto de venta.</p>
                </div>
                <div className="rounded-3xl border bg-background p-5">
                  <p className="text-xs uppercase text-muted-foreground">Saldo neto consolidado (almacén)</p>
                  <p
                    className={cn(
                      "text-3xl font-semibold",
                      (inventoryState.data.totals?.netStorage ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}
                  >
                    {numberFormatter.format(Number((inventoryState.data.totals?.netStorage ?? 0).toFixed(2)))}
                  </p>
                  <p className="text-sm text-muted-foreground">Saldo acumulado considerando movimientos de almacén.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Tipo de movimiento</th>
                      <th className="px-3 py-2">Entradas (detalle)</th>
                      <th className="px-3 py-2">Salidas (detalle)</th>
                      <th className="px-3 py-2">Saldo (detalle)</th>
                      <th className="px-3 py-2">Entradas (almacén)</th>
                      <th className="px-3 py-2">Salidas (almacén)</th>
                      <th className="px-3 py-2">Saldo (almacén)</th>
                      <th className="px-3 py-2">Participación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {inventoryState.data.summary.map((row: InventoryMovementsSummaryRow) => (
                      <tr key={row.transactionType}>
                        <td className="px-3 py-2 font-medium text-foreground">{translateTransactionType(row.transactionType)}</td>
                        <td className="px-3 py-2">{numberFormatter.format(Number(row.entriesRetail.toFixed(2)))}</td>
                        <td className="px-3 py-2">{numberFormatter.format(Number(row.exitsRetail.toFixed(2)))}</td>
                        <td
                          className={cn(
                            "px-3 py-2",
                            row.netRetail >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}
                        >
                          {numberFormatter.format(Number(row.netRetail.toFixed(2)))}
                        </td>
                        <td className="px-3 py-2">{numberFormatter.format(Number(row.entriesStorage.toFixed(2)))}</td>
                        <td className="px-3 py-2">{numberFormatter.format(Number(row.exitsStorage.toFixed(2)))}</td>
                        <td
                          className={cn(
                            "px-3 py-2",
                            row.netStorage >= 0 ? "text-emerald-600" : "text-rose-600"
                          )}
                        >
                          {numberFormatter.format(Number(row.netStorage.toFixed(2)))}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {inventoryVolumeTotal > 0
                            ? `${Number((((Math.max(row.entriesRetail, 0) + Math.max(row.exitsRetail, 0)) / inventoryVolumeTotal) * 100).toFixed(1))} %`
                            : "0 %"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ejecuta el reporte para revisar los movimientos.</p>
          )}
          </CardContent>
        </Card>
      ) : null}

      {activeReport === "purchases" ? (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldQuestion className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Abastecimiento</span>
            </div>
            <CardTitle className="text-xl">Compras y proveedores</CardTitle>
            <CardDescription>Comparativa de montos y estatus de compra por proveedor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
              <DatePicker value={purchasesFilters.from} onChange={(value) => setPurchasesFilters((prev) => ({ ...prev, from: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
              <DatePicker value={purchasesFilters.to} onChange={(value) => setPurchasesFilters((prev) => ({ ...prev, to: value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Proveedor</Label>
              <Input
                value={purchasesFilters.supplier}
                onChange={(event) => setPurchasesFilters((prev) => ({ ...prev, supplier: event.target.value }))}
                placeholder="Nombre del proveedor"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Estatus</Label>
              <select
                value={purchasesFilters.status}
                onChange={(event) => setPurchasesFilters((prev) => ({ ...prev, status: event.target.value }))}
                className="h-10 w-full rounded-2xl border border-muted bg-background px-3 text-sm"
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
                <option value="PAGADA">Pagada</option>
              </select>
            </div>
          </div>
          <div className="md:flex md:justify-end">
            <Button type="button" className="rounded-2xl" onClick={() => void fetchPurchases()} disabled={purchasesState.loading}>
              {purchasesState.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar
            </Button>
          </div>

          {purchasesState.data ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2">Compras</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Pendiente</th>
                    <th className="px-3 py-2">Parcial</th>
                    <th className="px-3 py-2">Pagado</th>
                    <th className="px-3 py-2">Última compra</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchasesState.data.map((row) => (
                    <tr key={row.supplierName}>
                      <td className="px-3 py-2 font-semibold text-foreground">{row.supplierName}</td>
                      <td className="px-3 py-2">{numberFormatter.format(row.purchases)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.pendingAmount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.partialAmount)}</td>
                      <td className="px-3 py-2">{formatCurrency(row.paidAmount)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDateTime(row.lastPurchaseAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay información disponible todavía.</p>
          )}
          </CardContent>
        </Card>
      ) : null}

      {activeReport === "invoiceStatus" ? (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wide">Cobranza</span>
            </div>
            <CardTitle className="text-xl">Estado de facturación</CardTitle>
            <CardDescription>
              Seguimiento de facturas pagadas, pendientes y parciales con detalle de los saldos más altos para priorizar gestión.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
              <DatePicker value={invoiceStatusFilters.from} onChange={(value) => setInvoiceStatusFilters((prev) => ({ ...prev, from: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
              <DatePicker value={invoiceStatusFilters.to} onChange={(value) => setInvoiceStatusFilters((prev) => ({ ...prev, to: value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Cliente</Label>
              <Input
                value={invoiceStatusFilters.customer}
                onChange={(event) => setInvoiceStatusFilters((prev) => ({ ...prev, customer: event.target.value }))}
                placeholder="Nombre o RFC"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Mesero</Label>
              <Input
                value={invoiceStatusFilters.waiterCode}
                onChange={(event) => setInvoiceStatusFilters((prev) => ({ ...prev, waiterCode: event.target.value.toUpperCase() }))}
                placeholder="Código de mesero"
                className="rounded-2xl"
              />
            </div>
          </div>
          <div className="md:flex md:justify-end">
            <Button type="button" className="rounded-2xl" onClick={() => void fetchInvoiceStatus()} disabled={invoiceStatusState.loading}>
              {invoiceStatusState.loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Consultar
            </Button>
          </div>

          {invoiceStatusState.data ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-muted p-5">
                <h3 className="text-sm font-semibold text-foreground">Resumen</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {invoiceStatusState.data.summary.map((row) => {
                    const statusLabel = translateInvoiceStatus(row.status);
                    return (
                      <li key={row.status} className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3">
                        <div>
                          <p className="font-semibold text-foreground">{statusLabel}</p>
                          <p className="text-xs text-muted-foreground">{numberFormatter.format(row.invoices)} facturas</p>
                        </div>
                        <div className="text-right text-sm">
                          <p>{formatCurrency(row.totalAmount)}</p>
                          <p className="text-xs text-muted-foreground">Saldo: {formatCurrency(row.balance)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="rounded-3xl border border-muted p-5">
                <h3 className="text-sm font-semibold text-foreground">Mayor saldo pendiente</h3>
                {invoiceStatusState.data.topPending.length ? (
                  <div className="mt-3 space-y-3">
                    {invoiceStatusState.data.topPending.map((invoice) => {
                      const statusLabel = translateInvoiceStatus(invoice.status);
                      return (
                        <div key={invoice.invoiceNumber} className="rounded-2xl bg-muted/30 p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-foreground">{invoice.invoiceNumber}</span>
                            <span className="text-xs uppercase text-muted-foreground">{statusLabel}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            <p>Cliente: {invoice.customerName ?? "Sin cliente"}</p>
                            <p>Mesero: {invoice.waiterCode ?? "N/D"}</p>
                            <p>Fecha: {formatDateTime(invoice.createdAt)}</p>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-sm">
                            <span>Total {formatCurrency(invoice.totalAmount)}</span>
                            <span className="font-semibold text-foreground">Saldo {formatCurrency(invoice.balance)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No existen facturas pendientes en el período seleccionado.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Ejecuta el reporte para conocer el estado de la facturación.</p>
          )}
          </CardContent>
        </Card>
      ) : null}
      <Modal
        open={articleModalOpen}
        onClose={closeArticleModal}
        title="Buscar artículo"
        description={articleModalDescription}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={articleSearchTerm}
              onChange={(event) => setArticleSearchTerm(event.target.value)}
              placeholder="Código o nombre"
              className="rounded-2xl"
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                setArticleSearchTerm("");
                if (articleCatalog.length === 0 && !articlesLoading) {
                  void loadArticles();
                }
              }}
              disabled={articlesLoading}
            >
              Limpiar
            </Button>
          </div>
          <div className="rounded-3xl border">
            <div className="max-h-[26rem] overflow-y-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="sticky top-0 bg-background/95 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2">Artículo</th>
                    <th className="px-4 py-2">Unidades</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {articlesLoading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-16 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="h-6 w-6 animate-spin" /> Cargando artículos…
                        </span>
                      </td>
                    </tr>
                  ) : filteredArticleCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-16 text-center text-sm text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Search className="h-6 w-6" />
                          <span>No encontramos coincidencias.</span>
                          {articleCatalog.length === 0 ? (
                            <Button type="button" variant="ghost" className="rounded-2xl" onClick={() => void loadArticles()}>
                              Reintentar carga
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredArticleCatalog.map((item) => {
                      const isSelected = selectedArticleCode === item.code;
                      return (
                        <tr key={item.code} className={cn(isSelected && "bg-muted/40")}>
                          <td className="px-4 py-3 align-top">
                            <p className="font-medium text-foreground">{item.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{item.code}</p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="text-xs text-muted-foreground">
                              <p>Detalle: {item.retailUnit ?? "N/D"}</p>
                              <p>Almacén: {item.storageUnit ?? "N/D"}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant={isSelected ? "default" : "secondary"}
                              className="rounded-2xl"
                              onClick={() => handleArticleSelection(item)}
                            >
                              {isSelected ? "Seleccionado" : "Seleccionar"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
