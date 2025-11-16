"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/date-picker";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/config/currency";
import { SERVICE_RATE, VAT_RATE } from "@/config/taxes";
import { Printer, Plus, Minus, Loader2, Ban, ArrowLeft, ArrowRight, Receipt, UtensilsCrossed, Tags, AlertCircle, History } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { hasSessionPermission, isSessionAdministrator, isSessionFacturadorOnly } from "@/lib/auth/session-roles";

/**
 * Página dedicada de Facturación.
 * Incluye:
 * - Selección de mesa (mock)
 * - Detalle de consumo
 * - IVA configurable desde NEXT_PUBLIC_VAT_RATE (valor entero o decimal) con bandera para exento
 * - Cargo de servicio configurable por porcentaje desde NEXT_PUBLIC_SERVICE_RATE
 * - Impresión de ticket térmico 80mm
 */

// Tipos locales (en producción vendrán de la capa de datos)
 type KitchenOrderStatus = "OPEN" | "INVOICED" | "CANCELLED";
 interface OrderItem {
   id?: number | string;
   articleCode?: string;
   name: string;
   qty: number;
   unitPrice: number;
    unit?: "RETAIL" | "STORAGE";
   modifiers?: string[];
   notes?: string | null;
 }
 interface TableOrder {
   orderId: number;
  orderCode: string;
   tableId: string | null;
   tableLabel: string;
   status: KitchenOrderStatus;
   waiter: string | null;
   waiterCode: string | null;
   guests: number | null;
   openedAt: string;
   items: OrderItem[];
   notes?: string | null;
 }
 type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";
 interface Payment { method: PaymentMethod; amount: string; reference?: string }

type ServerPriceList = {
  code?: string | null;
  name?: string | null;
  currency_code?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  is_default?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ServerPriceListItem = {
  article_id?: number | string | null;
  article_code?: string | null;
  name?: string | null;
  unit?: string | null;
  price?: number | string | null;
  currency_code?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

interface CashRegisterAssignmentOption {
  cashRegisterId: number;
  cashRegisterCode: string;
  cashRegisterName: string;
  allowManualWarehouseOverride: boolean;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  isDefault: boolean;
}

interface CashRegisterActiveSession {
  id: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  openingAmount: number;
  openingAt: string;
  openingNotes: string | null;
  cashRegister: {
    cashRegisterId: number;
    cashRegisterCode: string;
    cashRegisterName: string;
    warehouseCode: string;
    warehouseName: string;
  };
}

interface CashRegisterSessionSnapshot {
  id: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  openingAmount: number;
  openingAt: string;
  closingAmount: number | null;
  closingAt: string | null;
  cashRegister: {
    code: string;
    name: string;
    warehouseCode: string;
    warehouseName: string;
  };
}

const tableStatusLabels: Record<KitchenOrderStatus, string> = {
  OPEN: "Ocupada",
  INVOICED: "Facturado",
  CANCELLED: "Anulado",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

const paymentMethodOptions: ComboboxOption<PaymentMethod>[] = [
  { value: "CASH", label: paymentMethodLabels.CASH },
  { value: "CARD", label: paymentMethodLabels.CARD },
  { value: "TRANSFER", label: paymentMethodLabels.TRANSFER },
  { value: "OTHER", label: paymentMethodLabels.OTHER },
];

const DEFAULT_MANUAL_CUSTOMER_NAME = "Cliente mostrador";
const MANUAL_EXIT_WARNING =
  "Tienes una factura manual en progreso. Si sales sin generar la factura se perderán los datos capturados. ¿Deseas abandonar la captura?";

type FacturacionMode = "sin-pedido" | "con-pedido" | "listas-precio";
type InvoiceMode = "sin-pedido" | "con-pedido";

const NEW_INVOICE_ID = "__invoice_manual__";

interface DraftInvoice {
  reference: string;
  waiter: string;
  guests: number;
  notes: string;
  items: OrderItem[];
}

function FacturacionHomeMenu({ allowPriceLists }: { allowPriceLists: boolean }) {
  const cards: Array<{ key: FacturacionMode; title: string; description: string; icon: LucideIcon; highlight?: string }> = [
    {
      key: "sin-pedido",
      title: "Facturación sin pedido",
      description: "Crea facturas manuales desde mostrador y asigna mesas disponibles en el momento.",
      icon: Receipt,
      highlight: "Manual",
    },
    {
      key: "con-pedido",
      title: "Facturación con pedido",
      description: "Convierte órdenes de mesas ocupadas en facturas listas para cobro y cierre.",
      icon: UtensilsCrossed,
      highlight: "Pedidos",
    },
    {
      key: "listas-precio",
      title: "Listas de precio",
      description: "Administra listas base, happy hour o convenios con clientes corporativos.",
      icon: Tags,
    },
  ];

  const visibleCards = allowPriceLists ? cards : cards.filter((card) => card.key !== "listas-precio");

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Facturación</h1>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.key} className="relative flex h-full flex-col justify-between rounded-3xl border bg-background/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
              <CardHeader className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </span>
                  {card.highlight && (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">{card.highlight}</span>
                  )}
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-xl font-semibold text-foreground">{card.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <Button type="button" className="w-full justify-between rounded-2xl" asChild>
                  <Link href={`/facturacion?mode=${card.key}`}>
                    <span>Ingresar</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

interface PriceList {
  id: string;
  name: string;
  currency: string;
  description: string;
  isActive: boolean;
  isDefault: boolean;
  lastUpdated: string;
}

interface PriceListItem {
  articleId: number;
  articleCode: string;
  name: string;
  unit: string;
  listPrice: number;
  currency: string;
  isActive: boolean;
  lastUpdated: string;
}

interface ArticleCatalogItem {
  id: number;
  articleCode: string;
  name: string;
  unit: string;
}

type FormItemPreview = {
  articleId: number;
  articleCode: string;
  name: string;
  unit: string;
  basePrice?: number | null;
  listPrice?: number;
};

interface ArticleApiItem {
  id: number | string;
  article_code?: string | null;
  name?: string | null;
  retail_unit?: string | null;
  unit?: string | null;
  unit_name?: string | null;
  price?: { base_price?: number | string | null } | null;
}

const formatTimestampLocale = (date: Date = new Date()) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);

const getCurrencyFormatter = (() => {
  const cache: Record<string, Intl.NumberFormat> = {};
  return (currency: string) => {
    const code = currency || process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "MXN";
    if (!cache[code]) {
      cache[code] = new Intl.NumberFormat("es-MX", { style: "currency", currency: code });
    }
    return cache[code];
  };
})();

const createInitialManualDraft = (): DraftInvoice => ({
  reference: "Factura manual",
  waiter: "Caja",
  guests: 1,
  notes: "",
  items: [],
});

const createInitialPaymentsState = (): Payment[] => [{ method: "CASH", amount: "" }];

interface PriceListWorkspaceProps {
  defaultCurrency: string;
  priceLists: PriceList[];
  priceListsLoading: boolean;
  refreshPriceLists: () => Promise<void>;
  priceListItems: Record<string, PriceListItem[]>;
  priceListItemsLoading: Record<string, boolean>;
  refreshPriceListItems: (code: string, options?: { force?: boolean }) => Promise<void>;
  defaultPriceListCode: string;
  onDefaultPriceListChange: (id: string) => void;
}

function PriceListWorkspace({
  defaultCurrency,
  priceLists,
  priceListsLoading,
  refreshPriceLists,
  priceListItems,
  priceListItemsLoading,
  refreshPriceListItems,
  defaultPriceListCode,
  onDefaultPriceListChange,
}: PriceListWorkspaceProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listsMutating, setListsMutating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<PriceList, "lastUpdated" | "isDefault"> & { isDefault?: boolean }>(
    { id: "", name: "", currency: defaultCurrency, description: "", isActive: true, isDefault: false }
  );
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState<PriceList | null>(null);
  const currentItemsLoading = selectedPriceList ? Boolean(priceListItemsLoading[selectedPriceList.id]) : false;
  const [itemsSearchTerm, setItemsSearchTerm] = useState("");
  const [showInactiveItems, setShowInactiveItems] = useState(true);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemFormDraft, setItemFormDraft] = useState<{ articleId: number | null; price: string }>({ articleId: null, price: "" });
  const [itemFormEditingId, setItemFormEditingId] = useState<number | null>(null);
  const [itemsSaving, setItemsSaving] = useState(false);
  const [itemsMutating, setItemsMutating] = useState(false);
  const [articleCatalog, setArticleCatalog] = useState<ArticleCatalogItem[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const articlesRequestedRef = useRef(false);
  const articleCatalogMetaRef = useRef<{ hasItems: boolean }>({ hasItems: false });

  const formatMoney = useCallback((value: number, currency: string) => {
    const formatter = getCurrencyFormatter(currency || defaultCurrency);
    return formatter.format(value);
  }, [defaultCurrency]);

  const basePriceLookup = useMemo(() => {
    const baseItems = priceListItems[defaultPriceListCode] ?? [];
    const lookup = new Map<number, number>();
    for (const item of baseItems) {
      lookup.set(item.articleId, item.listPrice);
    }
    return lookup;
  }, [priceListItems, defaultPriceListCode]);

  const defaultListCurrency = useMemo(() => {
    const match = priceLists.find((list) => list.id === defaultPriceListCode);
    return match?.currency ?? defaultCurrency;
  }, [defaultCurrency, defaultPriceListCode, priceLists]);

  const currentPriceListItems = useMemo(() => {
    if (!selectedPriceList) return [] as PriceListItem[];
    return priceListItems[selectedPriceList.id] ?? [];
  }, [priceListItems, selectedPriceList]);

  const filteredItems = useMemo(() => {
    const term = itemsSearchTerm.trim().toLowerCase();
    return currentPriceListItems.filter((item) => {
      const matches = term
        ? `${item.articleCode} ${item.name}`.toLowerCase().includes(term)
        : true;
      const statusMatches = showInactiveItems ? true : item.isActive;
      return matches && statusMatches;
    });
  }, [currentPriceListItems, itemsSearchTerm, showInactiveItems]);

  const articleOptions = useMemo(() => {
    return articleCatalog.map((item) => ({
      value: item.id,
      label: `${item.articleCode} • ${item.name}`,
      description: `Unidad: ${item.unit}`,
    }));
  }, [articleCatalog]);

  const emptyPriceListMessage = currentPriceListItems.length === 0
    ? "Aún no hay artículos asignados a esta lista."
    : "No se encontraron artículos con los filtros aplicados.";

  const selectedItemForForm = useMemo<FormItemPreview | null>(() => {
    const activeListId = selectedPriceList?.id ?? null;
    if (itemFormEditingId != null) {
      if (!activeListId) return null;
      const scopedItems = priceListItems[activeListId] ?? [];
      const existing = scopedItems.find((item) => item.articleId === itemFormEditingId);
      if (!existing) return null;
      const isDefault = activeListId === defaultPriceListCode;
      const baseRef = isDefault ? null : (basePriceLookup.get(existing.articleId) ?? null);
      return { ...existing, basePrice: baseRef ?? null };
    }
    if (itemFormDraft.articleId != null) {
      const catalogItem = articleCatalog.find((item) => item.id === itemFormDraft.articleId);
      if (!catalogItem) return null;
      const isDefault = activeListId === defaultPriceListCode;
      const baseRef = isDefault ? null : (basePriceLookup.get(catalogItem.id) ?? null);
      return {
        articleId: catalogItem.id,
        articleCode: catalogItem.articleCode,
        name: catalogItem.name,
        unit: catalogItem.unit,
        basePrice: baseRef ?? null,
      };
    }
    return null;
  }, [articleCatalog, basePriceLookup, defaultPriceListCode, itemFormDraft.articleId, itemFormEditingId, priceListItems, selectedPriceList?.id]);

  const itemFormPriceNumber = useMemo(() => {
    const normalized = itemFormDraft.price.replace(/,/g, ".").trim();
    if (!normalized) return Number.NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }, [itemFormDraft.price]);

  const canSubmitItemForm = useMemo(() => {
    if (Number.isNaN(itemFormPriceNumber) || itemFormPriceNumber <= 0) return false;
    if (itemFormEditingId != null) {
      return itemFormDraft.price.trim().length > 0;
    }
    return itemFormDraft.articleId != null && itemFormDraft.price.trim().length > 0;
  }, [itemFormDraft.articleId, itemFormDraft.price, itemFormEditingId, itemFormPriceNumber]);

  const loadArticlesCatalog = useCallback(async (force = false) => {
    if (articlesRequestedRef.current) return;
    if (!force && articleCatalogMetaRef.current.hasItems) return;
    articlesRequestedRef.current = true;
    setArticlesLoading(true);
    try {
      const response = await fetch(`/api/articulos?price_list_code=${encodeURIComponent(defaultPriceListCode)}&unit=RETAIL`);
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? (payload.items as ArticleApiItem[]) : [];
      setArticleCatalog(items.map((item) => ({
        id: Number(item.id),
        articleCode: String(item.article_code ?? ""),
        name: String(item.name ?? "Artículo sin nombre"),
        unit: String(item.retail_unit ?? item.unit ?? item.unit_name ?? "Unidad"),
      })));
      articleCatalogMetaRef.current.hasItems = items.length > 0;
    } catch (error) {
      console.error("Error cargando catálogo para listas de precio", error);
      toast({ variant: "error", title: "Catálogo", description: "No fue posible cargar el catálogo de artículos." });
    } finally {
      setArticlesLoading(false);
      articlesRequestedRef.current = false;
    }
  }, [defaultPriceListCode, toast]);

  useEffect(() => {
    articleCatalogMetaRef.current.hasItems = articleCatalog.length > 0;
  }, [articleCatalog.length]);

  useEffect(() => {
    articleCatalogMetaRef.current.hasItems = false;
    setArticleCatalog([]);
  }, [defaultPriceListCode]);

  useEffect(() => {
    if (itemsModalOpen) {
      setItemsSearchTerm("");
      setShowInactiveItems(true);
      loadArticlesCatalog();
    } else {
      setItemsSearchTerm("");
      setShowInactiveItems(true);
    }
  }, [itemsModalOpen, loadArticlesCatalog]);

  useEffect(() => {
    if (!itemFormOpen) {
      setItemFormDraft({ articleId: null, price: "" });
      setItemFormEditingId(null);
      setItemsSaving(false);
    }
  }, [itemFormOpen]);

  const filteredLists = useMemo(() => {
    return priceLists.filter((list) => {
      const match = `${list.id} ${list.name} ${list.description}`.toLowerCase().includes(searchTerm.trim().toLowerCase());
      const activeMatch = showInactive ? true : list.isActive;
      return match && activeMatch;
    });
  }, [priceLists, searchTerm, showInactive]);

  const handleOpenNew = () => {
    setEditingId(null);
    setForm({ id: "", name: "", currency: defaultCurrency, description: "", isActive: true, isDefault: false });
    setModalOpen(true);
  };

  const handleEdit = (list: PriceList) => {
    setEditingId(list.id);
    setForm({ id: list.id, name: list.name, currency: list.currency, description: list.description, isActive: list.isActive, isDefault: list.isDefault });
    setModalOpen(true);
  };

  const handleToggleActive = async (list: PriceList) => {
    setListsMutating(true);
    try {
      const response = await fetch("/api/precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "toggle-active", payload: { code: list.id, is_active: !list.isActive } }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshPriceLists();
      toast({ variant: "success", title: "Listas de precio", description: "Estado actualizado correctamente." });
    } catch (error) {
      console.error("No se pudo actualizar el estado de la lista", error);
      toast({ variant: "error", title: "Listas de precio", description: "No se pudo actualizar el estado de la lista." });
    } finally {
      setListsMutating(false);
    }
  };

  const handleSetDefault = async (list: PriceList) => {
    if (defaultPriceListCode === list.id) return;
    setListsMutating(true);
    try {
      const response = await fetch("/api/precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "set-default", payload: { code: list.id } }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshPriceLists();
      onDefaultPriceListChange(list.id);
      toast({ variant: "success", title: "Listas de precio", description: `La lista ${list.id} es ahora la predeterminada.` });
    } catch (error) {
      console.error("No se pudo actualizar la lista predeterminada", error);
      toast({ variant: "error", title: "Listas de precio", description: "No fue posible definir la lista predeterminada." });
    } finally {
      setListsMutating(false);
    }
  };

  const handleSave = async () => {
    const normalizedId = form.id.trim().toUpperCase();
    const normalizedName = form.name.trim();
    if (!normalizedId || !normalizedName) {
      toast({ variant: "warning", title: "Validación", description: "Código y nombre son obligatorios." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "price-list",
          payload: {
            code: normalizedId,
            name: normalizedName,
            description: form.description.trim() || undefined,
            currency_code: form.currency,
            is_active: form.isActive,
            is_default: form.isDefault,
          },
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.message || "Operación rechazada");
      }
      await refreshPriceLists();
      if (form.isDefault) {
        onDefaultPriceListChange(normalizedId);
        await refreshPriceListItems(normalizedId, { force: true });
      }
      toast({ variant: "success", title: "Listas de precio", description: editingId ? "Lista actualizada" : "Lista creada" });
      setModalOpen(false);
    } catch (error) {
      console.error("No se pudo guardar la lista", error);
      toast({ variant: "error", title: "Listas de precio", description: "No se pudo guardar la lista." });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenItemsModal = (list: PriceList) => {
    setSelectedPriceList(list);
    setItemsModalOpen(true);
    void refreshPriceListItems(list.id);
  };

  const handleCloseItemsModal = () => {
    setItemsModalOpen(false);
    setSelectedPriceList(null);
  };

  useEffect(() => {
    if (!selectedPriceList) return;
    const refreshed = priceLists.find((list) => list.id === selectedPriceList.id);
    if (!refreshed) {
      setSelectedPriceList(null);
      setItemsModalOpen(false);
      return;
    }
    if (refreshed !== selectedPriceList) {
      setSelectedPriceList(refreshed);
    }
  }, [priceLists, selectedPriceList]);

  const handleStartCreateItem = () => {
    if (!selectedPriceList) {
      toast({ variant: "error", title: "Listas de precio", description: "Selecciona una lista antes de agregar productos." });
      return;
    }
    setItemFormDraft({ articleId: null, price: "" });
    setItemFormEditingId(null);
    setItemFormOpen(true);
  };

  const handleSelectArticleInForm = (articleId: number) => {
    const baseRef = basePriceLookup.get(articleId);
    setItemFormDraft((prev) => ({
      ...prev,
      articleId,
      price: baseRef != null ? baseRef.toFixed(2) : "",
    }));
  };

  const handleStartEditItem = (item: PriceListItem) => {
    if (!selectedPriceList) {
      toast({ variant: "error", title: "Listas de precio", description: "Selecciona una lista para editar sus productos." });
      return;
    }
    setItemFormEditingId(item.articleId);
    setItemFormDraft({ articleId: item.articleId, price: item.listPrice.toFixed(2) });
    setItemFormOpen(true);
  };

  const handleSubmitItemForm = async () => {
    if (!selectedPriceList) {
      toast({ variant: "error", title: "Listas de precio", description: "Selecciona una lista para continuar." });
      return;
    }
    if (!canSubmitItemForm) {
      toast({ variant: "warning", title: "Listas de precio", description: "Completa los datos del formulario." });
      return;
    }

    const listId = selectedPriceList.id;
    const normalizedPrice = Number(itemFormPriceNumber.toFixed(2));
    let targetArticleCode: string | null = null;

    if (itemFormEditingId != null) {
      const target = (priceListItems[listId] ?? []).find((entry) => entry.articleId === itemFormEditingId);
      if (!target) {
        toast({ variant: "error", title: "Listas de precio", description: "No se encontró el artículo a editar." });
        return;
      }
      targetArticleCode = target.articleCode;
    } else {
      if (itemFormDraft.articleId == null) {
        toast({ variant: "warning", title: "Listas de precio", description: "Selecciona un artículo del catálogo." });
        return;
      }
      const alreadyExists = (priceListItems[listId] ?? []).some((entry) => entry.articleId === itemFormDraft.articleId);
      if (alreadyExists) {
        toast({ variant: "warning", title: "Listas de precio", description: "El artículo ya está asignado a la lista." });
        return;
      }
      const catalogItem = articleCatalog.find((entry) => entry.id === itemFormDraft.articleId);
      if (!catalogItem) {
        toast({ variant: "error", title: "Listas de precio", description: "No se encontró el artículo seleccionado." });
        return;
      }
      targetArticleCode = catalogItem.articleCode;
    }

    setItemsSaving(true);
    try {
      const response = await fetch("/api/precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "set-price",
          payload: {
            article_code: targetArticleCode,
            price_list_code: listId,
            price: normalizedPrice,
            start_date: new Date().toISOString().slice(0, 10),
          },
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.message || "No se pudo guardar el precio");
      }

      await refreshPriceListItems(listId, { force: true });
      toast({ variant: "success", title: "Listas de precio", description: itemFormEditingId != null ? "Precio actualizado correctamente." : "Artículo agregado a la lista." });
      setItemFormOpen(false);
    } catch (error) {
      console.error("No se pudo registrar el precio", error);
      toast({ variant: "error", title: "Listas de precio", description: "No se pudo guardar el precio." });
    } finally {
      setItemsSaving(false);
    }
  };

  const handleToggleItemActive = async (articleId: number) => {
    if (!selectedPriceList) return;
    const listId = selectedPriceList.id;
    const current = priceListItems[listId] ?? [];
    const target = current.find((item) => item.articleId === articleId);
    if (!target) {
      toast({ variant: "warning", title: "Listas de precio", description: "No se encontró el artículo en la lista." });
      return;
    }

    setItemsMutating(true);
    try {
      const response = await fetch("/api/precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "toggle-article",
          payload: {
            price_list_code: listId,
            article_code: target.articleCode,
            is_active: !target.isActive,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshPriceListItems(listId, { force: true });
      toast({ variant: "success", title: "Listas de precio", description: target.isActive ? "Producto desactivado." : "Producto activado." });
    } catch (error) {
      console.error("No se pudo alternar el estado del artículo", error);
      toast({ variant: "error", title: "Listas de precio", description: "No se pudo actualizar el estado del artículo." });
    } finally {
      setItemsMutating(false);
    }
  };

  const handleRemoveItem = async (articleId: number) => {
    if (!selectedPriceList) {
      toast({ variant: "error", title: "Listas de precio", description: "Selecciona una lista para administrar sus productos." });
      return;
    }
    if (selectedPriceList.id === defaultPriceListCode) {
      toast({ variant: "warning", title: "Listas de precio", description: "La lista predeterminada no admite remover artículos." });
      return;
    }
    const listId = selectedPriceList.id;
    const current = priceListItems[listId] ?? [];
    const target = current.find((item) => item.articleId === articleId);
    if (!target) {
      toast({ variant: "warning", title: "Listas de precio", description: "El artículo no está asignado a la lista." });
      return;
    }

    setItemsMutating(true);
    try {
      const response = await fetch("/api/precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "delete-article",
          payload: {
            price_list_code: listId,
            article_code: target.articleCode,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshPriceListItems(listId, { force: true });
      toast({ variant: "success", title: "Listas de precio", description: "Artículo removido de la lista." });
    } catch (error) {
      console.error("No se pudo remover el artículo", error);
      toast({ variant: "error", title: "Listas de precio", description: "No se pudo remover el artículo." });
    } finally {
      setItemsMutating(false);
    }
  };

  const handleMatchBasePrice = async (articleId: number) => {
    if (!selectedPriceList) return;
    if (selectedPriceList.id === defaultPriceListCode) return;
    const listId = selectedPriceList.id;
    const current = priceListItems[listId] ?? [];
    const target = current.find((item) => item.articleId === articleId);
    if (!target) {
      toast({ variant: "warning", title: "Listas de precio", description: "No se encontró el artículo en la lista." });
      return;
    }
    const reference = basePriceLookup.get(articleId);
    if (reference == null) {
      toast({ variant: "warning", title: "Listas de precio", description: "No existe precio base en la lista predeterminada." });
      return;
    }

    setItemsMutating(true);
    try {
      const response = await fetch("/api/precios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "set-price",
          payload: {
            article_code: target.articleCode,
            price_list_code: listId,
            price: Number(reference.toFixed(2)),
            start_date: new Date().toISOString().slice(0, 10),
          },
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshPriceListItems(listId, { force: true });
      toast({ variant: "success", title: "Listas de precio", description: "El precio se alineó con el valor base." });
    } catch (error) {
      console.error("No se pudo alinear el precio", error);
      toast({ variant: "error", title: "Listas de precio", description: "No se pudo actualizar el precio." });
    } finally {
      setItemsMutating(false);
    }
  };

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Button type="button" variant="outline" size="sm" className="w-fit rounded-2xl px-3" asChild>
              <Link href="/facturacion" aria-label="Volver al menú principal de facturación">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Volver al menú
                </span>
              </Link>
            </Button>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Listas de precio</h1>
            </div>
          </div>
          <Button type="button" className="rounded-2xl" onClick={handleOpenNew} disabled={priceListsLoading || listsMutating}>Nueva lista</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr,auto]">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Buscar</Label>
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Código o nombre" className="rounded-2xl" />
          </div>
          <div className="flex items-end gap-3">
            <Label className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-muted bg-background"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Mostrar inactivas
            </Label>
          </div>
        </div>
      </header>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Listado</CardTitle>
        </CardHeader>
        <CardContent>
          {priceListsLoading ? (
            <div className="flex items-center gap-2 pb-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Actualizando listas desde la base de datos...</span>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm text-foreground">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Moneda</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Actualización</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLists.length > 0 ? (
                  filteredLists.map((list) => (
                    <tr key={list.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{list.id}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{list.name}</span>
                          <span className="text-xs text-muted-foreground">{list.description}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{list.currency}</td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                          list.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground",
                        )}>
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {list.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{list.lastUpdated}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => handleOpenItemsModal(list)}
                          >
                            Productos
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => handleEdit(list)}>Editar</Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => handleToggleActive(list)}
                            disabled={listsMutating}
                          >
                            {list.isActive ? "Desactivar" : "Activar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={list.isDefault ? "default" : "outline"}
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => handleSetDefault(list)}
                            disabled={list.isDefault || listsMutating}
                          >
                            {list.isDefault ? "Predeterminada" : "Hacer predeterminada"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No se encontraron listas con los criterios aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? `Editar lista (${editingId})` : "Nueva lista de precio"}
        description="Define identificador único, moneda y estado de la lista."
        contentClassName="max-w-3xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Código</Label>
              <Input
                value={form.id}
                onChange={(event) => setForm((prev) => ({ ...prev, id: editingId ? prev.id : event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))}
                placeholder="EJ. BASE"
                className="rounded-2xl"
                disabled={!!editingId}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Lista base" className="rounded-2xl" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Moneda</Label>
              <select
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
                className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm"
              >
                <option value="NIO">NIO</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Estado</Label>
              <div className="flex items-center gap-3 rounded-2xl border border-muted bg-background/80 px-3 py-2">
                <Switch checked={form.isActive} onChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))} aria-label="Lista activa" />
                <span className="text-sm text-muted-foreground">{form.isActive ? "Activa" : "Inactiva"}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Descripción</Label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-muted bg-background/90 p-3 text-sm"
              placeholder="Describe alcance, vigencia o condiciones especiales."
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="price-list-default"
              type="checkbox"
              className="h-4 w-4 rounded border-muted bg-background"
              checked={!!form.isDefault}
              onChange={(event) => setForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
            />
            <Label htmlFor="price-list-default" className="text-sm text-muted-foreground">Marcar como predeterminada</Label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="rounded-2xl" disabled={saving || !form.id.trim() || !form.name.trim()} onClick={handleSave}>
              {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={itemsModalOpen}
        onClose={handleCloseItemsModal}
        title={selectedPriceList ? `Productos (${selectedPriceList.name})` : "Productos de la lista"}
        description="Asigna artículos del catálogo y define el precio vigente para esta lista."
        contentClassName="max-w-5xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1 space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Buscar</Label>
              <Input
                value={itemsSearchTerm}
                onChange={(event) => setItemsSearchTerm(event.target.value)}
                placeholder="Filtrar por código o nombre"
                className="rounded-2xl"
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Label className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-muted bg-background"
                  checked={showInactiveItems}
                  onChange={(event) => setShowInactiveItems(event.target.checked)}
                />
                Mostrar inactivos
              </Label>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-2xl"
                onClick={() => loadArticlesCatalog(true)}
                disabled={articlesLoading}
              >
                {articlesLoading ? "Actualizando..." : "Refrescar catálogo"}
              </Button>
              <Button
                type="button"
                variant="success"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={handleStartCreateItem}
                disabled={!selectedPriceList || itemsMutating || currentItemsLoading}
                aria-label="Agregar producto a la lista"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-muted bg-background/95">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Artículo</th>
                    <th className="px-3 py-2">Precio base</th>
                    <th className="px-3 py-2">Precio lista</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Actualización</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {currentItemsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Cargando artículos de la lista...
                        </span>
                      </td>
                    </tr>
                  ) : filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                      const isDefaultList = selectedPriceList?.id === defaultPriceListCode;
                      const basePrice = isDefaultList ? null : basePriceLookup.get(item.articleId) ?? null;
                      const showMatchAction = !isDefaultList && basePrice != null && Math.abs(item.listPrice - basePrice) > 0.009;
                      return (
                        <tr key={item.articleId} className="hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.articleCode}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{item.name}</span>
                              <span className="text-xs text-muted-foreground">Unidad: {item.unit}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-muted-foreground">
                            {basePrice != null ? formatMoney(basePrice, defaultListCurrency) : "—"}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {formatMoney(item.listPrice, item.currency)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                                item.isActive
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              <span className="h-2 w-2 rounded-full bg-current" />
                              {item.isActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.lastUpdated}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => handleStartEditItem(item)}
                                disabled={itemsMutating || currentItemsLoading}
                              >
                                Editar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => handleToggleItemActive(item.articleId)}
                                disabled={itemsMutating || currentItemsLoading}
                              >
                                {item.isActive ? "Desactivar" : "Activar"}
                              </Button>
                              {!isDefaultList ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-xl px-3 text-xs"
                                  onClick={() => handleRemoveItem(item.articleId)}
                                  disabled={itemsMutating || currentItemsLoading}
                                >
                                  Quitar
                                </Button>
                              ) : null}
                              {showMatchAction ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-xl px-3 text-xs"
                                  onClick={() => handleMatchBasePrice(item.articleId)}
                                  disabled={itemsMutating || currentItemsLoading}
                                >
                                  Igualar base
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {emptyPriceListMessage}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selectedPriceList ? (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>
                Total de artículos asignados: {" "}
                <span className="font-semibold text-foreground">{currentPriceListItems.length}</span>
              </span>
              <span>
                Moneda de la lista: {" "}
                <span className="font-semibold text-foreground">{selectedPriceList.currency}</span>
              </span>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={itemFormOpen}
        onClose={() => setItemFormOpen(false)}
        title={itemFormEditingId != null ? "Editar producto" : "Nuevo producto"}
        description={selectedPriceList ? `Lista ${selectedPriceList.name}` : "Selecciona una lista"}
        contentClassName="max-w-md"
      >
        <div className="space-y-4">
          {itemFormEditingId == null ? (
            <Combobox<number>
              value={itemFormDraft.articleId}
              onChange={handleSelectArticleInForm}
              options={articleOptions}
              placeholder="Selecciona un artículo"
              label="Artículo"
              ariaLabel="Seleccionar artículo para la lista de precio"
              emptyText={articlesLoading ? "Cargando catálogo..." : "Sin resultados"}
            />
          ) : (
            <div className="rounded-2xl bg-muted/20 p-4 text-sm text-muted-foreground">
              <span className="block text-sm font-semibold text-foreground">{selectedItemForForm?.name}</span>
              <span className="block text-xs text-muted-foreground">{selectedItemForForm?.articleCode} • Unidad: {selectedItemForForm?.unit}</span>
            </div>
          )}

          {selectedItemForForm?.basePrice != null ? (
            <div className="rounded-2xl border border-dashed border-muted bg-muted/10 p-3 text-xs text-muted-foreground">
              Precio base actual: {" "}
              <span className="font-semibold text-foreground">
                {formatMoney(selectedItemForForm.basePrice, defaultListCurrency)}
              </span>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">
              Precio en la lista ({selectedPriceList?.currency ?? defaultCurrency})
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={itemFormDraft.price}
              onChange={(event) => setItemFormDraft((prev) => ({ ...prev, price: event.target.value }))}
              placeholder="0.00"
              className="rounded-2xl"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setItemFormOpen(false)}>
              Cancelar
            </Button>
            {itemFormEditingId != null ? (
              <Button
                type="button"
                className="rounded-2xl"
                onClick={handleSubmitItemForm}
                disabled={itemsSaving || !canSubmitItemForm}
              >
                {itemsSaving ? "Guardando..." : "Actualizar"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="success"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={handleSubmitItemForm}
                disabled={itemsSaving || !canSubmitItemForm}
                aria-label="Agregar producto a la lista"
              >
                {itemsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </section>
  );
}

export default function FacturacionPage() {
  const searchParams = useSearchParams();
  const modeParam = (searchParams?.get("mode") as FacturacionMode | null) ?? null;
  const session = useSession();
  const isAdmin = isSessionAdministrator(session);
  const isFacturadorOnly = isSessionFacturadorOnly(session);
  const canManagePriceLists = isAdmin;
  const canOpenCash = hasSessionPermission(session, "cash.register.open");
  const canCloseCash = hasSessionPermission(session, "cash.register.close");
  const canViewCashReports = hasSessionPermission(session, "cash.report.view");
  const mustIssueInvoices = hasSessionPermission(session, "invoice.issue");
  const canManageCashRegisters = isAdmin || canOpenCash || canCloseCash || canViewCashReports;
  const mustHaveOpenCashSession = isFacturadorOnly && (canOpenCash || mustIssueInvoices);
  const { toast } = useToast();

  useEffect(() => {
    if (modeParam === "listas-precio" && !canManagePriceLists) {
      toast({
        variant: "warning",
        title: "Acceso restringido",
        description: "Solo un administrador puede administrar listas de precio.",
      });
    }
  }, [modeParam, canManagePriceLists, toast]);

  const defaultCurrency = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO";
  const envDefaultPriceListCode = process.env.DEFAULT_PRICE_LIST_CODE || "BASE";
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [priceListItems, setPriceListItems] = useState<Record<string, PriceListItem[]>>({});
  const [priceListsLoading, setPriceListsLoading] = useState(false);
  const [priceListItemsLoading, setPriceListItemsLoading] = useState<Record<string, boolean>>({});
  const [defaultPriceListCode, setDefaultPriceListCode] = useState(envDefaultPriceListCode);
  const loadedPriceListItemsRef = useRef<Set<string>>(new Set());

  const mapServerPriceList = useCallback((entry: ServerPriceList): PriceList => {
    const updatedAtRaw = entry?.updated_at ?? entry?.created_at ?? null;
    const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : new Date();
    const code = String(entry?.code ?? "").toUpperCase();
    const resolvedName = entry?.name ? String(entry.name) : code || "Lista";
    return {
      id: code,
      name: resolvedName,
      currency: String(entry?.currency_code ?? defaultCurrency),
      description: typeof entry?.description === "string" ? entry.description : "",
      isActive: Boolean(entry?.is_active ?? true),
      isDefault: Boolean(entry?.is_default ?? false),
      lastUpdated: formatTimestampLocale(updatedAt),
    } satisfies PriceList;
  }, [defaultCurrency]);

  const mapServerPriceListItem = useCallback((entry: ServerPriceListItem): PriceListItem => {
    const updatedAtRaw = entry?.updated_at ?? entry?.created_at ?? null;
    const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : new Date();
    return {
      articleId: Number(entry?.article_id ?? 0),
      articleCode: String(entry?.article_code ?? ""),
      name: String(entry?.name ?? "Artículo"),
      unit: String(entry?.unit ?? "Unidad"),
      listPrice: Number(entry?.price ?? 0),
      currency: String(entry?.currency_code ?? defaultCurrency),
      isActive: Boolean(entry?.is_active ?? true),
      lastUpdated: formatTimestampLocale(updatedAt),
    } satisfies PriceListItem;
  }, [defaultCurrency]);

  const refreshPriceListItems = useCallback(
    async (code: string, options?: { force?: boolean }) => {
      const normalized = code.trim().toUpperCase();
      if (!normalized) return;
      if (!options?.force && loadedPriceListItemsRef.current.has(normalized)) {
        return;
      }
      setPriceListItemsLoading((prev) => ({ ...prev, [normalized]: true }));
      try {
        const response = await fetch(`/api/precios?code=${encodeURIComponent(normalized)}&include=items`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        const mapped = items.map(mapServerPriceListItem);
        setPriceListItems((prev) => ({ ...prev, [normalized]: mapped }));
        loadedPriceListItemsRef.current.add(normalized);
      } catch (error) {
        console.error(`No se pudieron obtener los artículos de la lista ${code}`, error);
        toast({ variant: "error", title: "Listas de precio", description: "No se pudieron cargar los artículos de la lista." });
      } finally {
        setPriceListItemsLoading((prev) => ({ ...prev, [normalized]: false }));
      }
    },
    [mapServerPriceListItem, toast]
  );

  const refreshPriceLists = useCallback(async () => {
    setPriceListsLoading(true);
    try {
      const response = await fetch("/api/precios", { cache: "no-store", credentials: "include" });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const payload = await response.json();
      const lists = Array.isArray(payload.lists) ? payload.lists : [];
      const mapped = lists.map(mapServerPriceList);
      setPriceLists(mapped);
      setPriceListsLoading(false);

      setPriceListItems((prev) => {
        const next = { ...prev } as Record<string, PriceListItem[]>;
        const validIds = new Set(mapped.map((list: PriceList) => list.id));
        for (const key of Object.keys(next)) {
          if (!validIds.has(key)) {
            delete next[key];
            loadedPriceListItemsRef.current.delete(key);
          }
        }
        return next;
      });

      const preferredDefault = mapped.find((list: PriceList) => list.isDefault)
        ?? mapped.find((list: PriceList) => list.id === envDefaultPriceListCode.toUpperCase())
        ?? (mapped[0] as PriceList | undefined)
        ?? null;
      if (preferredDefault) {
        setDefaultPriceListCode((prev) => (prev === preferredDefault.id ? prev : preferredDefault.id));
        void refreshPriceListItems(preferredDefault.id);
      }
    } catch (error) {
      console.error("No se pudieron obtener las listas de precio", error);
      toast({ variant: "error", title: "Listas de precio", description: "No se pudieron obtener las listas de precio." });
      setPriceListsLoading(false);
    }
  }, [envDefaultPriceListCode, mapServerPriceList, refreshPriceListItems, toast]);

  useEffect(() => {
    void refreshPriceLists();
  }, [refreshPriceLists]);

  const handleDefaultPriceListChange = useCallback((id: string) => {
    setDefaultPriceListCode((prev) => (prev === id ? prev : id));
    void refreshPriceListItems(id);
  }, [refreshPriceListItems]);

  if (modeParam === "listas-precio" && canManagePriceLists) {
    return (
      <PriceListWorkspace
        defaultCurrency={defaultCurrency}
        priceLists={priceLists}
        priceListsLoading={priceListsLoading}
        refreshPriceLists={refreshPriceLists}
        priceListItems={priceListItems}
        priceListItemsLoading={priceListItemsLoading}
        refreshPriceListItems={refreshPriceListItems}
        defaultPriceListCode={defaultPriceListCode}
        onDefaultPriceListChange={handleDefaultPriceListChange}
      />
    );
  }

  if (modeParam === "sin-pedido" || modeParam === "con-pedido") {
    return (
      <FacturacionWorkspace
        key={modeParam}
        mode={modeParam}
        priceLists={priceLists}
        defaultPriceListCode={defaultPriceListCode}
        canManageCashRegisters={canManageCashRegisters}
        mustHaveOpenCashSession={mustHaveOpenCashSession}
      />
    );
  }

  return <FacturacionHomeMenu allowPriceLists={canManagePriceLists} />;
}

  // Toggle deslizante accesible (módulo global para reutilizar en subcomponentes)
 function Switch({ checked, onChange, "aria-label": ariaLabel, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; "aria-label"?: string; disabled?: boolean }) {
   return (
     <button
       type="button"
       role="switch"
       aria-checked={checked}
       aria-label={ariaLabel}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
       className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        checked ? "bg-primary" : "bg-muted"
       )}
     >
       <span
         className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-background transition-transform",
          checked ? "translate-x-5" : "translate-x-1"
         )}
       />
     </button>
   );
 }

 // Subcomponente UI para gestionar múltiples formas de pago
 function PaymentsSectionUI({ payments, setPayments, serviceEnabled, setServiceEnabled, applyVAT, setApplyVAT, vatRate }: { payments: Payment[]; setPayments: (p: Payment[]) => void; serviceEnabled: boolean; setServiceEnabled: (v: boolean) => void; applyVAT: boolean; setApplyVAT: (v: boolean) => void; vatRate: number }) {
   const addPayment = () => setPayments([...payments, { method: "CARD", amount: "", reference: "" }]);
  const removePayment = (idx: number) => {
    if (payments.length === 1) return;
    setPayments(payments.filter((_, i) => i !== idx));
  };
   const updatePayment = (idx: number, patch: Partial<Payment>) => {
     setPayments(payments.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
   };
   const sum = payments.reduce((acc, p) => acc + (Number(String(p.amount).replace(/,/g, ".")) || 0), 0);
   return (
     <div className="space-y-3">
       <div className="flex items-center justify-between">
         <span className="text-xs uppercase text-muted-foreground">Formas de pago</span>
         <span className="text-xs text-muted-foreground">Total pagado: <span className="font-semibold text-foreground">{new Intl.NumberFormat("es-MX", { style: "currency", currency: process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "MXN" }).format(sum)}</span></span>
       </div>
       <div className="space-y-2">
        {payments.map((p, idx) => {
          const requiresReference = p.method === "CARD" || p.method === "TRANSFER";
          return (
            <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(110px,1fr),minmax(120px,1fr),minmax(150px,1.2fr),auto]">
             <Combobox<PaymentMethod>
               value={p.method}
               onChange={(value) => {
                 const needsReference = value === "CARD" || value === "TRANSFER";
                 updatePayment(idx, {
                   method: value,
                   reference: needsReference ? (p.reference ?? "") : undefined,
                 });
               }}
               options={paymentMethodOptions}
               placeholder="Método de pago"
               ariaLabel="Método de pago"
                className="min-w-[120px]"
             />
             <Input
               inputMode="decimal"
               placeholder="0.00"
               className="rounded-2xl bg-background/95"
               value={p.amount}
               onChange={(e) => updatePayment(idx, { amount: e.target.value.replace(/[^0-9.,]/g, "") })}
             />
             {requiresReference ? (
               <Input
                 placeholder="Referencia"
                 className="rounded-2xl bg-background/95"
                 value={p.reference || ""}
                 onChange={(e) => updatePayment(idx, { reference: e.target.value })}
               />
             ) : (
               <div className="hidden sm:block" aria-hidden="true" />
             )}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="h-5 w-5 rounded-full"
                onClick={() => removePayment(idx)}
                aria-label="Quitar forma de pago"
              >
                <Minus className="h-2.5 w-2.5" />
              </Button>
              {idx === payments.length - 1 ? (
                <Button
                  type="button"
                  variant="success"
                  size="icon"
                  className="h-5 w-5 rounded-full"
                  onClick={addPayment}
                  aria-label="Agregar forma de pago"
                >
                  <Plus className="h-2.5 w-2.5" />
                </Button>
              ) : null}
            </div>
           </div>
         );
        })}
       </div>
      <div className="flex flex-wrap items-center gap-8">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">Servicio</span>
          <Switch checked={serviceEnabled} onChange={setServiceEnabled} aria-label="Servicio" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">IVA</span>
          <Switch
            checked={applyVAT}
            onChange={(value) => {
              if (vatRate === 0) return;
              setApplyVAT(value);
            }}
            aria-label="IVA"
            disabled={vatRate === 0}
          />
        </div>
      </div>
     </div>
   );
 }

function FacturacionWorkspace({
  mode,
  priceLists,
  defaultPriceListCode,
  canManageCashRegisters,
  mustHaveOpenCashSession,
}: {
  mode: InvoiceMode;
  priceLists: PriceList[];
  defaultPriceListCode: string;
  canManageCashRegisters: boolean;
  mustHaveOpenCashSession: boolean;
}) {
  const vatRate = VAT_RATE;
  const serviceRate = SERVICE_RATE;
  const modeTitle = mode === "sin-pedido" ? "Facturación sin pedido" : "Facturación con pedido";
  const [orders, setOrders] = useState<TableOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(mode === "sin-pedido" ? NEW_INVOICE_ID : null);
  const [manualPriceListCode, setManualPriceListCode] = useState(defaultPriceListCode);
  const [payments, setPayments] = useState<Payment[]>(() => createInitialPaymentsState());
  const [amountReceived, setAmountReceived] = useState("0");
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [applyVAT, setApplyVAT] = useState(() => vatRate > 0);
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [draftInvoice, setDraftInvoice] = useState<DraftInvoice>(() => createInitialManualDraft());
  const [cashSessionState, setCashSessionState] = useState<{
    loading: boolean;
    activeSession: CashRegisterActiveSession | null;
    cashRegisters: CashRegisterAssignmentOption[];
    defaultCashRegisterId: number | null;
    recentSessions: CashRegisterSessionSnapshot[];
  }>({
    loading: false,
    activeSession: null,
    cashRegisters: [],
    defaultCashRegisterId: null,
    recentSessions: [],
  });
  const [cashSessionError, setCashSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (vatRate === 0) {
      setApplyVAT(false);
    }
  }, [vatRate]);

  useEffect(() => {
    if (mode === "sin-pedido" && selectedTableId === NEW_INVOICE_ID && !draftInvoice.items.length) {
      setCustomerName((prev) => prev || DEFAULT_MANUAL_CUSTOMER_NAME);
    }
  }, [draftInvoice.items.length, mode, selectedTableId]);

  const { toast } = useToast();

  const loadCashSession = useCallback(async () => {
    if (!canManageCashRegisters) {
      setCashSessionState((prev) => ({ ...prev, loading: false }));
      return;
    }
    setCashSessionState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch("/api/cajas/sesion-activa", { cache: "no-store", credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.message ?? "No se pudo obtener la información de la caja";
        throw new Error(message);
      }

      const assignments: CashRegisterAssignmentOption[] = Array.isArray(data?.cashRegisters) ? data.cashRegisters : [];
      const recentSessions: CashRegisterSessionSnapshot[] = Array.isArray(data?.recentSessions) ? data.recentSessions : [];

      setCashSessionState({
        loading: false,
        activeSession: (data?.activeSession ?? null) as CashRegisterActiveSession | null,
        cashRegisters: assignments,
        defaultCashRegisterId: typeof data?.defaultCashRegisterId === "number" ? data.defaultCashRegisterId : null,
        recentSessions,
      });
      setCashSessionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo obtener la información de la caja";
      setCashSessionState((prev) => ({ ...prev, loading: false, activeSession: null }));
      setCashSessionError(message);
      toast({
        variant: mustHaveOpenCashSession ? "error" : "warning",
        title: "Caja",
        description: message,
      });
    }
  }, [canManageCashRegisters, mustHaveOpenCashSession, toast]);

  useEffect(() => {
    if (canManageCashRegisters) {
      void loadCashSession();
    }
  }, [canManageCashRegisters, loadCashSession]);

  const canAccessCashManagement = canManageCashRegisters;
  const requiresOpenCashSession = canManageCashRegisters && mustHaveOpenCashSession && !cashSessionState.loading && !cashSessionState.activeSession;
  const hasCashAssignments = cashSessionState.cashRegisters.length > 0;

  const handleRefreshCashSessions = useCallback(() => {
    void loadCashSession();
  }, [loadCashSession]);
  // Datos del cliente y edición rápida de productos
  const [customerName, setCustomerName] = useState(() =>
    mode === "sin-pedido" ? DEFAULT_MANUAL_CUSTOMER_NAME : ""
  );
  const [customerTaxId, setCustomerTaxId] = useState("");
  // Eliminado agregado manual libre (se quitan estados newItemName/newItemPrice/newItemQty)
  // Búsqueda de artículos del catálogo
  const [catalog, setCatalog] = useState<Array<{ id:number; article_code:string; name:string; price?: { base_price:number | null } }>>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequestedRef = useRef(false);
  const catalogMetaRef = useRef<{ hasItems: boolean }>({ hasItems: false });
  const catalogPriceListRef = useRef<string | null>(null);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | "">("");
  const [selectedCatalogQty, setSelectedCatalogQty] = useState("1");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const orderSelectionKey = useCallback((order: TableOrder) => order.tableId ?? `__order_${order.orderId}`, []);

  const defaultPriceList = useMemo(() => priceLists.find((list) => list.id === defaultPriceListCode) ?? null, [priceLists, defaultPriceListCode]);
  const manualPriceListOptions = useMemo<ComboboxOption<string>[]>(() => {
    return priceLists
      .filter((list) => list.isActive)
      .map((list) => {
        const statusLabel = list.isDefault ? "Predeterminada" : "Activa";
        return {
          value: list.id,
          label: `${list.id} • ${list.name}`,
          description: `${list.currency} • ${statusLabel}`,
        };
      });
  }, [priceLists]);
  const lastDefaultRef = useRef(defaultPriceListCode);

  useEffect(() => {
    setManualPriceListCode((prev) => {
      const activeLists = priceLists.filter((list) => list.isActive);
      if (activeLists.length === 0) {
        return prev;
      }

      const targetDefault = activeLists.find((list) => list.id === defaultPriceListCode) ?? activeLists[0];
      const stillActive = activeLists.some((list) => list.id === prev);
      const manualDraftActive = mode === "sin-pedido" && selectedTableId === NEW_INVOICE_ID;
      const manualHasItems = manualDraftActive && draftInvoice.items.length > 0;

      if (manualHasItems) {
        return stillActive ? prev : targetDefault.id;
      }

      if (stillActive && prev !== lastDefaultRef.current) {
        return prev;
      }

      return targetDefault.id;
    });
    lastDefaultRef.current = defaultPriceListCode;
  }, [defaultPriceListCode, draftInvoice.items.length, mode, priceLists, selectedTableId]);
  const loadOrders = useCallback(
    async (options?: { silent?: boolean }) => {
      if (mode !== "con-pedido") {
        setOrders([]);
        setOrdersError(null);
        return;
      }
      const silent = options?.silent ?? false;
      setOrdersLoading(true);
      if (!silent) {
        setOrdersError(null);
      }
      try {
        const response = await fetch("/api/orders", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const data = (await response.json()) as {
          orders?: Array<{
            id: number;
            orderCode: string;
            tableId: string | null;
            tableLabel: string | null;
            status: KitchenOrderStatus;
            waiterCode: string | null;
            waiterName: string | null;
            guests: number | null;
            openedAt: string;
            notes: string | null;
            items?: Array<{
              id: number;
              articleCode: string;
              name: string;
              quantity: number;
              unitPrice: number;
              modifiers?: string[];
              notes?: string | null;
            }>;
          }>;
        };
        const mapped: TableOrder[] = (Array.isArray(data.orders) ? data.orders : []).map((order) => ({
          orderId: order.id,
          orderCode: order.orderCode,
          tableId: order.tableId ?? null,
          tableLabel: order.tableLabel ?? order.orderCode,
          status: order.status,
          waiter: order.waiterName ?? order.waiterCode ?? null,
          waiterCode: order.waiterCode ?? null,
          guests: order.guests ?? null,
          openedAt: order.openedAt,
          notes: order.notes ?? null,
          items: Array.isArray(order.items)
            ? order.items.map((item) => ({
                id: item.id,
                articleCode: item.articleCode,
                name: item.name,
                qty: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                unit: "RETAIL",
                modifiers: item.modifiers ?? [],
                notes: item.notes ?? null,
              }))
            : [],
        }));
        setOrders(mapped);
        setOrdersError(null);
        setSelectedTableId((prev) => {
          if (mode !== "con-pedido") {
            return prev;
          }
          if (prev && mapped.some((order) => orderSelectionKey(order) === prev)) {
            return prev;
          }
          const next = mapped[0];
          return next ? orderSelectionKey(next) : null;
        });
      } catch (error) {
        console.error("Error cargando pedidos", error);
        setOrdersError("No se pudieron cargar los pedidos activos.");
        if (!silent) {
          toast({ variant: "error", title: "Pedidos", description: "No fue posible cargar los pedidos activos." });
        }
      } finally {
        setOrdersLoading(false);
      }
    },
    [mode, orderSelectionKey, toast]
  );

  const refreshOrders = useCallback(() => loadOrders({ silent: true }), [loadOrders]);

  const loadCatalog = useCallback(async (force = false) => {
    const isManualFlow = mode === "sin-pedido" && selectedTableId === NEW_INVOICE_ID;
    const activePriceListCode = isManualFlow ? manualPriceListCode : defaultPriceListCode;
    if (catalogRequestedRef.current) return;
    const canReuse = catalogMetaRef.current.hasItems && catalogPriceListRef.current === activePriceListCode;
    if (!force && canReuse) return;
    catalogRequestedRef.current = true;
    setCatalogLoading(true);
    try {
      const res = await fetch(`/api/articulos?price_list_code=${encodeURIComponent(activePriceListCode)}&unit=RETAIL`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setCatalog(data.items || []);
      catalogPriceListRef.current = activePriceListCode;
      catalogMetaRef.current.hasItems = Array.isArray(data.items) && data.items.length > 0;
    } catch (error) {
      console.error("Error cargando catálogo", error);
      toast({ variant: "error", title: "Catálogo", description: "No fue posible cargar el catálogo de artículos." });
      catalogPriceListRef.current = null;
      catalogMetaRef.current.hasItems = false;
    } finally {
      setCatalogLoading(false);
      catalogRequestedRef.current = false;
    }
  }, [defaultPriceListCode, manualPriceListCode, mode, selectedTableId, toast]);

  useEffect(() => {
    catalogMetaRef.current.hasItems = catalog.length > 0;
  }, [catalog.length]);

  useEffect(() => {
    if (mode === "con-pedido") {
      void loadOrders({ silent: true });
    } else {
      setOrders([]);
      setOrdersError(null);
      setOrdersLoading(false);
      setSelectedTableId(NEW_INVOICE_ID);
    }
  }, [loadOrders, mode]);

  useEffect(() => {
    if (mode !== "sin-pedido") return;
    catalogMetaRef.current.hasItems = false;
    catalogPriceListRef.current = null;
    setCatalog([]);
  }, [manualPriceListCode, mode]);

  useEffect(() => {
    if (mode === "sin-pedido" && selectedTableId === NEW_INVOICE_ID) return;
    catalogMetaRef.current.hasItems = false;
    catalogPriceListRef.current = null;
    setCatalog([]);
  }, [defaultPriceListCode, mode, selectedTableId]);

  useEffect(() => {
    if (addItemModalOpen) {
      loadCatalog();
    } else {
      setCatalogSearch("");
      setSelectedCatalogId("");
      setSelectedCatalogQty("1");
    }
  }, [addItemModalOpen, loadCatalog]);

  useEffect(() => {
    if (!addItemModalOpen) return;
    if (mode !== "sin-pedido") return;
    if (selectedTableId !== NEW_INVOICE_ID) return;
    loadCatalog(true);
  }, [addItemModalOpen, loadCatalog, manualPriceListCode, mode, selectedTableId]);

  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter(item => {
      const code = String(item.article_code || "").toLowerCase();
      const name = String(item.name || "").toLowerCase();
      return code.includes(query) || name.includes(query);
    });
  }, [catalog, catalogSearch]);
  const selectedCatalogQtyNumber = useMemo(() => {
    const parsed = Number(selectedCatalogQty.replace(/,/g, "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [selectedCatalogQty]);
  const highlightTimeoutRef = useRef<number | null>(null);

  const manualDraftBaseline = useMemo(() => createInitialManualDraft(), []);
  const paymentsDirty = useMemo(() => {
    if (payments.length > 1) {
      return true;
    }
    return payments.some((payment) => {
      const normalizedAmount = Number(String(payment.amount).replace(/,/g, ".")) || 0;
      if (normalizedAmount > 0) {
        return true;
      }
      return Boolean(payment.reference && payment.reference.trim().length > 0);
    });
  }, [payments]);

   useEffect(() => () => { if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current); }, []);

  const tableOptions = useMemo<ComboboxOption<string>[]>(() => {
    if (mode === "sin-pedido") {
      const manualLabel = draftInvoice.reference.trim() || "Factura manual";
      const manualDescription = draftInvoice.waiter.trim()
        ? `Responsable: ${draftInvoice.waiter.trim()}`
        : "Registrar consumo manual sin asignar mesa";
      return [{ value: NEW_INVOICE_ID, label: manualLabel, description: manualDescription }];
    }

    return orders.map((order) => ({
      value: orderSelectionKey(order),
      label: `${order.tableLabel} • ${tableStatusLabels[order.status] ?? "Ocupada"}`,
      description: order.waiter ? `Atiende ${order.waiter}` : `Folio ${order.orderCode}`,
    }));
  }, [draftInvoice.reference, draftInvoice.waiter, mode, orderSelectionKey, orders]);

  useEffect(() => {
    if (tableOptions.length === 0) {
      setSelectedTableId(mode === "sin-pedido" ? NEW_INVOICE_ID : null);
      return;
    }
    if (!selectedTableId || !tableOptions.some((option) => option.value === selectedTableId)) {
      setSelectedTableId(tableOptions[0]?.value ?? (mode === "sin-pedido" ? NEW_INVOICE_ID : tableOptions[0]?.value ?? null));
    }
  }, [tableOptions, selectedTableId, mode]);

  const selectedOrder = useMemo(
    () => orders.find((order) => orderSelectionKey(order) === selectedTableId) ?? null,
    [orderSelectionKey, orders, selectedTableId]
  );
  const isDraft = selectedTableId === NEW_INVOICE_ID;
  const manualWorkInProgress = useMemo(() => {
    if (!isDraft) {
      return false;
    }
    if (!manualDraftBaseline) {
      return false;
    }
    if (draftInvoice.items.length > 0) {
      return true;
    }
    if (draftInvoice.notes.trim().length > 0) {
      return true;
    }
    if (draftInvoice.reference.trim() !== manualDraftBaseline.reference) {
      return true;
    }
    if (draftInvoice.waiter.trim() !== manualDraftBaseline.waiter) {
      return true;
    }
    if (draftInvoice.guests !== manualDraftBaseline.guests) {
      return true;
    }
    if (customerName.trim() !== DEFAULT_MANUAL_CUSTOMER_NAME) {
      return true;
    }
    if (customerTaxId.trim().length > 0) {
      return true;
    }
    if (paymentsDirty) {
      return true;
    }
    if (serviceEnabled) {
      return true;
    }
    return false;
  }, [customerName, customerTaxId, draftInvoice, isDraft, manualDraftBaseline, paymentsDirty, serviceEnabled]);
  const shouldWarnOnManualExit = mode === "sin-pedido" && manualWorkInProgress;
  const manualHasItems = isDraft && draftInvoice.items.length > 0;
    const itemsForSummary = useMemo(() => (isDraft ? draftInvoice.items : selectedOrder?.items ?? []), [isDraft, draftInvoice, selectedOrder]);
    const activeLabel = isDraft ? (draftInvoice.reference.trim() || "Factura manual") : selectedOrder?.tableLabel ?? "Sin mesa";
    const activeNotes = isDraft ? draftInvoice.notes : selectedOrder?.notes ?? "";
    const activeWaiter = isDraft ? (draftInvoice.waiter.trim() || "Caja") : selectedOrder?.waiter ?? "No asignado";

    const serviceChargeComputed = useMemo(() => {
      const baseSubtotal = itemsForSummary.reduce((acc, item) => acc + item.qty * item.unitPrice, 0);
      return serviceEnabled ? baseSubtotal * serviceRate : 0;
    }, [serviceEnabled, serviceRate, itemsForSummary]);

    const summary = useMemo(() => {
      if (!isDraft && !selectedOrder) return null;
      const subtotal = itemsForSummary.reduce((acc, item) => acc + item.qty * item.unitPrice, 0);
      const discount = 0; // Descuentos futuros
      const taxableBase = Math.max(subtotal - discount + serviceChargeComputed, 0);
      const taxAmount = applyVAT ? taxableBase * vatRate : 0;
      const total = taxableBase + taxAmount;
      return { subtotal, discount, serviceCharge: serviceChargeComputed, taxAmount, total };
    }, [isDraft, selectedOrder, itemsForSummary, vatRate, serviceChargeComputed, applyVAT]);

  const selectedCatalogItem = useMemo(() => {
    if (typeof selectedCatalogId !== "number") return null;
    return catalog.find(item => item.id === selectedCatalogId) ?? null;
  }, [catalog, selectedCatalogId]);

  useEffect(() => {
    if (!shouldWarnOnManualExit) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = MANUAL_EXIT_WARNING;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldWarnOnManualExit]);

  useEffect(() => {
    if (!shouldWarnOnManualExit) {
      return;
    }
    const handleAnchorNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) {
        return;
      }
      if (anchor.dataset.guardBypass === "true") {
        return;
      }
      if (anchor.target && anchor.target !== "_self") {
        return;
      }
      if (anchor.hasAttribute("download")) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href) {
        return;
      }
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
        return;
      }
      const url = new URL(href, window.location.href);
      const sameLocation = url.pathname === window.location.pathname && url.search === window.location.search;
      if (sameLocation) {
        return;
      }
      const allowNavigation = window.confirm(MANUAL_EXIT_WARNING);
      if (!allowNavigation) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", handleAnchorNavigation, true);
    return () => document.removeEventListener("click", handleAnchorNavigation, true);
  }, [shouldWarnOnManualExit]);

  const handleConfirmCatalogItem = async () => {
    if (typeof selectedCatalogId !== "number") return;
    const art = catalog.find(c => c.id === selectedCatalogId);
    const qtyNumber = Math.max(1, selectedCatalogQtyNumber || 1);
    if (!art || !art.price || art.price.base_price == null) {
      toast({ variant: "warning", title: "Catálogo", description: "Artículo sin precio disponible" });
      return;
    }
    const articleCode = String(art.article_code ?? "").trim();
    if (!articleCode) {
      toast({ variant: "warning", title: "Catálogo", description: "El artículo seleccionado no tiene código asociado." });
      return;
    }

    if (isDraft) {
      setDraftInvoice((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          {
            id: `manual-${Date.now()}`,
            articleCode,
            name: art.name ?? art.article_code ?? "Artículo",
            qty: qtyNumber,
            unitPrice: Number(art.price!.base_price) || 0,
            unit: "RETAIL",
          },
        ],
      }));
    } else if (selectedOrder) {
      try {
        const response = await fetch(`/api/orders/${selectedOrder.orderId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            article_code: articleCode,
            description: art.name ?? articleCode,
            quantity: qtyNumber,
            unit_price: Number(art.price!.base_price) || 0,
          }),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        await refreshOrders().catch((refreshError) => {
          console.error("No se pudo refrescar los pedidos", refreshError);
        });
      } catch (error) {
        console.error("Error agregando artículo al pedido", error);
        toast({ variant: "error", title: "Pedidos", description: "No se pudo agregar el artículo al pedido." });
        return;
      }
    }

    toast({ variant: "success", title: "Producto agregado", description: `${art.article_code} • ${art.name} x${qtyNumber} → ${activeLabel}` });
    setAddItemModalOpen(false);
  };

  const handleCancelOrder = useCallback(async (): Promise<boolean> => {
    if (mode !== "con-pedido") {
      return false;
    }
    if (!selectedOrder) {
      toast({ variant: "warning", title: "Anulación no disponible", description: "Selecciona una mesa ocupada para anular su pedido." });
      return false;
    }

    try {
      const response = await fetch(`/api/orders/${selectedOrder.orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshOrders();
      setPayments(createInitialPaymentsState());
      setServiceEnabled(false);
      setApplyVAT(vatRate > 0);
      setAddItemModalOpen(false);
      toast({ variant: "success", title: "Pedido anulado", description: `${selectedOrder.tableLabel} quedó libre.` });
      return true;
    } catch (error) {
      console.error("Error al anular el pedido", error);
      toast({ variant: "error", title: "Pedidos", description: "No se pudo anular el pedido seleccionado." });
      await refreshOrders().catch((refreshError) => {
        console.error("No se pudo refrescar los pedidos", refreshError);
      });
      return false;
    }
  }, [mode, refreshOrders, selectedOrder, toast, vatRate]);

   useEffect(() => {
     // sincroniza monto recibido con suma de pagos
     const sum = payments.reduce((acc, p) => acc + (Number(String(p.amount).replace(/,/g, ".")) || 0), 0);
     setAmountReceived(String(sum));
   }, [payments]);

  const amountReceivedNumber = Number(amountReceived.replace(/,/g, ".")) || 0;
   const totalDue = summary?.total ?? 0;
  const changeDue = Math.max(amountReceivedNumber - totalDue, 0);
  const pendingBalance = Math.max(totalDue - amountReceivedNumber, 0);

  // (resaltado de disponibilidad removido)

   // (Controles de sala eliminados en módulo de facturación)

  const methodLabel = (m: PaymentMethod) => paymentMethodLabels[m] ?? "Otro";
  const canCancelOrder = mode === "con-pedido" && selectedOrder != null;

  const resetManualInvoice = useCallback(() => {
    setDraftInvoice(createInitialManualDraft());
    setSelectedTableId(NEW_INVOICE_ID);
    setManualPriceListCode((prev) => {
      const activeLists = priceLists.filter((list) => list.isActive);
      if (activeLists.length === 0) {
        return prev;
      }
      const fallback = activeLists.find((list) => list.id === defaultPriceListCode) ?? activeLists[0];
      return fallback.id;
    });
  setPayments(createInitialPaymentsState());
    setServiceEnabled(false);
    setApplyVAT(vatRate > 0);
    setCustomerName(mode === "sin-pedido" ? DEFAULT_MANUAL_CUSTOMER_NAME : "");
    setCustomerTaxId("");
    setAddItemModalOpen(false);
  }, [defaultPriceListCode, mode, priceLists, vatRate]);

  type SaveInvoiceResult = { id: number | null; invoiceNumber: string | null };

  async function saveInvoice(): Promise<SaveInvoiceResult> {
    if (!summary) return { id: null, invoiceNumber: null };
    if (!isDraft && !selectedOrder) return { id: null, invoiceNumber: null };

    if (mustHaveOpenCashSession && !cashSessionState.activeSession) {
      toast({ variant: "warning", title: "Caja requerida", description: "Abre tu caja en la sección Caja antes de generar la factura." });
      return { id: null, invoiceNumber: null };
    }

    const items = itemsForSummary;
    if (items.length === 0) {
  toast({ variant: "warning", title: "Facturación", description: "Agrega al menos un producto antes de generar la factura." });
  return { id: null, invoiceNumber: null };
    }
    const normalizedTableCode = isDraft
      ? (draftInvoice.reference.trim() || "MANUAL")
      : selectedOrder!.tableId ?? selectedOrder!.orderCode;
    const normalizedWaiter = isDraft
      ? (draftInvoice.waiter.trim() || "CAJA")
      : selectedOrder!.waiterCode ?? selectedOrder!.waiter ?? null;

    const payload = {
      invoice_number: `F-${Date.now()}`,
      invoice_date: invoiceDate,
      table_code: normalizedTableCode,
      waiter_code: normalizedWaiter,
      subtotal: Number(summary.subtotal.toFixed(2)),
      service_charge: Number(summary.serviceCharge.toFixed(2)),
      vat_amount: Number((applyVAT ? summary.taxAmount : 0).toFixed(2)),
      vat_rate: Number((applyVAT ? vatRate : 0).toFixed(4)),
      total_amount: Number(summary.total.toFixed(2)),
      currency_code: process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "MXN",
      customer_name: customerName.trim() || null,
      customer_tax_id: customerTaxId.trim() || null,
      notes: activeNotes.trim() ? activeNotes.trim() : null,
      items: items.map((item) => {
        const code = item.articleCode?.trim();
        return {
          article_code: code && code.length > 0 ? code.toUpperCase() : null,
          description: item.name,
          quantity: item.qty,
          unit_price: item.unitPrice,
          unit: item.unit ?? "RETAIL",
        };
      }),
      payments: payments
        .filter(p => (Number(String(p.amount).replace(/,/g, ".")) || 0) > 0)
        .map(p => ({
          method: p.method,
          amount: Number(String(p.amount).replace(/,/g, ".")) || 0,
          reference: p.reference || null,
        })),
      origin_order_id: isDraft ? null : selectedOrder!.orderId,
    };

    try {
      const res = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as { id: number };
      if (mode === "con-pedido") {
        await refreshOrders().catch((refreshError) => {
          console.error("No se pudo refrescar los pedidos", refreshError);
        });
      }
      return { id: data?.id ?? null, invoiceNumber: payload.invoice_number };
    } catch (error) {
      console.error("Error al guardar la factura", error);
      toast({ variant: "error", title: "Facturación", description: "No se pudo guardar la factura." });
      return { id: null, invoiceNumber: null };
    }
  }

  const handlePrint = async () => {
    if (!summary) return;
    if (!isDraft && !selectedOrder) return;
    const manualFlowActive = isDraft;
    const invoiceItems = itemsForSummary;
    const invoiceSummary = summary;
    const invoiceLabel = activeLabel;
    const invoiceWaiter = activeWaiter;
    const invoiceCustomer = customerName;
    const invoiceCustomerTaxId = customerTaxId;
  const paymentsSnapshot = payments;
  const changeDueAmount = changeDue;
    const orderSnapshot = selectedOrder;
    const invoiceDateValue = invoiceDate;

    const result = await saveInvoice();
    if (!result || result.id == null) {
      return;
    }

    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    const printedDate = new Date(`${invoiceDateValue}T${time}`);
    const itemsMarkup = invoiceItems.map(item => {
      const itemTotal = formatCurrency(item.qty * item.unitPrice, { currency: "local" });
      const modifiers = item.modifiers && item.modifiers.length > 0 ? `<div class="modifiers">${item.modifiers.map(m => `• ${m}`).join("<br />")}</div>` : "";
      return `<div class="row"><span>${item.qty} x ${item.name}</span><span>${itemTotal}</span></div>${modifiers}`;
    }).join("");

    const metaLine = manualFlowActive
      ? `Referencia: ${invoiceLabel}${invoiceWaiter ? ` • Responsable: ${invoiceWaiter}` : ""}`
      : `Mesa: ${orderSnapshot?.tableLabel ?? orderSnapshot?.orderCode ?? "N/D"} • Mesero: ${orderSnapshot?.waiter ?? "No asignado"}`;

    const html = `
      <div class="ticket">
        <p class="title">${process.env.NEXT_PUBLIC_COMPANY_ACRONYM ?? "FACT"} POS</p>
        <p class="muted">${printedDate.toLocaleString("es-MX")} ${result.invoiceNumber ? `• Folio ${result.invoiceNumber}` : ""}</p>
        <p class="muted">${metaLine}</p>
        ${(invoiceCustomer || invoiceCustomerTaxId) ? `<p class="muted">${invoiceCustomer ? `Cliente: ${invoiceCustomer}` : ''}${invoiceCustomer && invoiceCustomerTaxId ? ' • ' : ''}${invoiceCustomerTaxId ? `ID: ${invoiceCustomerTaxId}` : ''}</p>` : ''}
        <p class="separator"></p>
        ${itemsMarkup || '<div class="row"><span>Sin consumo</span><span>$0.00</span></div>'}
        <p class="separator"></p>
        <div class="row"><span>Subtotal</span><span>${formatCurrency(invoiceSummary.subtotal, { currency: "local" })}</span></div>
        <div class="row"><span>Servicio</span><span>${formatCurrency(invoiceSummary.serviceCharge, { currency: "local" })}</span></div>
        <div class="row"><span>IVA</span><span>${formatCurrency(invoiceSummary.taxAmount, { currency: "local" })}</span></div>
        <div class="row total"><span>Total</span><span>${formatCurrency(invoiceSummary.total, { currency: "local" })}</span></div>
        <p class="separator"></p>
        ${paymentsSnapshot
          .filter(p => (Number(String(p.amount).replace(/,/g, ".")) || 0) > 0)
          .map(p => `<div class="row"><span>Pago (${methodLabel(p.method)})</span><span>${formatCurrency(Number(String(p.amount).replace(/,/g, ".")) || 0, { currency: "local" })}</span></div>`)
          .join("")}
        <div class="row"><span>Cambio</span><span>${formatCurrency(changeDueAmount, { currency: "local" })}</span></div>
        <p class="separator"></p>
        <p class="muted">¡Gracias por su visita!</p>
      </div>`;

    const win = window.open("", "_blank", "width=420,height=640,noopener,noreferrer");
    if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang='es'><head><meta charSet='utf-8'/><title>Ticket ${invoiceLabel}</title><style>@page{size:80mm auto;margin:6mm;}body{font-family:'Roboto Mono',monospace;font-size:12px;width:80mm;margin:0 auto;color:#111}.ticket{width:100%}.title{text-align:center;font-weight:700;text-transform:uppercase;margin-bottom:4px}.muted{text-align:center;color:#555;margin:2px 0}.row{display:flex;justify-content:space-between;margin:2px 0}.row.total{font-weight:700;border-top:1px dashed #999;padding-top:4px}.separator{border-top:1px dashed #999;margin:6px 0}.modifiers{margin-left:8px;color:#555;font-size:11px}</style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();

    if (manualFlowActive) {
      resetManualInvoice();
    } else {
      setPayments(createInitialPaymentsState());
      setServiceEnabled(false);
      setApplyVAT(vatRate > 0);
      setCustomerName("");
      setCustomerTaxId("");
      setAddItemModalOpen(false);
    }
  };

  const cashActionButtons = canAccessCashManagement ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleRefreshCashSessions}
        disabled={cashSessionState.loading}
      >
        {cashSessionState.loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Actualizando
          </>
        ) : (
          <>
            <History className="mr-2 h-4 w-4" />
            Actualizar
          </>
        )}
      </Button>
      <Button type="button" size="sm" className="rounded-2xl" asChild>
        <Link href="/caja">
          Gestionar caja
        </Link>
      </Button>
    </div>
  ) : null;

  let statusBadgeClass = "flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground";
  let statusIcon: ReactNode = <History className="h-4 w-4" />;
  let statusInfo: ReactNode = (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">Estado de caja</p>
      <p className="text-xs text-muted-foreground">Consulta tu caja asignada y gestiona aperturas en la sección Caja.</p>
    </div>
  );

  if (cashSessionState.loading) {
    statusIcon = <Loader2 className="h-4 w-4 animate-spin" />;
    statusInfo = (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Consultando estado de caja</p>
        <p className="text-xs text-muted-foreground">Actualizando informacion asignada.</p>
      </div>
    );
  } else if (cashSessionError) {
    statusBadgeClass = "flex h-9 w-9 items-center justify-center rounded-2xl bg-destructive/10 text-destructive";
    statusIcon = <AlertCircle className="h-4 w-4" />;
    statusInfo = (
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-destructive">No se pudo consultar la caja</p>
        <p className="text-xs text-destructive/80">{cashSessionError}</p>
        <p className="text-xs text-muted-foreground">Intenta nuevamente con Actualizar.</p>
      </div>
    );
  } else if (cashSessionState.activeSession) {
    const active = cashSessionState.activeSession;
    statusBadgeClass = "flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600";
    statusIcon = <Receipt className="h-4 w-4" />;
    statusInfo = (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Caja abierta</p>
        <p className="text-xs text-muted-foreground">
          {`${active.cashRegister.cashRegisterCode} - ${active.cashRegister.cashRegisterName}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {`${active.cashRegister.warehouseCode} - ${active.cashRegister.warehouseName}`}
        </p>
        <p className="text-xs text-muted-foreground">Consulta los detalles completos en la sección Caja.</p>
      </div>
    );
  } else if (hasCashAssignments) {
    statusBadgeClass = "flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600";
    statusIcon = <AlertCircle className="h-4 w-4" />;
    statusInfo = (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Caja pendiente de apertura</p>
        <p className="text-xs text-muted-foreground">Abre tu caja en la sección Caja antes de generar facturas.</p>
      </div>
    );
  } else {
    statusBadgeClass = "flex h-9 w-9 items-center justify-center rounded-2xl bg-muted text-muted-foreground";
    statusIcon = <Ban className="h-4 w-4" />;
    statusInfo = (
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Sin cajas asignadas</p>
        <p className="text-xs text-muted-foreground">Solicita a un administrador una asignacion de caja.</p>
      </div>
    );
  }

  const cashReminder = requiresOpenCashSession ? (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600">
      Abre tu caja desde la sección Caja para poder facturar.
    </div>
  ) : null;

  const cashSessionBanner = canManageCashRegisters ? (
    <div className="rounded-3xl border bg-background/95 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className={statusBadgeClass}>{statusIcon}</span>
          {statusInfo}
        </div>
        {cashActionButtons}
      </div>
      {cashReminder}
    </div>
  ) : null;



  return (
    <>
      <section className="space-y-8 pb-8">
        {cashSessionBanner}
       <header className="space-y-3">
         <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
           <div className="space-y-3">
             <Button
               type="button"
               variant="outline"
               size="sm"
               className="w-fit rounded-2xl px-3"
               asChild
             >
               <Link href="/facturacion" aria-label="Volver al menú principal de facturación">
                 <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                   <ArrowLeft className="h-4 w-4" />
                   Volver al menú
                 </span>
               </Link>
             </Button>
             <div className="space-y-2">
               <h1 className="text-3xl font-semibold tracking-tight text-foreground">{modeTitle}</h1>
             </div>
           </div>
           {/* Toggle IVA compacto se ubicará luego dentro del card de resumen */}
         </div>
         {/* Bloque Cliente/RUC trasladado arriba */}
         <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
           <div className="space-y-1">
             <Label className="text-xs uppercase text-muted-foreground">Razón social</Label>
              <Input
                placeholder="Nombre o razón social"
                className="rounded-2xl bg-background/95"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
           </div>
           <div className="space-y-1">
             <Label className="text-xs uppercase text-muted-foreground">RUC / NIT</Label>
              <Input
                placeholder="Identificador fiscal (opcional)"
                className="rounded-2xl bg-background/95"
                value={customerTaxId}
                onChange={(e) => setCustomerTaxId(e.target.value.toUpperCase())}
              />
           </div>
           <div className="space-y-1 sm:text-right">
             <Label className="text-xs uppercase text-muted-foreground">Fecha</Label>
             <div className="flex justify-end">
               <DatePicker value={invoiceDate} onChange={setInvoiceDate} className="w-full sm:w-48" />
             </div>
           </div>
           {/* Edición de notas se reubica inline en el detalle de consumo */}
         </div>
       </header>

        <div className="grid gap-6 xl:grid-cols-[1.7fr,1fr] xl:items-stretch">
            <Card className="min-w-0 flex h-full flex-col overflow-hidden rounded-3xl border bg-background/95 shadow-sm">
              <CardHeader className="space-y-2.5 pb-4">
             <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
               <CardTitle className="text-lg font-semibold leading-tight">Detalle de consumo</CardTitle>
               
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3 lg:ml-auto lg:-translate-x-4">
                <div className="min-w-[220px] lg:min-w-[210px]">
                  <Combobox<string>
                    value={selectedTableId ?? ""}
                    onChange={(value) => setSelectedTableId(value)}
                    options={tableOptions}
                    placeholder={mode === "sin-pedido" ? "Selecciona flujo manual o mesa" : "Selecciona una mesa ocupada"}
                    label="Mesa / estado"
                    ariaLabel="Seleccionar mesa"
                    className="w-full"
                    disabled={tableOptions.length === 0}
                  />
                </div>
                {mode === "sin-pedido" && selectedTableId === NEW_INVOICE_ID ? (
                  <Combobox<string>
                    value={manualPriceListCode}
                    onChange={(value) => {
                      if (manualHasItems) return;
                      setManualPriceListCode(value || defaultPriceListCode);
                    }}
                    options={manualPriceListOptions}
                    placeholder="Selecciona una lista"
                    label="Lista de precio"
                    ariaLabel="Seleccionar lista de precio manual"
                    className="min-w-[220px]"
                    disabled={manualHasItems || manualPriceListOptions.length === 0}
                  />
                ) : (
                  <div className="hidden min-w-[220px] rounded-2xl border border-muted bg-muted/20 p-3 text-xs text-muted-foreground sm:block">
                    Lista predeterminada:
                    <span className="ml-1 font-semibold text-foreground">{defaultPriceList?.name ?? defaultPriceListCode}</span>
                    {defaultPriceList?.currency ? (
                      <span className="ml-1">({defaultPriceList.currency})</span>
                    ) : null}
                  </div>
                )}
                <Button
                  type="button"
                  variant="success"
                  size="icon"
                  className="h-6 w-6 rounded-full"
                  aria-label="Agregar producto"
                  onClick={() => setAddItemModalOpen(true)}
                  disabled={mode === "con-pedido" && !selectedOrder}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
             </div>
             {/* Controles de sala removidos en módulo de facturación */}
             {/* Se elimina chip de Mesero como indicas */}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 px-6 pb-6 pt-4 min-h-[24rem]">
              {!isDraft && ordersError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  {ordersError}
                </div>
              ) : null}
              <div className="flex-1 min-h-0">
                {(isDraft || selectedOrder) ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-auto text-left text-sm text-foreground">
                      <thead className="border-b text-[11px] uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Producto</th>
                          <th className="px-3 py-2 font-medium">Cant.</th>
                          <th className="px-3 py-2 font-medium">P. unitario</th>
                          <th className="px-3 py-2 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {itemsForSummary.length > 0 ? (
                          itemsForSummary.map((item, i) => (
                            <tr key={`${item.name}-${i}`} className="align-top hover:bg-muted/30">
                              <td className="px-3 py-2 font-medium text-foreground">
                                <span className="block leading-tight text-sm">{item.name}</span>
                                {item.modifiers && item.modifiers.length > 0 ? (
                                  <span className="mt-1 block text-[11px] text-muted-foreground">{item.modifiers.map((m) => `• ${m}`).join("  ")}</span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                <Input
                                  type="number"
                                  min={1}
                                  value={String(item.qty)}
                                  onChange={(e) => {
                                    const qty = Math.max(1, Number(e.target.value) || 1);
                                    if (isDraft) {
                                      setDraftInvoice((prev) => ({
                                        ...prev,
                                        items: prev.items.map((it, idx) => (idx === i ? { ...it, qty } : it)),
                                      }));
                                    } else if (selectedOrder && item.id != null) {
                                      const selectedKey = orderSelectionKey(selectedOrder);
                                      setOrders((prev) =>
                                        prev.map((o) =>
                                          orderSelectionKey(o) === selectedKey
                                            ? {
                                                ...o,
                                                items: o.items.map((it) =>
                                                  it.id === item.id ? { ...it, qty } : it
                                                ),
                                              }
                                            : o
                                        )
                                      );
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (isDraft || !selectedOrder || item.id == null) {
                                      return;
                                    }
                                    const qty = Math.max(1, Number(e.currentTarget.value) || 1);
                                    void (async () => {
                                      try {
                                        const response = await fetch(`/api/orders/${selectedOrder.orderId}/items/${item.id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ quantity: qty }),
                                        });
                                        if (!response.ok) {
                                          throw new Error(await response.text());
                                        }
                                        await refreshOrders();
                                      } catch (error) {
                                        console.error("Error actualizando cantidad", error);
                                        toast({ variant: "error", title: "Pedidos", description: "No se pudo actualizar la cantidad." });
                                        await refreshOrders().catch((refreshError) => {
                                          console.error("No se pudo refrescar los pedidos", refreshError);
                                        });
                                      }
                                    })();
                                  }}
                                  className="h-7 w-16 rounded-lg bg-background/90 text-center text-[11px]"
                                />
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatCurrency(item.unitPrice, { currency: "local" })}</td>
                              <td className="flex items-center justify-between gap-2 px-3 py-2 font-semibold text-foreground">
                                <span>{formatCurrency(item.qty * item.unitPrice, { currency: "local" })}</span>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="h-6 w-6 rounded-full"
                                  onClick={() => {
                                    if (isDraft) {
                                      setDraftInvoice((prev) => ({
                                        ...prev,
                                        items: prev.items.filter((_, idx) => idx !== i),
                                      }));
                                    } else if (selectedOrder && item.id != null) {
                                      const snapshot = orders;
                                      const selectedKey = orderSelectionKey(selectedOrder);
                                      setOrders((prev) =>
                                        prev.map((o) =>
                                          orderSelectionKey(o) === selectedKey
                                            ? { ...o, items: o.items.filter((it) => it.id !== item.id) }
                                            : o
                                        )
                                      );
                                      void (async () => {
                                        try {
                                          const response = await fetch(`/api/orders/${selectedOrder.orderId}/items/${item.id}`, {
                                            method: "DELETE",
                                          });
                                          if (!response.ok) {
                                            throw new Error(await response.text());
                                          }
                                          await refreshOrders();
                                        } catch (error) {
                                          console.error("Error eliminando artículo del pedido", error);
                                          setOrders(snapshot);
                                          toast({ variant: "error", title: "Pedidos", description: "No se pudo eliminar el artículo." });
                                          await refreshOrders().catch((refreshError) => {
                                            console.error("No se pudo refrescar los pedidos", refreshError);
                                          });
                                        }
                                      })();
                                    }
                                  }}
                                  aria-label="Quitar producto"
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                              Sin productos registrados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : ordersLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-muted bg-muted/10 p-5 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando pedidos activos...
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-muted bg-muted/10 p-5 text-center text-xs text-muted-foreground">No hay mesas registradas.</div>
                )}
              </div>

              {(isDraft || selectedOrder) && (
                <div className="mt-auto rounded-2xl bg-muted/20 p-4 text-xs text-muted-foreground">
                  <span className="mb-2 block font-semibold text-foreground">Notas</span>
                  <textarea
                    placeholder="Escribe notas u observaciones"
                    value={isDraft ? draftInvoice.notes : selectedOrder?.notes ?? ''}
                    onChange={(e)=> {
                      const v = e.target.value;
                      if (isDraft) {
                        setDraftInvoice((prev) => ({ ...prev, notes: v }));
                      } else if (selectedOrder) {
                        const selectedKey = orderSelectionKey(selectedOrder);
                        setOrders(prev => prev.map(o => orderSelectionKey(o) === selectedKey ? { ...o, notes: v } : o));
                      }
                    }}
                    onBlur={(e) => {
                      if (isDraft || !selectedOrder) {
                        return;
                      }
                      const value = e.target.value;
                      void (async () => {
                        try {
                          const response = await fetch(`/api/orders/${selectedOrder.orderId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ notes: value }),
                          });
                          if (!response.ok) {
                            throw new Error(await response.text());
                          }
                          await refreshOrders();
                        } catch (error) {
                          console.error("Error actualizando notas del pedido", error);
                          toast({ variant: "error", title: "Pedidos", description: "No se pudieron guardar las notas." });
                          await refreshOrders().catch((refreshError) => {
                            console.error("No se pudo refrescar los pedidos", refreshError);
                          });
                        }
                      })();
                    }}
                    rows={3}
                    className="w-full rounded-xl border border-muted bg-background/90 p-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 flex h-full flex-col overflow-hidden rounded-3xl border bg-background/95 shadow-sm">
           <CardHeader className="space-y-2">
             <CardTitle className="text-xl font-semibold">Resumen de cobro</CardTitle>
           </CardHeader>
           <CardContent className="space-y-5 flex-1">
             {/* Pagos múltiples */}
             <PaymentsSectionUI
               payments={payments}
               setPayments={setPayments}
               serviceEnabled={serviceEnabled}
               setServiceEnabled={setServiceEnabled}
               applyVAT={applyVAT}
               setApplyVAT={setApplyVAT}
               vatRate={vatRate}
             />


             {/* Cliente/RUC se movió arriba */}

             <div className="space-y-1 text-sm text-muted-foreground">
               <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(summary?.subtotal ?? 0, { currency: "local" })}</span></div>
               <div className="flex justify-between"><span>Servicio</span><span>{formatCurrency(summary?.serviceCharge ?? 0, { currency: "local" })}</span></div>
               <div className="flex justify-between"><span>IVA {applyVAT ? "" : "(exento)"}</span><span>{formatCurrency(summary?.taxAmount ?? 0, { currency: "local" })}</span></div>
             </div>

             {/* Campo de monto recibido individual ya no aplica; usamos pagos múltiples para el total */}

             <div className="rounded-2xl bg-muted/40 p-4 text-foreground space-y-2">
               <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatCurrency(totalDue, { currency: "local" })}</span></div>
               <div className="flex justify-between text-base font-semibold"><span>Cambio</span><span>{formatCurrency(changeDue, { currency: "local" })}</span></div>
               <div className={cn("flex justify-between text-base font-semibold", pendingBalance > 0 ? "text-destructive" : "text-muted-foreground")}> <span>Saldo pendiente</span><span>{formatCurrency(pendingBalance, { currency: "local" })}</span></div>
             </div>

           </CardContent>
           <div className="border-t p-4">
             <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <Button
                type="button"
                className="w-full gap-2 rounded-2xl sm:flex-1"
                onClick={handlePrint}
                disabled={!summary || itemsForSummary.length === 0 || (mustHaveOpenCashSession && !cashSessionState.activeSession)}
              >
                <Printer className="h-4 w-4" /> Imprimir ticket
              </Button>
              {mode === "con-pedido" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 rounded-2xl border-destructive/40 text-destructive hover:bg-destructive/10 sm:flex-1"
                  onClick={() => setCancelConfirmOpen(true)}
                  disabled={!canCancelOrder}
                >
                  <Ban className="h-4 w-4" /> Anular pedido
                </Button>
              ) : null}
             </div>
           </div>
         </Card>
        </div>

       {/* Vista previa eliminada: se imprime directamente al presionar el botón */}
      </section>

      <Modal
        open={addItemModalOpen}
        onClose={() => setAddItemModalOpen(false)}
        title={isDraft ? "Agregar producto (Factura manual)" : selectedOrder ? `Agregar producto (${selectedOrder.tableLabel})` : "Agregar producto"}
        description="Busca en el catálogo y agrega el artículo al consumo"
        contentClassName="max-w-4xl"
      >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="catalog-search" className="text-xs uppercase text-muted-foreground">Buscar artículo</Label>
            <Input
              id="catalog-search"
              autoFocus
              placeholder="Filtrar por código o nombre"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="rounded-2xl"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="catalog-qty" className="text-xs uppercase text-muted-foreground">Cantidad</Label>
              <Input
                id="catalog-qty"
                type="number"
                min={1}
                value={selectedCatalogQty}
                onChange={(e) => setSelectedCatalogQty(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="w-28 rounded-2xl"
              />
            </div>
            <Button type="button" variant="outline" className="h-9 rounded-2xl" onClick={() => loadCatalog(true)}>
              Refrescar
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-muted bg-background/90">
          <div className="max-h-72 overflow-y-auto">
            <table className="min-w-full table-auto text-left text-sm text-foreground">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Código</th>
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Precio base</th>
                  <th className="px-4 py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {catalogLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Cargando catálogo...
                    </td>
                  </tr>
                ) : filteredCatalog.length > 0 ? (
                  filteredCatalog.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(
                        "cursor-pointer align-top transition hover:bg-muted/40",
                        selectedCatalogId === item.id ? "bg-primary/10 ring-1 ring-primary/40" : ""
                      )}
                      onClick={() => setSelectedCatalogId(item.id)}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.article_code}</td>
                      <td className="px-4 py-2">
                        <span className="block text-sm font-medium text-foreground">{item.name}</span>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatCurrency(item.price?.base_price ?? 0, { currency: "local" })}</td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCatalogId(item.id);
                          }}
                        >
                          Seleccionar
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      No se encontraron artículos con los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-muted pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {selectedCatalogItem ? (
              <span>Seleccionado: <strong>{selectedCatalogItem.article_code}</strong> • {selectedCatalogItem.name}</span>
            ) : (
              <span>Selecciona un artículo de la tabla para continuar.</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setAddItemModalOpen(false)}>Cancelar</Button>
            <Button
              type="button"
              variant="success"
              size="icon"
              className="h-6 w-6 rounded-full"
              disabled={!selectedCatalogItem || selectedCatalogQtyNumber <= 0}
              onClick={() => { void handleConfirmCatalogItem(); }}
              aria-label="Agregar producto al consumo"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      </Modal>

      <Modal
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        title="Anular pedido"
        description="Confirma si deseas liberar la mesa seleccionada."
        contentClassName="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta acción vacía los productos, limpia las notas y marca la mesa como disponible. Esta operación no se puede revertir.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setCancelConfirmOpen(false)}>
              Volver
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-2xl"
              onClick={() => {
                void handleCancelOrder().then((success) => {
                  if (success) {
                    setCancelConfirmOpen(false);
                  }
                });
              }}
            >
              Anular ahora
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
 }
