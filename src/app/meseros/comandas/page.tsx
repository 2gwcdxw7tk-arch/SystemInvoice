"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Loader2, Lock, Minus, Plus, Printer, Save, Search, Sun, Table, Trash2, UtensilsCrossed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { formatCurrency } from "@/config/currency";
import { SERVICE_RATE, VAT_RATE, formatPercent } from "@/config/taxes";
import { cn } from "@/lib/utils";
import type { OrderLine, OrderStatus } from "@/lib/orders/types";

interface WaiterProfile {
  id: number;
  code: string;
  fullName: string;
}

type ApiWaiterProfile = {
  id: number;
  code: string;
  full_name: string;
};

interface ClassificationOption {
  id: number;
  level: number;
  full_code: string;
  name: string;
  parent_full_code: string | null;
}

interface ArticleListItem {
  id?: number;
  article_code: string;
  name: string;
  classification_level1_id?: number | null;
  classification_level2_id?: number | null;
  classification_level3_id?: number | null;
  price?: { base_price: number | null } | null;
  is_active?: boolean;
}

interface ArticlesResponse {
  items?: ArticleListItem[];
}

interface ClassificationsResponse {
  items?: ClassificationOption[];
}

type ApiTableOrder = {
  status: OrderStatus;
  pending_items: OrderLine[];
  sent_items: OrderLine[];
};

type ApiTableSnapshot = {
  id: string;
  label: string;
  zone: string | null;
  capacity: number | null;
  assigned_waiter_id: number | null;
  assigned_waiter_name: string | null;
  updated_at: string | null;
  order: ApiTableOrder | null;
};

type TableSummary = {
  id: string;
  label: string;
  zone: string | null;
  capacity: number | null;
  assignedWaiterId: number | null;
  assignedWaiterName: string | null;
  updatedAt: string | null;
  order: {
    status: OrderStatus;
    pendingItems: OrderLine[];
    sentItems: OrderLine[];
  } | null;
};

type ActiveLevel = 1 | 2 | 3;

const QUICK_NOTES = ["Sin hielo", "Extra picante", "Sin sal", "Para llevar", "Poco azucar"] as const;
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  normal: "Normal",
  facturado: "Facturado",
  anulado: "Anulado",
};
const ORDER_STATUS_BADGES: Record<OrderStatus, string> = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  facturado: "border-sky-200 bg-sky-50 text-sky-700",
  anulado: "border-rose-200 bg-rose-50 text-rose-700",
};
const SERVICE_RATE_LABEL = formatPercent(SERVICE_RATE);
const VAT_RATE_LABEL = formatPercent(VAT_RATE);
const CLOCK_FORMATTER = new Intl.DateTimeFormat("es-NI", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});
const DATE_FORMATTER = new Intl.DateTimeFormat("es-NI", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function cloneLines(lines: OrderLine[] | undefined | null): OrderLine[] {
  if (!lines || lines.length === 0) {
    return [];
  }
  return lines.map((line) => ({ ...line }));
}

function adaptTableSnapshot(api: ApiTableSnapshot): TableSummary {
  return {
    id: api.id,
    label: api.label,
    zone: api.zone ?? null,
    capacity: api.capacity ?? null,
    assignedWaiterId: api.assigned_waiter_id ?? null,
    assignedWaiterName: api.assigned_waiter_name ?? null,
    updatedAt: api.updated_at ?? null,
    order: api.order
      ? {
          status: api.order.status,
          pendingItems: cloneLines(api.order.pending_items),
          sentItems: cloneLines(api.order.sent_items),
        }
      : null,
  };
}

function sumQuantities(lines: OrderLine[] | undefined | null): number {
  if (!lines || lines.length === 0) return 0;
  return lines.reduce((total, line) => total + line.quantity, 0);
}
export default function MeserosComandasPage() {
  const { toast } = useToast();

  const [waiter, setWaiter] = useState<WaiterProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [claimingTableId, setClaimingTableId] = useState<string | null>(null);

  const [selectedTable, setSelectedTable] = useState<{ id: string; label: string; zone: string | null; capacity: number | null } | null>(null);

  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [levelLoading, setLevelLoading] = useState(false);
  const [activeLevel, setActiveLevel] = useState<ActiveLevel>(1);
  const [level1, setLevel1] = useState<ClassificationOption[]>([]);
  const [level2, setLevel2] = useState<ClassificationOption[]>([]);
  const [level3, setLevel3] = useState<ClassificationOption[]>([]);
  const [selectedLevel1, setSelectedLevel1] = useState<ClassificationOption | null>(null);
  const [selectedLevel2, setSelectedLevel2] = useState<ClassificationOption | null>(null);
  const [selectedLevel3, setSelectedLevel3] = useState<ClassificationOption | null>(null);

  const [pendingItems, setPendingItems] = useState<OrderLine[]>([]);
  const [sentItems, setSentItems] = useState<OrderLine[]>([]);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteTarget, setNoteTarget] = useState<OrderLine | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const skipSyncRef = useRef(false);
  const [now, setNow] = useState(() => new Date());

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch("/api/meseros/me");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.waiter) {
        throw new Error(data?.message ?? "No se pudo obtener el perfil del mesero");
      }
      const profile = data.waiter as ApiWaiterProfile;
      setWaiter({
        id: profile.id,
        code: profile.code,
        fullName: profile.full_name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo obtener el perfil del mesero";
      toast({ variant: "error", title: "Sesion", description: message });
      setWaiter(null);
    } finally {
      setLoadingProfile(false);
    }
  }, [toast]);

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const res = await fetch("/api/meseros/tables");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.tables) {
        throw new Error(data?.message ?? "No se pudieron cargar las mesas");
      }
      setTables((data.tables as ApiTableSnapshot[]).map(adaptTableSnapshot));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las mesas";
      toast({ variant: "warning", title: "Mesas", description: message });
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  }, [toast]);

  const loadArticles = useCallback(async () => {
    setLoadingArticles(true);
    try {
      const res = await fetch("/api/articulos?unit=RETAIL");
      if (!res.ok) throw new Error("No se pudo cargar el catalogo");
      const data = (await res.json()) as ArticlesResponse;
      const items = (data.items ?? []).filter((item) => item.is_active !== false);
      setArticles(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar articulos";
      toast({ variant: "error", title: "Articulos", description: message });
    } finally {
      setLoadingArticles(false);
    }
  }, [toast]);

  const loadClassifications = useCallback(async (level: ActiveLevel, parentFullCode?: string | null) => {
    setLevelLoading(true);
    try {
      const url = new URL("/api/clasificaciones", window.location.origin);
      url.searchParams.set("level", String(level));
      if (typeof parentFullCode !== "undefined") {
        url.searchParams.set("parent_full_code", parentFullCode ?? "");
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("No se pudieron cargar clasificaciones");
      const data = (await res.json()) as ClassificationsResponse;
      const items = data.items ?? [];
      if (level === 1) setLevel1(items);
      if (level === 2) setLevel2(items);
      if (level === 3) setLevel3(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al cargar clasificaciones";
      toast({ variant: "warning", title: "Clasificaciones", description: message });
    } finally {
      setLevelLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!waiter) return;
    void loadTables();
  }, [waiter, loadTables]);

  useEffect(() => {
    void loadArticles();
    void loadClassifications(1);
  }, [loadArticles, loadClassifications]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSelectTable = useCallback(async (tableId: string) => {
    if (!waiter) {
      toast({ variant: "warning", title: "Mesas", description: "No se encontro la sesion del mesero" });
      return;
    }
    setClaimingTableId(tableId);
    try {
      const res = await fetch("/api/meseros/tables/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table_id: tableId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.table) {
        throw new Error(data?.message ?? "No se pudo asignar la mesa");
      }
      const snapshot = adaptTableSnapshot(data.table as ApiTableSnapshot);
      setTables((prev) => {
        const exists = prev.some((table) => table.id === snapshot.id);
        return exists ? prev.map((table) => (table.id === snapshot.id ? snapshot : table)) : [...prev, snapshot];
      });
      skipSyncRef.current = true;
      setPendingItems(snapshot.order?.pendingItems ?? []);
      setSentItems(snapshot.order?.sentItems ?? []);
      setDetailModalOpen(false);
      setSelectedTable({
        id: snapshot.id,
        label: snapshot.label,
        zone: snapshot.zone,
        capacity: snapshot.capacity,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo asignar la mesa";
      toast({ variant: "error", title: "Mesas", description: message });
      await loadTables();
    } finally {
      setClaimingTableId(null);
    }
  }, [waiter, toast, loadTables]);

  const persistOrder = useCallback(async (pending: OrderLine[], sent: OrderLine[]) => {
    if (!selectedTable) return;
    try {
      const res = await fetch(`/api/meseros/tables/${encodeURIComponent(selectedTable.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_items: pending, sent_items: sent }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.table) {
        throw new Error(data?.message ?? "No se pudo guardar la comanda");
      }
      const snapshot = adaptTableSnapshot(data.table as ApiTableSnapshot);
      setTables((prev) => {
        const exists = prev.some((table) => table.id === snapshot.id);
        return exists ? prev.map((table) => (table.id === snapshot.id ? snapshot : table)) : [...prev, snapshot];
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la comanda";
      toast({ variant: "warning", title: "Comanda", description: message });
    }
  }, [selectedTable, toast]);

  useEffect(() => {
    if (!selectedTable) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    void persistOrder(pendingItems, sentItems);
  }, [pendingItems, sentItems, selectedTable, persistOrder]);

  const handleChangeTable = useCallback(() => {
    skipSyncRef.current = true;
    setSelectedTable(null);
    setPendingItems([]);
    setSentItems([]);
    setNoteModalOpen(false);
    setNoteTarget(null);
    setNoteDraft("");
  setDetailModalOpen(false);
    setSelectedLevel1(null);
    setSelectedLevel2(null);
    setSelectedLevel3(null);
    setActiveLevel(1);
    setSearchEnabled(false);
    setSearchTerm("");
    void loadTables();
  }, [loadTables]);

  const activeTableSnapshot = useMemo(() => {
    if (!selectedTable) return null;
    return tables.find((table) => table.id === selectedTable.id) ?? null;
  }, [selectedTable, tables]);

  const visibleArticles = useMemo(() => {
    let filtered = articles;
    if (selectedLevel1) {
      filtered = filtered.filter((item) => item.classification_level1_id === selectedLevel1.id);
    }
    if (selectedLevel2) {
      filtered = filtered.filter((item) => item.classification_level2_id === selectedLevel2.id);
    }
    if (selectedLevel3) {
      filtered = filtered.filter((item) => item.classification_level3_id === selectedLevel3.id);
    }
    if (searchTerm.trim().length > 0) {
      const term = searchTerm.trim().toLowerCase();
      filtered = filtered.filter((item) => item.name.toLowerCase().includes(term) || item.article_code.toLowerCase().includes(term));
    }
    return filtered;
  }, [articles, selectedLevel1, selectedLevel2, selectedLevel3, searchTerm]);

  const pendingTotal = useMemo(() => pendingItems.reduce((sum, item) => sum + ((item.unitPrice ?? 0) * item.quantity), 0), [pendingItems]);
  const sentTotal = useMemo(() => sentItems.reduce((sum, item) => sum + ((item.unitPrice ?? 0) * item.quantity), 0), [sentItems]);

  function handleSelectLevel(option: ClassificationOption, level: ActiveLevel) {
    if (level === 1) {
      setSelectedLevel1(option);
      setSelectedLevel2(null);
      setSelectedLevel3(null);
      setActiveLevel(2);
      setSearchTerm("");
      setSearchEnabled(false);
      loadClassifications(2, option.full_code);
    }
    if (level === 2) {
      setSelectedLevel2(option);
      setSelectedLevel3(null);
      setActiveLevel(3);
      setSearchTerm("");
      setSearchEnabled(false);
      loadClassifications(3, option.full_code);
    }
    if (level === 3) {
      setSelectedLevel3(option);
    }
  }

  function handleBack() {
    if (activeLevel === 3) {
      setActiveLevel(2);
      setSelectedLevel3(null);
    } else if (activeLevel === 2) {
      setActiveLevel(1);
      setSelectedLevel2(null);
      setLevel2([]);
    }
  }

  function handleShowAll(level: ActiveLevel) {
    if (level === 1) {
      setSelectedLevel1(null);
      setSelectedLevel2(null);
      setSelectedLevel3(null);
      setActiveLevel(1);
    }
    if (level === 2) {
      setSelectedLevel2(null);
      setSelectedLevel3(null);
      setActiveLevel(2);
    }
    if (level === 3) {
      setSelectedLevel3(null);
      setActiveLevel(3);
    }
  }

  function handleAddArticle(article: ArticleListItem) {
    setPendingItems((prev) => {
      const existing = prev.find((item) => item.articleCode === article.article_code);
      if (existing) {
        return prev.map((item) =>
          item.articleCode === article.article_code
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          articleCode: article.article_code,
          name: article.name,
          unitPrice: article.price?.base_price ?? null,
          quantity: 1,
        },
      ];
    });
  }

  function handleIncrease(articleCode: string) {
    setPendingItems((prev) => prev.map((item) => (item.articleCode === articleCode ? { ...item, quantity: item.quantity + 1 } : item)));
  }

  function handleDecrease(articleCode: string) {
    setPendingItems((prev) =>
      prev
        .map((item) =>
          item.articleCode === articleCode
            ? { ...item, quantity: item.quantity > 1 ? item.quantity - 1 : item.quantity }
            : item
        )
        .filter((item) => (item.articleCode === articleCode ? item.quantity > 0 : true))
    );
  }

  function handleRemove(articleCode: string) {
    setPendingItems((prev) => prev.filter((item) => item.articleCode !== articleCode));
  }

  function handleSendOrder() {
    if (pendingItems.length === 0) return;
    setSentItems((prev) => {
      const map = new Map<string, OrderLine>();
      prev.forEach((item) => map.set(item.articleCode, { ...item }));
      pendingItems.forEach((item) => {
        const existing = map.get(item.articleCode);
        if (existing) {
          map.set(item.articleCode, { ...existing, quantity: existing.quantity + item.quantity, notes: existing.notes });
        } else {
          map.set(item.articleCode, { ...item });
        }
      });
      return Array.from(map.values());
    });
    setPendingItems([]);
    toast({ variant: "success", title: "Comanda enviada", description: "Los articulos fueron enviados a cocina/barra." });
  }

  function handlePrintCheck() {
    toast({ variant: "info", title: "Pre-cuenta", description: "La impresion de pre-cuenta estara disponible en breve." });
  }

  function handleResetOrder() {
    if (sentItems.length > 0) {
      toast({ variant: "warning", title: "Limpiar comanda", description: "No puedes limpiar una comanda que ya tiene articulos enviados." });
      return;
    }
    if (!pendingItems.length) return;
    if (window.confirm("Limpiar la comanda? Se perderan los articulos que aun no envias.")) {
      setPendingItems([]);
      setSelectedLevel1(null);
      setSelectedLevel2(null);
      setSelectedLevel3(null);
      setActiveLevel(1);
      setSearchTerm("");
      setSearchEnabled(false);
      toast({ variant: "success", title: "Comanda reiniciada", description: "Puedes comenzar una nueva seleccion de articulos." });
    }
  }

  function openNotes(line: OrderLine) {
    setNoteTarget(line);
    setNoteDraft(line.notes ?? "");
    setNoteModalOpen(true);
  }

  function handleSaveNotes() {
    if (!noteTarget) return;
    setPendingItems((prev) => prev.map((item) => (item.articleCode === noteTarget.articleCode ? { ...item, notes: noteDraft.trim() || undefined } : item)));
    setNoteModalOpen(false);
    setNoteTarget(null);
    setNoteDraft("");
  }

  function toggleQuickNote(note: string) {
    setNoteDraft((current) => {
      const normalized = current.trim();
      if (!normalized) return note;
      const parts = normalized.split(", ");
      if (parts.includes(note)) {
        return parts.filter((p) => p !== note).join(", ");
      }
      return `${normalized}, ${note}`;
    });
  }

  const activeOptions = activeLevel === 1 ? level1 : activeLevel === 2 ? level2 : level3;
  const hasBreadcrumb = selectedLevel1 || selectedLevel2 || selectedLevel3;
  const quickNotes = QUICK_NOTES;
  const totalGuests = useMemo(() => sumQuantities(pendingItems) + sumQuantities(sentItems), [pendingItems, sentItems]);
  const pendingQuantity = useMemo(() => sumQuantities(pendingItems), [pendingItems]);
  const sentQuantity = useMemo(() => sumQuantities(sentItems), [sentItems]);
  const lastUpdateLabel = useMemo(() => {
    if (!activeTableSnapshot?.updatedAt) return "Sin movimientos";
    const date = new Date(activeTableSnapshot.updatedAt);
    if (Number.isNaN(date.getTime())) return "Sin movimientos";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [activeTableSnapshot?.updatedAt]);
  const noteTokens = useMemo(() => noteDraft.split(",").map((token) => token.trim()).filter(Boolean), [noteDraft]);
  const hasOrderDetail = pendingItems.length > 0 || sentItems.length > 0;
  const orderStatus: OrderStatus = activeTableSnapshot?.order?.status ?? "normal";
  const itemsSubtotal = useMemo(() => pendingTotal + sentTotal, [pendingTotal, sentTotal]);
  const serviceCharge = useMemo(() => itemsSubtotal * SERVICE_RATE, [itemsSubtotal]);
  const taxableBase = useMemo(() => itemsSubtotal + serviceCharge, [itemsSubtotal, serviceCharge]);
  const vatAmount = useMemo(() => taxableBase * VAT_RATE, [taxableBase]);
  const estimatedTotal = useMemo(() => taxableBase + vatAmount, [taxableBase, vatAmount]);
  const clockLabel = useMemo(() => CLOCK_FORMATTER.format(now).toUpperCase(), [now]);
  const dateLabel = useMemo(() => {
    const text = DATE_FORMATTER.format(now);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [now]);
  if (loadingProfile) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!waiter) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          No pudimos recuperar tu sesion de mesero. Intenta volver a iniciar sesion para continuar.
        </p>
        <Button variant="outline" onClick={() => void loadProfile()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 p-4 lg:p-6">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-50/60 px-4 py-1 text-sm font-medium text-emerald-800 shadow-sm">
          <Sun className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-sm">{dateLabel}</span>
          <span className="h-5 w-px bg-emerald-300" aria-hidden="true" />
          <span className="tabular-nums text-base font-semibold">{clockLabel}</span>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">
              <span role="img" aria-label="saludo" className="mr-2">👋</span>
              Hola, {waiter.fullName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {!selectedTable ? (
              <Button variant="outline" onClick={() => void loadTables()} disabled={loadingTables}>
                {loadingTables ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Actualizar mesas
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {!selectedTable ? (
        <Card className="flex-1 rounded-3xl border bg-card/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Mesas disponibles</CardTitle>
              <CardDescription>Utiliza los colores para identificar tus mesas, las libres y las ocupadas.</CardDescription>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600 bg-emerald-600 px-2 py-0.5 font-semibold text-white shadow-sm">
                <UtensilsCrossed className="h-3 w-3" />
                Tu mesa
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-semibold text-muted-foreground">
                Libre
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-rose-500 bg-rose-500 px-2 py-0.5 font-semibold text-white">
                <Lock className="h-3 w-3" />
                Ocupada
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTables ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : tables.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                {tables.map((table) => {
                  const hasActiveOrder = (table.order && table.order.status === "normal") || !!table.assignedWaiterId;
                  const isMine = hasActiveOrder && table.assignedWaiterId === waiter.id;
                  const isAvailable = !hasActiveOrder;
                  const isLocked = hasActiveOrder && !isMine;
                  const isClaiming = claimingTableId === table.id;
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => handleSelectTable(table.id)}
                      disabled={isLocked || isClaiming}
                      className={cn(
                        "flex min-h-[120px] flex-col justify-between rounded-2xl border bg-background/90 p-3 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-100",
                        {
                          "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50": isMine,
                          "border-zinc-200 bg-white": isAvailable && !isMine,
                          "border-rose-500 bg-rose-100/90": isLocked,
                          "cursor-not-allowed": isLocked,
                          "hover:-translate-y-0.5 hover:shadow-md": !isLocked && !isClaiming,
                          "opacity-70": isClaiming,
                        }
                      )}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-semibold text-foreground">{table.label}</span>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                              isMine
                                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                                : isAvailable
                                ? "border-zinc-200 bg-white text-muted-foreground"
                                : "border-rose-300 bg-rose-500 text-white"
                            )}
                          >
                            {isMine ? "Tu mesa" : isAvailable ? "Libre" : "Ocupada"}
                          </span>
                        </div>
                        {table.zone ? <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{table.zone}</p> : null}
                        {!isAvailable && !isMine && table.assignedWaiterName ? (
                          <p className="text-[11px] font-medium text-rose-700">Asignada a {table.assignedWaiterName}</p>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center justify-end text-[11px] text-muted-foreground">
                        {isClaiming ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        ) : (
                          <Table className="h-3.5 w-3.5" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay mesas configuradas para tu turno.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-3xl border bg-card/70 shadow-sm">
            <CardContent className="flex items-center justify-between gap-2 p-3">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Table className="h-3.5 w-3.5" />
                  <span className="text-xs">Mesa seleccionada</span>
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-foreground">{selectedTable.label}</h2>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Activa
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">{totalGuests} uds</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" onClick={handleChangeTable}>
                  Cambiar mesa
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[280px_1fr_320px]">
            <Card className="h-full rounded-3xl border bg-card/60">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Catalogo</CardTitle>
                <CardDescription>Filtra por categoria o activa la busqueda.</CardDescription>
              </CardHeader>
              <CardContent className="flex h-full min-h-0 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {activeLevel > 1 ? (
                    <Button variant="ghost" size="sm" onClick={handleBack}>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Regresar
                    </Button>
                  ) : null}
                  {hasBreadcrumb ? (
                    <Button variant="outline" size="sm" onClick={() => handleShowAll(activeLevel)}>
                      Mostrar todas
                    </Button>
                  ) : null}
                  <Button
                    variant={searchEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (searchEnabled) {
                        setSearchEnabled(false);
                        setSearchTerm("");
                      } else {
                        setSearchEnabled(true);
                      }
                    }}
                  >
                    <Search className="mr-1 h-4 w-4" />
                    {searchEnabled ? "Busqueda activa" : "Buscar"}
                  </Button>
                </div>

                {searchEnabled ? (
                  <div className="space-y-2">
                    <label htmlFor="article-search" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Buscar articulo
                    </label>
                    <Input
                      id="article-search"
                      placeholder="Escribe el nombre o codigo"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                ) : null}

                <div className="flex-1 flex flex-col overflow-hidden">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Nivel {activeLevel}</p>
                  <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                    {levelLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div key={index} className="h-10 animate-pulse rounded-2xl bg-muted" />
                        ))}
                      </div>
                    ) : activeOptions.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {activeOptions.map((option) => {
                          const isSelected =
                            (activeLevel === 1 && selectedLevel1?.id === option.id) ||
                            (activeLevel === 2 && selectedLevel2?.id === option.id) ||
                            (activeLevel === 3 && selectedLevel3?.id === option.id);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleSelectLevel(option, activeLevel)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition hover:bg-muted",
                                isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/80 text-foreground"
                              )}
                            >
                              <span>{option.name}</span>
                              <ChevronLeft className="h-4 w-4 rotate-180" />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No hay clasificaciones disponibles.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full rounded-3xl border bg-card/70">
              <CardHeader className="flex flex-col gap-1">
                <CardTitle className="text-base">Articulos ({visibleArticles.length})</CardTitle>
                <CardDescription>Selecciona articulos para agregarlos a la comanda.</CardDescription>
              </CardHeader>
              <CardContent className="flex h-full min-h-0 flex-col gap-4">
                <div className="flex-1 min-h-0 flex flex-col">
                  {loadingArticles ? (
                    <div className="flex-1 overflow-hidden">
                      <div className="grid grid-cols-2 gap-3 auto-rows-min lg:grid-cols-4">
                        {Array.from({ length: 9 }).map((_, index) => (
                          <div key={index} className="h-20 animate-pulse rounded-2xl bg-muted" />
                        ))}
                      </div>
                    </div>
                  ) : visibleArticles.length > 0 ? (
                    <div className="flex-1 overflow-y-auto pr-1">
                      <div className="grid grid-cols-2 gap-3 auto-rows-min lg:grid-cols-4">
                        {visibleArticles.map((article) => (
                          <button
                            key={article.article_code}
                            type="button"
                            onClick={() => handleAddArticle(article)}
                            className="flex min-h-[4rem] flex-col justify-between rounded-2xl border bg-background/80 p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{article.name}</p>
                            </div>
                            <div>
                              <span className="text-sm font-semibold text-primary">{formatCurrency(article.price?.base_price ?? 0)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[280px] flex items-center justify-center rounded-2xl border border-dashed border-muted-foreground/40 bg-background/70 p-6 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3 text-center">
                        <Table className="h-10 w-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No encontramos articulos con los filtros o busqueda seleccionados.
                        </p>
                        {searchEnabled ? (
                          <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")}>
                            Limpiar busqueda
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="h-full rounded-3xl border bg-card/80">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">Comanda</CardTitle>
                      </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleSendOrder} disabled={pendingItems.length === 0}>
                      <Save className="mr-2 h-4 w-4" />
                      Enviar comanda
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDetailModalOpen(true)} disabled={!hasOrderDetail}>
                      Ver detalle
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Ultima actualizacion {lastUpdateLabel}</p>
              </CardHeader>
              <CardContent className="flex h-full min-h-0 flex-col gap-4">
                {sentItems.length > 0 ? (
                  <div className="rounded-2xl border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Tienes {sentQuantity} {sentQuantity === 1 ? "articulo" : "articulos"} enviados</span>
                    <span className="block">Monto enviado: {formatCurrency(sentTotal)}. Usa &quot;Ver detalle&quot; para consultarlos</span>
                  </div>
                ) : null}

                <div className="flex-1 space-y-3 overflow-hidden">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Articulos a enviar</span>
                    <span className="font-semibold text-foreground">{formatCurrency(pendingTotal)}</span>
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {pendingItems.length > 0 ? (
                      pendingItems.map((item) => (
                        <div
                          key={item.articleCode}
                          className="flex items-start justify-between gap-3 rounded-2xl border bg-background/70 p-3 shadow-sm"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(item.unitPrice ?? 0)} - {item.quantity} uds
                            </p>
                            {item.notes ? <p className="text-xs text-primary">{item.notes}</p> : null}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleDecrease(item.articleCode)}>
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                              <Button variant="ghost" size="icon" onClick={() => handleIncrease(item.articleCode)}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => openNotes(item)}>
                                Notas
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleRemove(item.articleCode)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-muted-foreground/40 p-6 text-center text-sm text-muted-foreground">
                        No tienes articulos pendientes. Selecciona productos del catalogo para agregarlos.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 border-t border-dashed pt-4">
                  <div className="flex items-center justify-between text-base font-semibold text-foreground">
                    <span>Total a enviar</span>
                    <span>{formatCurrency(pendingTotal)}</span>
                  </div>
                
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={handlePrintCheck}
                      disabled={pendingItems.length === 0 && sentItems.length === 0}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Precuenta
                    </Button>
                    <Button
                      className="w-full"
                      variant="destructive"
                      onClick={handleResetOrder}
                      disabled={pendingItems.length === 0}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Limpiar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Detalle del pedido"
        description="Consulta todo lo que se ha agregado a esta mesa."
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                ORDER_STATUS_BADGES[orderStatus]
              )}
            >
              {ORDER_STATUS_LABELS[orderStatus]}
            </span>
            <span className="text-muted-foreground">Ultima actualizacion {lastUpdateLabel}</span>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Articulos enviados</h3>
            {sentItems.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {sentItems.map((item) => (
                  <div key={item.articleCode} className="rounded-2xl border bg-muted/60 p-3">
                    <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                      <span>{item.name}</span>
                      <span>{item.quantity} uds</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(item.unitPrice ?? 0)} {item.notes ? ` ${item.notes}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Todavia no enviaste articulos.</p>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Pendientes por enviar</h3>
            {pendingItems.length > 0 ? (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {pendingItems.map((item) => (
                  <div key={item.articleCode} className="rounded-2xl border bg-background/70 p-3 shadow-sm">
                    <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                      <span>{item.name}</span>
                      <span>{item.quantity} uds</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.unitPrice ?? 0)}</p>
                    {item.notes ? <p className="text-xs text-primary">{item.notes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No tienes articulos pendientes.</p>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border bg-background/80 p-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Pendientes</span>
              <span className="font-semibold text-foreground">{formatCurrency(pendingTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Enviados</span>
              <span className="font-semibold text-foreground">{formatCurrency(sentTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide">
              <span>Cantidad pendiente</span>
              <span className="font-semibold text-foreground">{pendingQuantity}</span>
            </div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide">
              <span>Cantidad enviada</span>
              <span className="font-semibold text-foreground">{sentQuantity}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-foreground">{formatCurrency(itemsSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Servicio {SERVICE_RATE_LABEL}</span>
              <span className="font-semibold text-foreground">{formatCurrency(serviceCharge)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>IVA {VAT_RATE_LABEL}</span>
              <span className="font-semibold text-foreground">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold text-foreground">
              <span>Cuenta estimada</span>
              <span>{formatCurrency(estimatedTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wide">
              <span>Total articulos</span>
              <span className="font-semibold text-foreground">{totalGuests}</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={noteModalOpen}
        onClose={() => {
          setNoteModalOpen(false);
          setNoteTarget(null);
          setNoteDraft("");
        }}
        title="Notas rapidas"
        description="Agrega notas para cocina o barra."
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{noteTarget?.name}</p>
            <p className="text-xs text-muted-foreground">Describe ajustes o recordatorios para este articulo.</p>
          </div>
          <textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            className="min-h-[6rem] w-full rounded-2xl border bg-background/70 p-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Sin hielo, dividir cuenta, etc."
          />
          <div className="flex flex-wrap gap-2">
            {quickNotes.map((note) => {
              const isActive = noteTokens.includes(note);
              return (
                <button
                  key={note}
                  type="button"
                  onClick={() => toggleQuickNote(note)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition",
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/80 text-muted-foreground"
                  )}
                >
                  {note}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setNoteModalOpen(false);
                setNoteTarget(null);
                setNoteDraft("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveNotes}>Guardar notas</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
