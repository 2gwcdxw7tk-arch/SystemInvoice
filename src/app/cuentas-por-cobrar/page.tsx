"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, Clock3, FileSpreadsheet, HandCoins, Loader2, RefreshCw, Search, Users2 } from "lucide-react";

import { FeatureGuardNotice } from "@/components/layout/feature-guard-notice";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-provider";
import { formatCurrency } from "@/config/currency";
import { hasSessionPermission, isSessionAdministrator } from "@/lib/auth/session-roles";
import { publicFeatures } from "@/lib/features/public";
import { cn } from "@/lib/utils";

type TabKey = "customers" | "documents" | "applications";

type CustomerEntry = {
  id: number;
  code: string;
  name: string;
  taxId: string | null;
  isActive: boolean;
  paymentTermCode: string | null;
  creditLimit: number;
  creditUsed: number;
  creditOnHold: number;
  availableCredit: number;
  creditStatus: "ACTIVE" | "ON_HOLD" | "BLOCKED";
  lastCreditReviewAt: string | null;
  updatedAt: string | null;
};

type CustomerDocumentEntry = {
  id: number;
  customerId: number;
  customerCode: string;
  customerName: string;
  documentType: string;
  documentNumber: string;
  documentDate: string;
  dueDate: string | null;
  currencyCode: string;
  originalAmount: number;
  balanceAmount: number;
  status: "PENDIENTE" | "PAGADO" | "CANCELADO" | "BORRADOR";
  reference: string | null;
  paymentTermCode: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type DocumentApplicationEntry = {
  id: number;
  appliedDocumentId: number;
  targetDocumentId: number;
  applicationDate: string;
  amount: number;
  reference: string | null;
  notes: string | null;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
const DATETIME_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const PERCENT_FORMATTER = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 });

const formatDate = (value: string | null | undefined): string => {
  if (!value) {
    return "Sin registro";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Sin registro";
  }
  return DATE_FORMATTER.format(parsed);
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) {
    return "Sin registro";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Sin registro";
  }
  return DATETIME_FORMATTER.format(parsed);
};

const CREDIT_STATUS_LABELS: Record<CustomerEntry["creditStatus"], { label: string; tone: string }> = {
  ACTIVE: { label: "Crédito activo", tone: "text-emerald-600" },
  ON_HOLD: { label: "En revisión", tone: "text-amber-600" },
  BLOCKED: { label: "Bloqueado", tone: "text-destructive" },
};

export default function AccountsReceivablePage(): JSX.Element {
  const session = useSession();
  const { toast } = useToast();

  const retailEnabled = publicFeatures.retailModeEnabled;
  const isAdmin = isSessionAdministrator(session);
  const canViewBase = isAdmin || hasSessionPermission(session, "menu.cxc.view");
  const hasAccess = retailEnabled && canViewBase;

  const guardContent = !retailEnabled ? (
    <FeatureGuardNotice
      title="Cuentas por Cobrar solo para modo retail"
      description="Activa el modo retail (NEXT_PUBLIC_ES_RESTAURANTE=false) para trabajar con clientes, documentos y aplicaciones de crédito."
    />
  ) : !canViewBase ? (
    <FeatureGuardNotice
      title="No tienes acceso a Cuentas por Cobrar"
      description="Solicita al administrador que habilite el permiso menu.cxc.view para consultar clientes y documentos."
    />
  ) : null;

  const canManageCustomers = isAdmin || hasSessionPermission(session, "customers.manage");
  const canViewDocuments = isAdmin || canViewBase || hasSessionPermission(session, "customer.documents.manage") || hasSessionPermission(session, "customer.collections.manage");
  const canApplyDocuments = isAdmin || hasSessionPermission(session, "customer.documents.apply");
  const canManageCollections = isAdmin || hasSessionPermission(session, "customer.collections.manage");
  const canManageDisputes = isAdmin || hasSessionPermission(session, "customer.disputes.manage");

  const [activeTab, setActiveTab] = useState<TabKey>("customers");

  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showInactiveCustomers, setShowInactiveCustomers] = useState(false);

  const [documents, setDocuments] = useState<CustomerDocumentEntry[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [documentStatusFilter, setDocumentStatusFilter] = useState<"ALL" | CustomerDocumentEntry["status"]>("PENDIENTE");
  const [documentSearch, setDocumentSearch] = useState("");

  const [applications, setApplications] = useState<DocumentApplicationEntry[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationSearch, setApplicationSearch] = useState("");

  const loadCustomers = useCallback(async () => {
    if (!hasAccess) {
      setCustomers([]);
      setCustomersError(null);
      return;
    }
    setCustomersLoading(true);
    try {
      const response = await fetch("/api/cxc/clientes?includeInactive=true", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message ?? "No se pudieron obtener los clientes";
        throw new Error(message);
      }
      const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
      const normalized: CustomerEntry[] = items
        .filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((record: Record<string, unknown>): CustomerEntry => {
          const creditLimit = Number(record.creditLimit ?? 0) || 0;
          const creditUsed = Number(record.creditUsed ?? 0) || 0;
          const creditOnHold = Number(record.creditOnHold ?? 0) || 0;
          const available = Math.max(0, creditLimit - creditUsed - creditOnHold);
          const status = record.creditStatus === "BLOCKED" || record.creditStatus === "ON_HOLD" ? record.creditStatus : "ACTIVE";
          return {
            id: Number(record.id ?? 0) || 0,
            code: typeof record.code === "string" ? record.code : "",
            name: typeof record.name === "string" ? record.name : "",
            taxId: typeof record.taxId === "string" && record.taxId.length > 0 ? record.taxId : null,
            isActive: record.isActive !== false,
            paymentTermCode: typeof record.paymentTermCode === "string" ? record.paymentTermCode : null,
            creditLimit,
            creditUsed,
            creditOnHold,
            availableCredit: available,
            creditStatus: status,
            lastCreditReviewAt: typeof record.lastCreditReviewAt === "string" ? record.lastCreditReviewAt : null,
            updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
          } satisfies CustomerEntry;
        })
        .filter((entry: CustomerEntry) => entry.id > 0 && entry.code.length > 0)
        .sort((a: CustomerEntry, b: CustomerEntry) => a.name.localeCompare(b.name, "es"));
      setCustomers(normalized);
      setCustomersError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron obtener los clientes";
      setCustomersError(message);
      setCustomers([]);
      toast({ variant: "error", title: "Clientes", description: message });
    } finally {
      setCustomersLoading(false);
    }
  }, [hasAccess, toast]);

  const loadDocuments = useCallback(async () => {
    if (!hasAccess || !canViewDocuments) {
      setDocuments([]);
      return;
    }
    setDocumentsLoading(true);
    try {
      const query = new URLSearchParams({ includeSettled: "false", orderBy: "documentDate", limit: "200" });
      const response = await fetch(`/api/cxc/documentos?${query.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message ?? "No se pudieron obtener los documentos";
        throw new Error(message);
      }
      const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
      const normalized: CustomerDocumentEntry[] = items
        .filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((record: Record<string, unknown>): CustomerDocumentEntry => {
          return {
            id: Number(record.id ?? 0) || 0,
            customerId: Number(record.customerId ?? 0) || 0,
            customerCode: typeof record.customerCode === "string" ? record.customerCode : "",
            customerName: typeof record.customerName === "string" ? record.customerName : "",
            documentType: typeof record.documentType === "string" ? record.documentType : "INVOICE",
            documentNumber: typeof record.documentNumber === "string" ? record.documentNumber : "",
            documentDate: typeof record.documentDate === "string" ? record.documentDate : new Date().toISOString().slice(0, 10),
            dueDate: typeof record.dueDate === "string" ? record.dueDate : null,
            currencyCode: typeof record.currencyCode === "string" ? record.currencyCode : "NIO",
            originalAmount: Number(record.originalAmount ?? 0) || 0,
            balanceAmount: Number(record.balanceAmount ?? record.originalAmount ?? 0) || 0,
            status: record.status === "PAGADO" || record.status === "CANCELADO" || record.status === "BORRADOR" ? record.status : "PENDIENTE",
            reference: typeof record.reference === "string" ? record.reference : null,
            paymentTermCode: typeof record.paymentTermCode === "string" ? record.paymentTermCode : null,
            createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
            updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
          } satisfies CustomerDocumentEntry;
        })
        .filter((entry: CustomerDocumentEntry) => entry.id > 0 && entry.documentNumber.length > 0)
        .sort((a: CustomerDocumentEntry, b: CustomerDocumentEntry) => b.documentDate.localeCompare(a.documentDate));
      setDocuments(normalized);
      setDocumentsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron obtener los documentos";
      setDocumentsError(message);
      setDocuments([]);
      toast({ variant: "error", title: "Documentos", description: message });
    } finally {
      setDocumentsLoading(false);
    }
  }, [canViewDocuments, hasAccess, toast]);

  const loadApplications = useCallback(async () => {
    if (!hasAccess || (!canApplyDocuments && !isAdmin && !canViewDocuments)) {
      setApplications([]);
      return;
    }
    setApplicationsLoading(true);
    try {
      const response = await fetch("/api/cxc/documentos/aplicaciones", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message ?? "No se pudieron obtener las aplicaciones";
        throw new Error(message);
      }
      const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
      const normalized: DocumentApplicationEntry[] = items
        .filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((record: Record<string, unknown>): DocumentApplicationEntry => {
          return {
            id: Number(record.id ?? 0) || 0,
            appliedDocumentId: Number(record.appliedDocumentId ?? 0) || 0,
            targetDocumentId: Number(record.targetDocumentId ?? 0) || 0,
            applicationDate: typeof record.applicationDate === "string" ? record.applicationDate : new Date().toISOString(),
            amount: Number(record.amount ?? 0) || 0,
            reference: typeof record.reference === "string" ? record.reference : null,
            notes: typeof record.notes === "string" ? record.notes : null,
          } satisfies DocumentApplicationEntry;
        })
        .filter((entry: DocumentApplicationEntry) => entry.id > 0)
        .sort((a: DocumentApplicationEntry, b: DocumentApplicationEntry) => b.applicationDate.localeCompare(a.applicationDate));
      setApplications(normalized);
      setApplicationsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron obtener las aplicaciones";
      setApplicationsError(message);
      setApplications([]);
      toast({ variant: "error", title: "Aplicaciones", description: message });
    } finally {
      setApplicationsLoading(false);
    }
  }, [canApplyDocuments, canViewDocuments, hasAccess, isAdmin, toast]);

  const refreshAll = useCallback(() => {
    if (!hasAccess) {
      return;
    }
    void loadCustomers();
    if (canViewDocuments) {
      void loadDocuments();
    }
    if (canApplyDocuments || canViewDocuments || isAdmin) {
      void loadApplications();
    }
  }, [canApplyDocuments, canViewDocuments, hasAccess, isAdmin, loadApplications, loadCustomers, loadDocuments]);

  const handleOpenGestiones = useCallback(() => {
    if (!canManageCollections) {
      toast({ variant: "warning", title: "Gestiones", description: "No cuentas con permisos para gestionar cobranzas." });
      return;
    }
    setActiveTab("documents");
    toast({
      variant: "info",
      title: "Gestiones de cobranza",
      description: "El registro UI se liberará en la siguiente fase. Mientras tanto puedes operar mediante /api/cxc/gestiones o cargar gestiones desde el ERP.",
    });
  }, [canManageCollections, toast]);

  const handleOpenDisputas = useCallback(() => {
    if (!canManageDisputes) {
      toast({ variant: "warning", title: "Disputas", description: "No cuentas con permisos para gestionar disputas." });
      return;
    }
    setActiveTab("documents");
    toast({
      variant: "info",
      title: "Disputas de clientes",
      description: "Consulta y registra disputas por ahora mediante /api/cxc/disputas. La vista de seguimiento se integrará pronto.",
    });
  }, [canManageDisputes, toast]);

  useEffect(() => {
    if (!hasAccess) {
      return;
    }
    void loadCustomers();
  }, [hasAccess, loadCustomers]);

  useEffect(() => {
    if (!hasAccess || !canViewDocuments) {
      return;
    }
    void loadDocuments();
  }, [canViewDocuments, hasAccess, loadDocuments]);

  useEffect(() => {
    if (!hasAccess || !(canApplyDocuments || canViewDocuments || isAdmin)) {
      return;
    }
    void loadApplications();
  }, [canApplyDocuments, canViewDocuments, hasAccess, isAdmin, loadApplications]);

  useEffect(() => {
    if (!hasAccess) {
      return;
    }
    if (activeTab === "documents" && !canViewDocuments) {
      setActiveTab("customers");
    }
    if (activeTab === "applications" && !(canApplyDocuments || canViewDocuments || isAdmin)) {
      setActiveTab("customers");
    }
  }, [activeTab, canApplyDocuments, canViewDocuments, hasAccess, isAdmin]);

  const customerStats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((customer) => customer.isActive).length;
    const blocked = customers.filter((customer) => customer.creditStatus === "BLOCKED").length;
    const available = customers.reduce((acc, customer) => acc + customer.availableCredit, 0);
    const used = customers.reduce((acc, customer) => acc + customer.creditUsed + customer.creditOnHold, 0);
    return { total, active, blocked, available, used };
  }, [customers]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const documentStats = useMemo(() => {
    const total = documents.length;
    const pending = documents.filter((doc) => doc.status === "PENDIENTE");
    const pendingAmount = pending.reduce((acc, doc) => acc + doc.balanceAmount, 0);
    const overdue = pending.filter((doc) => doc.dueDate && doc.dueDate < todayIso);
    const overdueAmount = overdue.reduce((acc, doc) => acc + doc.balanceAmount, 0);
    const collected = documents
      .filter((doc) => doc.status === "PAGADO")
      .reduce((acc, doc) => acc + doc.originalAmount, 0);
    return { total, pending: pending.length, pendingAmount, overdue: overdue.length, overdueAmount, collected };
  }, [documents, todayIso]);

  const documentAging = useMemo(() => {
    const bucketTemplates = [
      { key: "current", label: "Al corriente", description: "No vencidos", amount: 0, count: 0 },
      { key: "d0_30", label: "0-30 días", description: "1-30 días vencidos", amount: 0, count: 0 },
      { key: "d31_60", label: "31-60 días", description: "31-60 días vencidos", amount: 0, count: 0 },
      { key: "d61_90", label: "61-90 días", description: "61-90 días vencidos", amount: 0, count: 0 },
      { key: "d90_plus", label: "90+ días", description: "Más de 90 días vencidos", amount: 0, count: 0 },
    ];

    const now = new Date(todayIso);
    const msPerDay = 1000 * 60 * 60 * 24;
    let totalAmount = 0;
    let overdueAmount = 0;

    for (const doc of documents) {
      if (doc.status !== "PENDIENTE") continue;
      const amount = Math.max(0, doc.balanceAmount);
      totalAmount += amount;
      let daysOverdue = 0;
      if (doc.dueDate) {
        const due = new Date(doc.dueDate);
        daysOverdue = Math.floor((now.getTime() - due.getTime()) / msPerDay);
      }
      let bucketIndex = 0;
      if (doc.dueDate && daysOverdue > 0) {
        overdueAmount += amount;
        if (daysOverdue <= 30) bucketIndex = 1;
        else if (daysOverdue <= 60) bucketIndex = 2;
        else if (daysOverdue <= 90) bucketIndex = 3;
        else bucketIndex = 4;
      }
      bucketTemplates[bucketIndex].amount += amount;
      bucketTemplates[bucketIndex].count += 1;
    }

    return {
      totalAmount,
      overdueAmount,
      buckets: bucketTemplates.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        description: bucket.description,
        amount: bucket.amount,
        count: bucket.count,
        percentage: totalAmount > 0 ? bucket.amount / totalAmount : 0,
      })),
    };
  }, [documents, todayIso]);

  const applicationsStats = useMemo(() => {
    const total = applications.length;
    const amount = applications.reduce((acc, item) => acc + item.amount, 0);
    const lastDate = applications[0]?.applicationDate ?? null;
    return { total, amount, lastDate };
  }, [applications]);

  const highUsageCustomers = useMemo(() => {
    return customers
      .filter((customer) => customer.creditLimit > 0)
      .map((customer) => {
        const used = customer.creditUsed + customer.creditOnHold;
        const usage = customer.creditLimit > 0 ? used / customer.creditLimit : 0;
        return {
          id: customer.id,
          code: customer.code,
          name: customer.name,
          usage,
          creditLimit: customer.creditLimit,
          availableCredit: customer.availableCredit,
          creditStatus: customer.creditStatus,
        };
      })
      .filter((entry) => entry.usage >= 0.8)
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 6);
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    return customers
      .filter((customer) => (showInactiveCustomers ? true : customer.isActive))
      .filter((customer) => {
        if (!term) return true;
        const haystack = `${customer.code} ${customer.name} ${customer.taxId ?? ""}`.toLowerCase();
        return haystack.includes(term);
      });
  }, [customers, customerSearch, showInactiveCustomers]);

  const filteredDocuments = useMemo(() => {
    const term = documentSearch.trim().toLowerCase();
    return documents
      .filter((doc) => (documentStatusFilter === "ALL" ? true : doc.status === documentStatusFilter))
      .filter((doc) => {
        if (!term) return true;
        const haystack = `${doc.documentNumber} ${doc.customerName} ${doc.reference ?? ""}`.toLowerCase();
        return haystack.includes(term);
      });
  }, [documents, documentSearch, documentStatusFilter]);

  const documentLookup = useMemo(() => {
    const map = new Map<number, CustomerDocumentEntry>();
    for (const doc of documents) {
      map.set(doc.id, doc);
    }
    return map;
  }, [documents]);

  const filteredApplications = useMemo(() => {
    const term = applicationSearch.trim().toLowerCase();
    return applications.filter((application) => {
      if (!term) return true;
      const origin = documentLookup.get(application.appliedDocumentId);
      const target = documentLookup.get(application.targetDocumentId);
      const haystack = [
        application.appliedDocumentId,
        origin?.documentNumber ?? "",
        origin?.customerName ?? "",
        application.targetDocumentId,
        target?.documentNumber ?? "",
        target?.customerName ?? "",
        application.reference ?? "",
        application.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [applications, applicationSearch, documentLookup]);

  const tabDefinitions: Array<{ key: TabKey; label: string; description: string; icon: ComponentType<{ className?: string }>; enabled: boolean }> = [
    { key: "customers", label: "Clientes", description: "Catálogo y líneas de crédito", icon: Users2, enabled: true },
    { key: "documents", label: "Documentos", description: "Facturas, notas y recibos", icon: FileSpreadsheet, enabled: canViewDocuments },
    { key: "applications", label: "Aplicaciones", description: "Cruces de documentos", icon: HandCoins, enabled: canApplyDocuments || canViewDocuments || isAdmin },
  ];

  if (!hasAccess && guardContent) {
    return guardContent;
  }

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Cartera retail</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Cuentas por Cobrar</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Consulta clientes, documentos y aplicaciones en un solo lugar. Los datos se sincronizan con las APIs CxC y respetan tus permisos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-2xl px-4" onClick={() => refreshAll()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refrescar datos
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 rounded-3xl border border-muted bg-background/80 p-2">
          {tabDefinitions.map(({ key, label, description, icon: Icon, enabled }) => (
            <button
              key={key}
              type="button"
              onClick={() => enabled && setActiveTab(key)}
              className={cn(
                "flex min-w-[160px] flex-1 flex-col rounded-2xl px-4 py-3 text-left transition",
                enabled ? "cursor-pointer" : "cursor-not-allowed opacity-40",
                activeTab === key ? "bg-primary text-primary-foreground shadow-lg" : "bg-transparent text-foreground hover:bg-muted"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4" /> {label}</span>
              <span className={cn("text-xs", activeTab === key ? "text-primary-foreground/80" : "text-muted-foreground")}>{description}</span>
            </button>
          ))}
        </div>
      </header>

      <DashboardOverview
        aging={documentAging}
        highUsage={highUsageCustomers}
        pendingAmount={documentStats.pendingAmount}
        overdueAmount={documentStats.overdueAmount}
        canManageCollections={canManageCollections}
        canManageDisputes={canManageDisputes}
        onOpenGestiones={handleOpenGestiones}
        onOpenDisputas={handleOpenDisputas}
      />

      {activeTab === "customers" ? (
        <CustomersPanel
          customers={filteredCustomers}
          stats={customerStats}
          loading={customersLoading}
          error={customersError}
          search={customerSearch}
          onSearchChange={setCustomerSearch}
          showInactive={showInactiveCustomers}
          onToggleInactive={() => setShowInactiveCustomers((prev) => !prev)}
          onRetry={loadCustomers}
          canManage={canManageCustomers}
        />
      ) : null}

      {activeTab === "documents" ? (
        <DocumentsPanel
          documents={filteredDocuments}
          stats={documentStats}
          loading={documentsLoading}
          error={documentsError}
          search={documentSearch}
          onSearchChange={setDocumentSearch}
          statusFilter={documentStatusFilter}
          onStatusChange={setDocumentStatusFilter}
          onRetry={loadDocuments}
        />
      ) : null}

      {activeTab === "applications" ? (
        <ApplicationsPanel
          applications={filteredApplications}
          stats={applicationsStats}
          loading={applicationsLoading}
          error={applicationsError}
          search={applicationSearch}
          onSearchChange={setApplicationSearch}
          onRetry={loadApplications}
          lookup={documentLookup}
        />
      ) : null}
    </section>
  );
}

type AgingSummary = {
  totalAmount: number;
  overdueAmount: number;
  buckets: Array<{
    key: string;
    label: string;
    description: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
};

type HighUsageEntry = {
  id: number;
  code: string;
  name: string;
  usage: number;
  creditLimit: number;
  availableCredit: number;
  creditStatus: CustomerEntry["creditStatus"];
};

function DashboardOverview({
  aging,
  highUsage,
  pendingAmount,
  overdueAmount,
  canManageCollections,
  canManageDisputes,
  onOpenGestiones,
  onOpenDisputas,
}: {
  aging: AgingSummary;
  highUsage: HighUsageEntry[];
  pendingAmount: number;
  overdueAmount: number;
  canManageCollections: boolean;
  canManageDisputes: boolean;
  onOpenGestiones: () => void;
  onOpenDisputas: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AgingBreakdownCard aging={aging} />
      <HighUsageCard items={highUsage} />
      <QuickActionsCard
        pendingAmount={pendingAmount}
        overdueAmount={overdueAmount}
        canManageCollections={canManageCollections}
        canManageDisputes={canManageDisputes}
        onOpenGestiones={onOpenGestiones}
        onOpenDisputas={onOpenDisputas}
      />
    </div>
  );
}

function AgingBreakdownCard({ aging }: { aging: AgingSummary }) {
  return (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-lg font-semibold">Aging de cartera</CardTitle>
          <CardDescription>Saldo pendiente agrupado por días de vencimiento.</CardDescription>
        </div>
        <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
          <Clock3 className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {aging.buckets.map((bucket) => {
          const percentageValue = Math.max(0, Math.min(100, Math.round(bucket.percentage * 100)));
          return (
            <div key={bucket.key} className="space-y-1.5 rounded-2xl border border-muted/60 bg-background/80 px-3 py-2">
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>{bucket.label}</span>
                <span>{formatCurrency(bucket.amount, { currency: "local" })}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{bucket.description}</span>
                <span>
                  {bucket.count} doc · {PERCENT_FORMATTER.format(bucket.percentage)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percentageValue}%` }} />
              </div>
            </div>
          );
        })}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          Saldo pendiente total: {formatCurrency(aging.totalAmount, { currency: "local" })} · Vencido: {formatCurrency(aging.overdueAmount, { currency: "local" })}
        </div>
      </CardContent>
    </Card>
  );
}

function HighUsageCard({ items }: { items: HighUsageEntry[] }) {
  return (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-lg font-semibold">Clientes al límite</CardTitle>
          <CardDescription>Alertas al superar el 80% del crédito autorizado.</CardDescription>
        </div>
        <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
          <AlertTriangle className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-muted px-3 py-4 text-sm text-muted-foreground">
            No hay clientes por arriba del 80% de su línea.
          </div>
        ) : (
          items.map((item) => {
            const usagePercent = Math.min(100, Math.round(item.usage * 100));
            const statusMeta = CREDIT_STATUS_LABELS[item.creditStatus];
            return (
              <div key={item.id} className="space-y-1.5 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2">
                <div className="flex items-center justify-between text-sm font-semibold text-destructive">
                  <span>{item.code} • {item.name}</span>
                  <span>{usagePercent}% usado</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{statusMeta.label}</span>
                  <span>Disponible: {formatCurrency(item.availableCredit, { currency: "local" })}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-destructive/20">
                  <div className="h-full rounded-full bg-destructive" style={{ width: `${usagePercent}%` }} />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function QuickActionsCard({
  pendingAmount,
  overdueAmount,
  canManageCollections,
  canManageDisputes,
  onOpenGestiones,
  onOpenDisputas,
}: {
  pendingAmount: number;
  overdueAmount: number;
  canManageCollections: boolean;
  canManageDisputes: boolean;
  onOpenGestiones: () => void;
  onOpenDisputas: () => void;
}) {
  return (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-lg font-semibold">Gestiones rápidas</CardTitle>
          <CardDescription>Da seguimiento a cobranza y reclamos.</CardDescription>
        </div>
        <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
          <HandCoins className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-2xl border border-muted/60 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
          Saldo pendiente: {formatCurrency(pendingAmount, { currency: "local" })} · Vencido: {formatCurrency(overdueAmount, { currency: "local" })}
        </div>
        <div className="space-y-2">
          <Button type="button" onClick={onOpenGestiones} className="flex w-full items-center justify-between rounded-2xl px-4 py-2" variant={canManageCollections ? "default" : "outline"}>
            <span className="text-left">
              <span className="block text-sm font-semibold">Gestiones de cobranza</span>
              <span className="block text-xs opacity-80">Registrar recordatorios y compromisos</span>
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button type="button" onClick={onOpenDisputas} className="flex w-full items-center justify-between rounded-2xl px-4 py-2" variant={canManageDisputes ? "default" : "outline"}>
            <span className="text-left">
              <span className="block text-sm font-semibold">Disputas de clientes</span>
              <span className="block text-xs opacity-80">Documentar reclamos y ajustes</span>
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="rounded-2xl border border-muted/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Las capturas UI se publicarán pronto. Mientras tanto, utiliza los endpoints
          {" "}
          <code className="rounded bg-background px-1 py-0.5 text-[11px] font-semibold text-foreground">/api/cxc/gestiones</code>
          {" y "}
          <code className="rounded bg-background px-1 py-0.5 text-[11px] font-semibold text-foreground">/api/cxc/disputas</code>.
        </div>
      </CardContent>
    </Card>
  );
}

function CustomersPanel({
  customers,
  stats,
  loading,
  error,
  search,
  onSearchChange,
  showInactive,
  onToggleInactive,
  onRetry,
  canManage,
}: {
  customers: CustomerEntry[];
  stats: { total: number; active: number; blocked: number; available: number; used: number };
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  showInactive: boolean;
  onToggleInactive: () => void;
  onRetry: () => void;
  canManage: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Clientes registrados" caption="Activos e inactivos" value={stats.total.toLocaleString("es-MX")}
          tone="text-foreground" icon={Users2} />
        <StatCard title="Activos" caption="Disponibles para crédito" value={stats.active.toLocaleString("es-MX")} tone="text-emerald-600" icon={CheckCircle2} />
        <StatCard title="Bloqueados" caption="Crédito suspendido" value={stats.blocked.toLocaleString("es-MX")} tone="text-destructive" icon={CircleAlert} />
        <StatCard
          title="Crédito disponible"
          caption="Líneas menos uso"
          value={formatCurrency(stats.available, { currency: "local" })}
          tone="text-primary"
          icon={HandCoins}
        />
      </div>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="gap-4 pb-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Catálogo de clientes</CardTitle>
              <CardDescription>Consulta datos generales, límites y estatus de crédito.</CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-muted bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Buscar por código, nombre o RUC"
                  className="h-9 border-none px-0"
                />
              </div>
              <Button type="button" variant={showInactive ? "default" : "outline"} className="rounded-2xl" onClick={onToggleInactive}>
                {showInactive ? "Mostrar solo activos" : "Incluir inactivos"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-muted p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando clientes…
            </div>
          ) : null}
          {!loading && error ? (
            <div className="flex items-center justify-between rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <span>{error}</span>
              <Button type="button" variant="outline" className="rounded-2xl" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          ) : null}
          {!loading && !error ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Crédito</th>
                    <th className="px-3 py-2">Condición</th>
                    <th className="px-3 py-2">Uso</th>
                    <th className="px-3 py-2">Actualización</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No se encontraron clientes con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    customers.map((customer) => {
                      const statusMeta = CREDIT_STATUS_LABELS[customer.creditStatus];
                      const usagePercent = customer.creditLimit > 0
                        ? Math.round(((customer.creditUsed + customer.creditOnHold) / customer.creditLimit) * 100)
                        : 0;
                      return (
                        <tr key={customer.id} className="rounded-2xl border border-transparent bg-background/80 shadow-sm transition hover:border-primary/40">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-foreground">{customer.code} • {customer.name}</div>
                            <div className="text-xs text-muted-foreground">
                              RUC/NIT: {customer.taxId ?? "Sin registro"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {customer.isActive ? "Activo" : "Inactivo"} · <span className={statusMeta.tone}>{statusMeta.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm font-semibold text-foreground">{formatCurrency(customer.creditLimit, { currency: "local" })}</div>
                            <div className="text-xs text-muted-foreground">Disponible: {formatCurrency(customer.availableCredit, { currency: "local" })}</div>
                            <div className="text-xs text-muted-foreground">Retenido: {formatCurrency(customer.creditOnHold, { currency: "local" })}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm text-foreground">{customer.paymentTermCode ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">Última revisión: {formatDate(customer.lastCreditReviewAt)}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm font-semibold text-foreground">{usagePercent}%</div>
                            <div className="text-xs text-muted-foreground">Utilizado: {formatCurrency(customer.creditUsed, { currency: "local" })}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(customer.updatedAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {canManage ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-primary">
              Las acciones de alta y edición estarán disponibles en el siguiente sprint.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentsPanel({
  documents,
  stats,
  loading,
  error,
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onRetry,
}: {
  documents: CustomerDocumentEntry[];
  stats: { total: number; pending: number; pendingAmount: number; overdue: number; overdueAmount: number; collected: number };
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: "ALL" | CustomerDocumentEntry["status"];
  onStatusChange: (value: "ALL" | CustomerDocumentEntry["status"]) => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Documentos registrados" caption="Últimos 200 movimientos" value={stats.total.toLocaleString("es-MX")}
          tone="text-foreground" icon={FileSpreadsheet} />
        <StatCard title="Pendientes" caption="Con saldo abierto" value={stats.pending.toLocaleString("es-MX")} tone="text-amber-600" icon={CircleAlert} />
        <StatCard
          title="Saldo pendiente"
          caption="Incluye vencidos"
          value={formatCurrency(stats.pendingAmount, { currency: "local" })}
          tone="text-primary"
          icon={HandCoins}
        />
        <StatCard
          title="Cobranzas registradas"
          caption="Pagados en el histórico"
          value={formatCurrency(stats.collected, { currency: "local" })}
          tone="text-emerald-600"
          icon={CheckCircle2}
        />
      </div>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="gap-4 pb-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Documentos de clientes</CardTitle>
              <CardDescription>Facturas, recibos, notas y retenciones aplicadas.</CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-muted bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Buscar documento, cliente o referencia"
                  className="h-9 border-none px-0"
                />
              </div>
              <div className="flex gap-2 rounded-2xl border border-muted bg-background px-2 py-1">
                <Button
                  type="button"
                  variant={statusFilter === "PENDIENTE" ? "default" : "ghost"}
                  className="rounded-2xl"
                  onClick={() => onStatusChange("PENDIENTE")}
                >
                  Pendientes
                </Button>
                <Button
                  type="button"
                  variant={statusFilter === "ALL" ? "default" : "ghost"}
                  className="rounded-2xl"
                  onClick={() => onStatusChange("ALL")}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  variant={statusFilter === "PAGADO" ? "default" : "ghost"}
                  className="rounded-2xl"
                  onClick={() => onStatusChange("PAGADO")}
                >
                  Pagados
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-muted p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos…
            </div>
          ) : null}
          {!loading && error ? (
            <div className="flex items-center justify-between rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <span>{error}</span>
              <Button type="button" variant="outline" className="rounded-2xl" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          ) : null}
          {!loading && !error ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Emisión</th>
                    <th className="px-3 py-2">Vencimiento</th>
                    <th className="px-3 py-2">Montos</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No se encontraron documentos con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => {
                      const isOverdue = doc.status === "PENDIENTE" && doc.dueDate && doc.dueDate < new Date().toISOString().slice(0, 10);
                      return (
                        <tr key={doc.id} className="rounded-2xl border border-transparent bg-background/80 shadow-sm transition hover:border-primary/40">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-foreground">{doc.documentType} • {doc.documentNumber}</div>
                            <div className="text-xs text-muted-foreground">Referencia: {doc.reference ?? "Sin referencia"}</div>
                            <div className="text-xs text-muted-foreground">Condición: {doc.paymentTermCode ?? "—"}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm font-medium text-foreground">{doc.customerCode} • {doc.customerName}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(doc.documentDate)}</td>
                          <td className="px-3 py-3 text-xs">
                            <span className={cn(isOverdue ? "text-destructive font-semibold" : "text-muted-foreground")}>{formatDate(doc.dueDate)}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="text-sm text-foreground">Total: {formatCurrency(doc.originalAmount, { currency: "local" })}</div>
                            <div className="text-xs text-muted-foreground">Saldo: {formatCurrency(doc.balanceAmount, { currency: "local" })}</div>
                          </td>
                          <td className="px-3 py-3 text-xs">
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 font-semibold",
                                doc.status === "PENDIENTE" && !isOverdue ? "bg-amber-100 text-amber-800" :
                                doc.status === "PENDIENTE" && isOverdue ? "bg-destructive/10 text-destructive" :
                                doc.status === "PAGADO" ? "bg-emerald-100 text-emerald-700" :
                                "bg-muted text-muted-foreground"
                              )}
                            >
                              {doc.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ApplicationsPanel({
  applications,
  stats,
  loading,
  error,
  search,
  onSearchChange,
  onRetry,
  lookup,
}: {
  applications: DocumentApplicationEntry[];
  stats: { total: number; amount: number; lastDate: string | null };
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onRetry: () => void;
  lookup: Map<number, CustomerDocumentEntry>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Aplicaciones registradas" caption="Cruces históricos" value={stats.total.toLocaleString("es-MX")}
          tone="text-foreground" icon={HandCoins} />
        <StatCard
          title="Monto aplicado"
          caption="Acumulado"
          value={formatCurrency(stats.amount, { currency: "local" })}
          tone="text-primary"
          icon={HandCoins}
        />
        <StatCard
          title="Última aplicación"
          caption="Fecha registrada"
          value={stats.lastDate ? formatDateTime(stats.lastDate) : "Sin registro"}
          tone="text-muted-foreground"
          icon={CheckCircle2}
        />
      </div>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="gap-4 pb-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Aplicaciones de documentos</CardTitle>
              <CardDescription>Recibos, retenciones y notas aplicadas contra facturas.</CardDescription>
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-muted bg-background px-3 sm:max-w-md">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Buscar por documento, cliente o referencia"
                className="h-9 border-none px-0"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-muted p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando aplicaciones…
            </div>
          ) : null}
          {!loading && error ? (
            <div className="flex items-center justify-between rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <span>{error}</span>
              <Button type="button" variant="outline" className="rounded-2xl" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          ) : null}
          {!loading && !error ? (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Documento aplicado</th>
                    <th className="px-3 py-2">Documento objetivo</th>
                    <th className="px-3 py-2">Monto</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No se encontraron aplicaciones para mostrar.
                      </td>
                    </tr>
                  ) : (
                    applications.map((app) => {
                      const origin = lookup.get(app.appliedDocumentId);
                      const target = lookup.get(app.targetDocumentId);
                      return (
                        <tr key={app.id} className="rounded-2xl border border-transparent bg-background/80 shadow-sm transition hover:border-primary/40">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-foreground">{origin ? `${origin.documentType} • ${origin.documentNumber}` : `#${app.appliedDocumentId}`}</div>
                            <div className="text-xs text-muted-foreground">{origin ? `${origin.customerCode} • ${origin.customerName}` : "Documento no cargado"}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-foreground">{target ? `${target.documentType} • ${target.documentNumber}` : `#${app.targetDocumentId}`}</div>
                            <div className="text-xs text-muted-foreground">{target ? `${target.customerCode} • ${target.customerName}` : "Documento no cargado"}</div>
                          </td>
                          <td className="px-3 py-3 text-sm text-foreground">{formatCurrency(app.amount, { currency: "local" })}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(app.applicationDate)}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            <div>Referencia: {app.reference ?? "—"}</div>
                            <div>Notas: {app.notes ?? "—"}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  caption,
  value,
  tone,
  icon: Icon,
}: {
  title: string;
  caption: string;
  value: string;
  tone: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-xs uppercase text-muted-foreground">{title}</CardTitle>
          <div className={cn("mt-2 text-2xl font-semibold", tone)}>{value}</div>
          <CardDescription className="text-xs text-muted-foreground">{caption}</CardDescription>
        </div>
        <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
    </Card>
  );
}
