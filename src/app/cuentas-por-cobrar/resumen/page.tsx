"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FileSpreadsheet, HandCoins, RefreshCw, Users2 } from "lucide-react";

import { FeatureGuardNotice } from "@/components/layout/feature-guard-notice";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { hasSessionPermission, isSessionAdministrator } from "@/lib/auth/session-roles";
import { publicFeatures } from "@/lib/features/public";
import { cn } from "@/lib/utils";
import { ApplicationsPanel, CustomersPanel, DashboardOverview, DocumentsPanel } from "../page-content";
import type {
  CustomerDocumentApplicationDTO,
  CustomerDocumentDTO,
  CustomerDocumentStatus,
  CustomerDocumentType,
} from "@/lib/types/cxc";

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

type CustomerDocumentEntry = CustomerDocumentDTO;

type DocumentApplicationEntry = CustomerDocumentApplicationDTO;

const DOCUMENT_TYPE_VALUES: CustomerDocumentType[] = [
  "INVOICE",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "RECEIPT",
  "RETENTION",
  "ADJUSTMENT",
];

const DOCUMENT_STATUS_VALUES: CustomerDocumentStatus[] = ["PENDIENTE", "PAGADO", "CANCELADO", "BORRADOR"];

export default function AccountsReceivableDashboardPage(): JSX.Element {
  const session = useSession();
  const { toast } = useToast();

  const retailEnabled = publicFeatures.retailModeEnabled;
  const isAdmin = isSessionAdministrator(session);
  const canViewBase = isAdmin || hasSessionPermission(session, "menu.cxc.view");
  const hasAccess = retailEnabled && canViewBase;

  const guardContent = !retailEnabled ? (
    <FeatureGuardNotice
      title="Cuentas por Cobrar no está disponible"
      description="Actualiza la configuración de la instancia para habilitar el módulo de cuentas por cobrar."
    />
  ) : !canViewBase ? (
    <FeatureGuardNotice
      title="No tienes acceso a Cuentas por Cobrar"
      description="Solicita al administrador que habilite el permiso menu.cxc.view para consultar clientes y documentos."
    />
  ) : null;

  const canManageCustomers = isAdmin || hasSessionPermission(session, "customers.manage");
  const canViewDocuments =
    isAdmin ||
    canViewBase ||
    hasSessionPermission(session, "customer.documents.manage") ||
    hasSessionPermission(session, "customer.collections.manage");
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
          const status =
            record.creditStatus === "BLOCKED" || record.creditStatus === "ON_HOLD"
              ? record.creditStatus
              : "ACTIVE";
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
          const typeRaw = typeof record.documentType === "string" ? record.documentType.trim().toUpperCase() : "INVOICE";
          const statusRaw = typeof record.status === "string" ? record.status.trim().toUpperCase() : "PENDIENTE";
          const documentType: CustomerDocumentType = DOCUMENT_TYPE_VALUES.includes(typeRaw as CustomerDocumentType)
            ? (typeRaw as CustomerDocumentType)
            : "INVOICE";
          const status: CustomerDocumentStatus = DOCUMENT_STATUS_VALUES.includes(statusRaw as CustomerDocumentStatus)
            ? (statusRaw as CustomerDocumentStatus)
            : "PENDIENTE";
          const metadata = typeof record.metadata === "object" && record.metadata !== null ? (record.metadata as Record<string, unknown>) : null;
          return {
            id: Number(record.id ?? 0) || 0,
            customerId: Number(record.customerId ?? 0) || 0,
            customerCode: typeof record.customerCode === "string" ? record.customerCode : "",
            customerName: typeof record.customerName === "string" ? record.customerName : "",
            documentType,
            documentNumber: typeof record.documentNumber === "string" ? record.documentNumber : "",
            documentDate:
              typeof record.documentDate === "string"
                ? record.documentDate
                : new Date().toISOString().slice(0, 10),
            dueDate: typeof record.dueDate === "string" ? record.dueDate : null,
            currencyCode: typeof record.currencyCode === "string" ? record.currencyCode : "NIO",
            originalAmount: Number(record.originalAmount ?? 0) || 0,
            balanceAmount: Number(record.balanceAmount ?? record.originalAmount ?? 0) || 0,
            status,
            reference: typeof record.reference === "string" ? record.reference : null,
            notes: typeof record.notes === "string" ? record.notes : null,
            metadata,
            paymentTermId: typeof record.paymentTermId === "number" ? record.paymentTermId : null,
            paymentTermCode: typeof record.paymentTermCode === "string" ? record.paymentTermCode : null,
            relatedInvoiceId: typeof record.relatedInvoiceId === "number" ? record.relatedInvoiceId : null,
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
            applicationDate:
              typeof record.applicationDate === "string"
                ? record.applicationDate
                : new Date().toISOString(),
            amount: Number(record.amount ?? 0) || 0,
            reference: typeof record.reference === "string" ? record.reference : null,
            notes: typeof record.notes === "string" ? record.notes : null,
            createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
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
      description:
        "El registro UI se liberará en la siguiente fase. Mientras tanto puedes operar mediante /api/cxc/gestiones o cargar gestiones desde el ERP.",
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

  const tabDefinitions: Array<{
    key: TabKey;
    label: string;
    description: string;
    icon: LucideIcon;
    enabled: boolean;
  }> = [
    { key: "customers", label: "Clientes", description: "Catálogo y líneas de crédito", icon: Users2, enabled: true },
    {
      key: "documents",
      label: "Documentos",
      description: "Facturas, notas y recibos",
      icon: FileSpreadsheet,
      enabled: canViewDocuments,
    },
    {
      key: "applications",
      label: "Aplicaciones",
      description: "Cruces de documentos",
      icon: HandCoins,
      enabled: canApplyDocuments || canViewDocuments || isAdmin,
    },
  ];

  if (!hasAccess && guardContent) {
    return guardContent;
  }

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Cartera de clientes</p>
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
                activeTab === key
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "bg-transparent text-foreground hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4" /> {label}
              </span>
              <span
                className={cn(
                  "text-xs",
                  activeTab === key ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {description}
              </span>
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
