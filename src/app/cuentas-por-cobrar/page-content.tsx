"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2, CircleAlert, Clock3, FileSpreadsheet, HandCoins, LayoutDashboard, Loader2, Pencil, Plus, RefreshCw, Search, Users2, Ban } from "lucide-react";

import { FeatureGuardNotice } from "@/components/layout/feature-guard-notice";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { formatCurrency } from "@/config/currency";
import { hasSessionPermission, isSessionAdministrator } from "@/lib/auth/session-roles";
import { publicFeatures } from "@/lib/features/public";
import { cn } from "@/lib/utils";
import type {
  CustomerDTO,
  CustomerDocumentDTO,
  CustomerDocumentApplicationDTO,
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

type CxcMode = "menu" | "resumen" | "clientes" | "documentos" | "reportes";
type ModeCardKey = Exclude<CxcMode, "menu">;
type LinkHref = Parameters<typeof Link>[0]["href"];

const MODE_TITLES: Record<ModeCardKey, string> = {
  resumen: "Panel general",
  clientes: "Control de clientes",
  documentos: "Documentos",
  reportes: "Reportes",
};

type ModeCardDefinition = {
  key: ModeCardKey;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  enabled: boolean;
  href: LinkHref;
};

const buildModeHref = (mode: CxcMode): LinkHref => {
  if (mode === "menu") {
    return "/cuentas-por-cobrar";
  }
  return {
    pathname: "/cuentas-por-cobrar",
    query: { mode },
  };
};

const cardIconClasses = "flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary";

function normalizeMode(value: string | null): CxcMode {
  if (!value) return "menu";
  if (value === "menu") return "menu";
  return ["resumen", "clientes", "documentos", "reportes"].includes(value)
    ? (value as CxcMode)
    : "menu";
}

export default function AccountsReceivablePage(): JSX.Element {
  const session = useSession();
  const searchParams = useSearchParams();

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

  const mode = normalizeMode(searchParams.get("mode"));

  const canManageCustomers = isAdmin || hasSessionPermission(session, "customers.manage");
  const canViewDocuments =
    isAdmin ||
    canViewBase ||
    hasSessionPermission(session, "customer.documents.manage") ||
    hasSessionPermission(session, "customer.collections.manage");
  const canManageDocuments = isAdmin || hasSessionPermission(session, "customer.documents.manage");
  const canApplyDocuments = isAdmin || hasSessionPermission(session, "customer.documents.apply");

  const cards: ModeCardDefinition[] = useMemo(() => {
    return [
      {
        key: "resumen",
        title: "Panel general",
        description: "Indicadores rápidos y seguimiento de cartera.",
        icon: LayoutDashboard,
        enabled: hasAccess,
        href: buildModeHref("resumen"),
      },
      {
        key: "clientes",
        title: "Catálogo de clientes",
        description: "Altas, edición y líneas de crédito.",
        icon: Users2,
        enabled: hasAccess,
        href: buildModeHref("clientes"),
      },
      {
        key: "documentos",
        title: "Documentos",
        description: "Facturas, notas y recibos con saldo.",
        icon: FileSpreadsheet,
        enabled: hasAccess && canViewDocuments,
        href: buildModeHref("documentos"),
      },
      {
        key: "reportes",
        title: "Reportes",
        description: "Resumen, vencimientos y estados de cuenta.",
        icon: BarChart3,
        enabled: hasAccess,
        href: buildModeHref("reportes"),
      },
    ];
  }, [canViewDocuments, hasAccess]);

  if (!hasAccess && guardContent) {
    return guardContent;
  }

  if (mode === "menu") {
    return (
      <section className="space-y-10 pb-16">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Cartera de clientes</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Cuentas por Cobrar</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Accede a los módulos de clientes, documentos, aplicaciones y reportes de cuentas por cobrar. Las opciones disponibles respetan tus permisos de sesión.
          </p>
        </header>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {cards.filter((card) => card.enabled).map(({ key, title, description, icon: Icon, href }) => (
            <Card key={key} className="relative flex h-full flex-col justify-between rounded-3xl border bg-background/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
              <CardHeader className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className={cardIconClasses}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {MODE_TITLES[key]}
                  </span>
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-xl font-semibold text-foreground">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Button type="button" className="w-full justify-between rounded-2xl" asChild>
                  <Link href={href}>
                    <span>Ingresar</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  const title = MODE_TITLES[mode as ModeCardKey] ?? "Cuentas por Cobrar";

  let content: JSX.Element | null = null;
  switch (mode) {
    case "resumen":
      content = <AccountsReceivableDashboardPage />;
      break;
    case "clientes":
      content = (
        <CustomersCrudPage
          canManageCustomers={canManageCustomers}
          hasAccess={hasAccess}
        />
      );
      break;
    case "documentos":
      content = (
        <CxcDocumentsPage
          canViewDocuments={canViewDocuments}
          canManageDocuments={canManageDocuments}
          canApplyDocuments={canApplyDocuments}
          hasAccess={hasAccess}
        />
      );
      break;
    case "reportes":
      content = <CxcReportsLanding />;
      break;
    default:
      content = null;
      break;
  }

  if (!content) {
    return (
      <section className="space-y-8 pb-16">
        <header className="space-y-2">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link href={buildModeHref("menu")} className="inline-flex items-center gap-1 rounded-full border border-muted px-3 py-1 transition hover:bg-muted">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <span>/</span>
            <span>{title}</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        </header>
        <Card className="rounded-3xl border bg-background/95 p-6 text-sm text-muted-foreground shadow-sm">
          Esta vista no está disponible.
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-8 pb-16">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Link href={buildModeHref("menu")} className="inline-flex items-center gap-1 rounded-full border border-muted px-3 py-1 transition hover:bg-muted">
                <ArrowLeft className="h-3 w-3" />
                Menú CxC
              </Link>
              <span>/</span>
              <span>{title}</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Gestiona la información de cuentas por cobrar desde esta sección.
            </p>
          </div>
        </div>
      </header>
      {content}
    </section>
  );
}

const CREDIT_STATUS_OPTIONS: Array<ComboboxOption<string>> = [
  { value: "ACTIVE", label: "Crédito activo", description: "Disponible para ventas" },
  { value: "ON_HOLD", label: "En revisión", description: "Bloqueo temporal" },
  { value: "BLOCKED", label: "Bloqueado", description: "Sin crédito autorizado" },
];

const toNullableString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  return value === null ? null : null;
};

const normalizeCustomerRecord = (record: Record<string, unknown>): CustomerDTO | null => {
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const id = Number(record.id ?? 0) || 0;
  if (!code || !name || id <= 0) {
    return null;
  }

  const creditLimit = Number(record.creditLimit ?? 0) || 0;
  const creditUsed = Number(record.creditUsed ?? 0) || 0;
  const creditOnHold = Number(record.creditOnHold ?? 0) || 0;
  const creditStatusRaw = typeof record.creditStatus === "string" ? record.creditStatus.trim().toUpperCase() : "ACTIVE";
  const creditStatus: CustomerDTO["creditStatus"] = creditStatusRaw === "ON_HOLD" || creditStatusRaw === "BLOCKED" ? (creditStatusRaw as CustomerDTO["creditStatus"]) : "ACTIVE";

  const normalizeCountryCode = (): string | null => {
    if (typeof record.countryCode === "string" && record.countryCode.trim().length > 0) {
      return record.countryCode.trim().toUpperCase();
    }
    return null;
  };

  const paymentTermId = typeof record.paymentTermId === "number" ? record.paymentTermId : null;
  const paymentTermCode = typeof record.paymentTermCode === "string" && record.paymentTermCode.trim().length > 0 ? record.paymentTermCode.trim().toUpperCase() : null;

  return {
    id,
    code,
    name,
    tradeName: toNullableString(record.tradeName),
    taxId: toNullableString(record.taxId),
    email: toNullableString(record.email),
    phone: toNullableString(record.phone),
    mobilePhone: toNullableString(record.mobilePhone),
    billingAddress: toNullableString(record.billingAddress),
    city: toNullableString(record.city),
    state: toNullableString(record.state),
    countryCode: normalizeCountryCode(),
    postalCode: toNullableString(record.postalCode),
    paymentTermId,
    paymentTermCode,
    creditLimit,
    creditUsed,
    creditOnHold,
    creditStatus,
    creditHoldReason: toNullableString(record.creditHoldReason),
    lastCreditReviewAt: typeof record.lastCreditReviewAt === "string" ? record.lastCreditReviewAt : null,
    nextCreditReviewAt: typeof record.nextCreditReviewAt === "string" ? record.nextCreditReviewAt : null,
    isActive: record.isActive !== false,
    notes: toNullableString(record.notes),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  } satisfies CustomerDTO;
};

const normalizePaymentTermOption = (record: Record<string, unknown>): ComboboxOption<string> | null => {
  if (typeof record.code !== "string" || record.code.trim().length === 0) {
    return null;
  }
  const code = record.code.trim().toUpperCase();
  const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : code;
  const isActive = record.isActive !== false;
  return {
    value: code,
    label: `${code} · ${name}`,
    description: isActive ? "Activa" : "Inactiva",
  } satisfies ComboboxOption<string>;
};

const DOCUMENT_TYPE_VALUES: CustomerDocumentType[] = [
  "INVOICE",
  "CREDIT_NOTE",
  "DEBIT_NOTE",
  "RECEIPT",
  "RETENTION",
  "ADJUSTMENT",
];

const DOCUMENT_STATUS_VALUES: CustomerDocumentStatus[] = ["PENDIENTE", "PAGADO", "CANCELADO", "BORRADOR"];

const CREDIT_DOCUMENT_TYPES = new Set<CustomerDocumentType>(["RECEIPT", "CREDIT_NOTE", "RETENTION", "ADJUSTMENT"]);
const DEBIT_DOCUMENT_TYPES = new Set<CustomerDocumentType>(["INVOICE", "DEBIT_NOTE"]);

const isCustomerDocumentType = (value: unknown): value is CustomerDocumentType =>
  typeof value === "string" && DOCUMENT_TYPE_VALUES.includes(value as CustomerDocumentType);

const normalizeDocumentRecord = (record: Record<string, unknown>): CustomerDocumentEntry | null => {
  const id = Number(record.id ?? 0);
  const customerId = Number(record.customerId ?? 0);
  const documentNumber = typeof record.documentNumber === "string" ? record.documentNumber.trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(customerId) || customerId <= 0 || documentNumber.length === 0) {
    return null;
  }

  const documentTypeRaw = typeof record.documentType === "string" ? record.documentType.trim().toUpperCase() : "INVOICE";
  const statusRaw = typeof record.status === "string" ? record.status.trim().toUpperCase() : "PENDIENTE";
  const documentType = DOCUMENT_TYPE_VALUES.includes(documentTypeRaw as CustomerDocumentType)
    ? (documentTypeRaw as CustomerDocumentType)
    : "INVOICE";
  const status = DOCUMENT_STATUS_VALUES.includes(statusRaw as CustomerDocumentStatus)
    ? (statusRaw as CustomerDocumentStatus)
    : "PENDIENTE";

  const documentDate = typeof record.documentDate === "string" ? record.documentDate : new Date().toISOString().slice(0, 10);
  const dueDate = typeof record.dueDate === "string" ? record.dueDate : null;
  const currencyCode = typeof record.currencyCode === "string" && record.currencyCode.trim().length === 3
    ? record.currencyCode.trim().toUpperCase()
    : "NIO";

  const originalAmount = Number(record.originalAmount ?? 0) || 0;
  const balanceAmount = Number(record.balanceAmount ?? record.originalAmount ?? 0) || 0;
  const reference = typeof record.reference === "string" ? record.reference : null;
  const notes = typeof record.notes === "string" ? record.notes : null;
  const paymentTermId = typeof record.paymentTermId === "number" ? record.paymentTermId : null;
  const paymentTermCode =
    typeof record.paymentTermCode === "string" && record.paymentTermCode.trim().length > 0
      ? record.paymentTermCode.trim()
      : null;
  const relatedInvoiceId = typeof record.relatedInvoiceId === "number" ? record.relatedInvoiceId : null;
  const metadata = typeof record.metadata === "object" && record.metadata !== null ? (record.metadata as Record<string, unknown>) : null;

  return {
    id,
    customerId,
    customerCode: typeof record.customerCode === "string" ? record.customerCode : "",
    customerName: typeof record.customerName === "string" ? record.customerName : "",
    documentType,
    documentNumber,
    documentDate,
    dueDate,
    currencyCode,
    originalAmount,
    balanceAmount,
    status,
    reference,
    notes,
    metadata,
    paymentTermId,
    paymentTermCode,
    relatedInvoiceId,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  } satisfies CustomerDocumentEntry;
};

const isCreditDocumentType = (documentType: CustomerDocumentType): boolean => CREDIT_DOCUMENT_TYPES.has(documentType);
const isDebitDocumentTypeLocal = (documentType: CustomerDocumentType): boolean => DEBIT_DOCUMENT_TYPES.has(documentType);
const getTodayIsoDate = (): string => new Date().toISOString().slice(0, 10);
const DEFAULT_DOCUMENT_CURRENCY = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE?.trim().toUpperCase() ?? "NIO";

const DOCUMENT_TYPE_LABELS: Record<CustomerDocumentType, string> = {
  INVOICE: "Factura",
  CREDIT_NOTE: "Nota de crédito",
  DEBIT_NOTE: "Nota de débito",
  RECEIPT: "Recibo",
  RETENTION: "Retención",
  ADJUSTMENT: "Ajuste",
};

const DOCUMENT_TYPE_OPTIONS: Array<ComboboxOption<CustomerDocumentType>> = DOCUMENT_TYPE_VALUES.map((value) => ({
  value,
  label: DOCUMENT_TYPE_LABELS[value] ?? value,
}));

type DocumentPaymentTerm = {
  id: number | null;
  code: string;
  name: string;
  days: number;
  graceDays: number;
  isActive: boolean;
};

type CreateDocumentFormState = {
  customerId: number | null;
  documentType: CustomerDocumentType;
  documentNumber: string;
  documentDate: string;
  dueDate: string | null;
  currencyCode: string;
  originalAmount: string;
  balanceAmount: string;
  reference: string;
  notes: string;
  paymentTermCode: string | null;
};

type CreateDocumentState = {
  open: boolean;
  loading: boolean;
  saving: boolean;
  customers: CustomerDTO[];
  paymentTerms: DocumentPaymentTerm[];
  error: string | null;
  form: CreateDocumentFormState;
};

const createInitialDocumentForm = (): CreateDocumentFormState => ({
  customerId: null,
  documentType: "INVOICE",
  documentNumber: "",
  documentDate: getTodayIsoDate(),
  dueDate: null,
  currencyCode: DEFAULT_DOCUMENT_CURRENCY,
  originalAmount: "",
  balanceAmount: "",
  reference: "",
  notes: "",
  paymentTermCode: null,
});

const createInitialCreateState = (): CreateDocumentState => ({
  open: false,
  loading: false,
  saving: false,
  customers: [],
  paymentTerms: [],
  error: null,
  form: createInitialDocumentForm(),
});

const normalizeDocumentPaymentTerm = (record: Record<string, unknown>): DocumentPaymentTerm | null => {
  const code = typeof record.code === "string" ? record.code.trim().toUpperCase() : "";
  if (!code) {
    return null;
  }
  const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : code;
  const days = Number(record.days ?? 0) || 0;
  const graceDays = Number(record.graceDays ?? 0) || 0;
  const id = typeof record.id === "number" ? record.id : null;
  const isActive = record.isActive !== false;
  return { id, code, name, days, graceDays, isActive };
};

type ApplyModalState = {
  open: boolean;
  document: CustomerDocumentEntry | null;
  loadingCandidates: boolean;
  submitting: boolean;
  candidates: CustomerDocumentEntry[];
  amounts: Record<number, string>;
  applicationDate: string;
  reference: string;
  notes: string;
  error: string | null;
};

type ApplyFieldName = "reference" | "notes" | "applicationDate";

const createInitialApplyState = (): ApplyModalState => ({
  open: false,
  document: null,
  loadingCandidates: false,
  submitting: false,
  candidates: [],
  amounts: {},
  applicationDate: getTodayIsoDate(),
  reference: "",
  notes: "",
  error: null,
});

type ViewApplicationsState = {
  open: boolean;
  document: CustomerDocumentEntry | null;
  loading: boolean;
  error: string | null;
  applied: DocumentApplicationEntry[];
  received: DocumentApplicationEntry[];
  lookup: Record<number, CustomerDocumentEntry>;
};

const createInitialViewState = (): ViewApplicationsState => ({
  open: false,
  document: null,
  loading: false,
  error: null,
  applied: [],
  received: [],
  lookup: {},
});

const normalizeApplicationRecord = (record: Record<string, unknown>): DocumentApplicationEntry | null => {
  const id = Number(record.id ?? 0);
  const appliedDocumentId = Number(record.appliedDocumentId ?? record.applied_document_id ?? 0);
  const targetDocumentId = Number(record.targetDocumentId ?? record.target_document_id ?? 0);
  const amount = Number(record.amount ?? 0) || 0;
  if (!Number.isFinite(id) || id <= 0 || appliedDocumentId <= 0 || targetDocumentId <= 0 || amount <= 0) {
    return null;
  }
  const applicationDate = typeof record.applicationDate === "string"
    ? record.applicationDate
    : typeof record.application_date === "string"
      ? record.application_date
      : new Date().toISOString();
  const reference = typeof record.reference === "string" ? record.reference : null;
  const notes = typeof record.notes === "string" ? record.notes : null;
  const createdAt = typeof record.createdAt === "string"
    ? record.createdAt
    : typeof record.created_at === "string"
      ? record.created_at
      : applicationDate;

  return {
    id,
    appliedDocumentId,
    targetDocumentId,
    applicationDate,
    amount,
    reference,
    notes,
    createdAt,
  } satisfies DocumentApplicationEntry;
};

type CustomerFormState = {
  code: string;
  name: string;
  tradeName: string;
  taxId: string;
  email: string;
  phone: string;
  mobilePhone: string;
  billingAddress: string;
  city: string;
  state: string;
  countryCode: string;
  postalCode: string;
  paymentTermCode: string | null;
  creditLimit: string;
  creditStatus: CustomerDTO["creditStatus"];
  creditHoldReason: string;
  isActive: boolean;
  notes: string;
};

const emptyCustomerForm = (): CustomerFormState => ({
  code: "",
  name: "",
  tradeName: "",
  taxId: "",
  email: "",
  phone: "",
  mobilePhone: "",
  billingAddress: "",
  city: "",
  state: "",
  countryCode: "NI",
  postalCode: "",
  paymentTermCode: null,
  creditLimit: "",
  creditStatus: "ACTIVE",
  creditHoldReason: "",
  isActive: true,
  notes: "",
});

type CustomersCrudPageProps = {
  canManageCustomers: boolean;
  hasAccess: boolean;
};

function CustomersCrudPage({ canManageCustomers, hasAccess }: CustomersCrudPageProps): JSX.Element {
  const { toast } = useToast();

  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState<ComboboxOption<string>[]>([]);
  const [paymentTermsLoading, setPaymentTermsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [formState, setFormState] = useState<CustomerFormState>(emptyCustomerForm);
  const [saving, setSaving] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerDTO | null>(null);

  const loadCustomers = useCallback(async () => {
    if (!hasAccess) {
      setCustomers([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/cxc/clientes?includeInactive=true&limit=400", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message ?? "No se pudieron obtener los clientes";
        throw new Error(message);
      }
      const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
      const normalized: CustomerDTO[] = items
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((record) => normalizeCustomerRecord(record as Record<string, unknown>))
        .filter((item): item is CustomerDTO => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      setCustomers(normalized);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron obtener los clientes";
      setError(message);
      setCustomers([]);
      toast({ variant: "error", title: "Clientes", description: message });
    } finally {
      setLoading(false);
    }
  }, [hasAccess, toast]);

  const loadPaymentTerms = useCallback(async () => {
    if (!hasAccess) {
      setPaymentTerms([]);
      return;
    }
    setPaymentTermsLoading(true);
    try {
      const response = await fetch("/api/preferencias/terminos-pago?includeInactive=true", {
        cache: "no-store",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message ?? "No se pudieron obtener las condiciones de pago";
        throw new Error(message);
      }
      const rawItems = Array.isArray(payload?.items) ? (payload.items as unknown[]) : [];
      const options: ComboboxOption<string>[] = rawItems
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((record: Record<string, unknown>) => normalizePaymentTermOption(record))
        .filter((opt: ComboboxOption<string> | null): opt is ComboboxOption<string> => opt !== null)
        .sort((a: ComboboxOption<string>, b: ComboboxOption<string>) => a.value.localeCompare(b.value));
      setPaymentTerms(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron obtener las condiciones de pago";
      toast({ variant: "warning", title: "Condiciones de pago", description: message });
    } finally {
      setPaymentTermsLoading(false);
    }
  }, [hasAccess, toast]);

  useEffect(() => {
    void loadCustomers();
    void loadPaymentTerms();
  }, [loadCustomers, loadPaymentTerms]);

  const customerStats = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((customer) => customer.isActive).length;
    const blocked = customers.filter((customer) => customer.creditStatus === "BLOCKED").length;
    const available = customers.reduce((acc, customer) => {
      const availableCredit = Math.max(0, customer.creditLimit - customer.creditUsed - customer.creditOnHold);
      return acc + availableCredit;
    }, 0);
    return { total, active, blocked, available };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers
      .filter((customer) => (showInactive ? true : customer.isActive))
      .filter((customer) => {
        if (!term) return true;
        const haystack = [
          customer.code,
          customer.name,
          customer.tradeName ?? "",
          customer.taxId ?? "",
          customer.email ?? "",
          customer.phone ?? "",
          customer.mobilePhone ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
  }, [customers, search, showInactive]);

  const handleOpenCreate = useCallback(() => {
    setEditingCustomer(null);
    setFormState(emptyCustomerForm());
    setModalOpen(true);
  }, []);

  const handleOpenEdit = useCallback((customer: CustomerDTO) => {
    setEditingCustomer(customer);
    setFormState({
      code: customer.code,
      name: customer.name,
      tradeName: customer.tradeName ?? "",
      taxId: customer.taxId ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      mobilePhone: customer.mobilePhone ?? "",
      billingAddress: customer.billingAddress ?? "",
      city: customer.city ?? "",
      state: customer.state ?? "",
      countryCode: customer.countryCode ?? "NI",
      postalCode: customer.postalCode ?? "",
      paymentTermCode: customer.paymentTermCode,
      creditLimit: customer.creditLimit ? String(customer.creditLimit) : "",
      creditStatus: customer.creditStatus,
      creditHoldReason: customer.creditHoldReason ?? "",
      isActive: customer.isActive,
      notes: customer.notes ?? "",
    });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    setModalOpen(false);
    setEditingCustomer(null);
    setFormState(emptyCustomerForm());
  }, [saving]);

  const updateFormField = useCallback(<K extends keyof CustomerFormState>(field: K, value: CustomerFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const trimmedCode = formState.code.trim().toUpperCase();
    const trimmedName = formState.name.trim();
    if (!trimmedName || (!editingCustomer && !trimmedCode)) {
      toast({ variant: "warning", title: "Clientes", description: "El código y nombre son obligatorios." });
      return;
    }

    const mapOptional = (value: string): string | null => {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : null;
    };

    const normalizeCountry = (): string | undefined => {
      const normalized = formState.countryCode.trim().toUpperCase();
      if (!normalized) return undefined;
      return normalized;
    };

    const parseCurrency = (value: string): number | undefined => {
      const normalized = value.trim();
      if (!normalized) return undefined;
      const parsed = Number(normalized.replace(/,/g, "."));
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const payload: Record<string, unknown> = {
      name: trimmedName,
      tradeName: mapOptional(formState.tradeName),
      taxId: mapOptional(formState.taxId),
      email: mapOptional(formState.email),
      phone: mapOptional(formState.phone),
      mobilePhone: mapOptional(formState.mobilePhone),
      billingAddress: mapOptional(formState.billingAddress),
      city: mapOptional(formState.city),
      state: mapOptional(formState.state),
      countryCode: normalizeCountry(),
      postalCode: mapOptional(formState.postalCode),
      paymentTermCode: formState.paymentTermCode ?? null,
      creditLimit: parseCurrency(formState.creditLimit) ?? (editingCustomer ? undefined : 0),
      creditStatus: formState.creditStatus,
      creditHoldReason: mapOptional(formState.creditHoldReason),
      isActive: formState.isActive,
      notes: mapOptional(formState.notes),
    };

    if (!editingCustomer) {
      payload.code = trimmedCode;
    }

    Object.keys(payload).forEach((key) => {
      if (typeof payload[key] === "undefined") {
        delete payload[key];
      }
    });

    setSaving(true);
    try {
      const endpoint = editingCustomer
        ? `/api/cxc/clientes/${encodeURIComponent(editingCustomer.code)}`
        : "/api/cxc/clientes";
      const method = editingCustomer ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.message ?? "No se pudo guardar el cliente";
        throw new Error(message);
      }
      const rawCustomer: unknown = body?.customer;
      if (!rawCustomer || typeof rawCustomer !== "object") {
        throw new Error("La respuesta no es válida");
      }
      const updated = normalizeCustomerRecord(rawCustomer as Record<string, unknown>);
      if (!updated) {
        throw new Error("No se pudo normalizar el cliente guardado");
      }

      setCustomers((prev) => {
        const list = editingCustomer
          ? prev.map((item) => (item.code === updated.code ? updated : item))
          : [...prev, updated];
        return list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      });

      toast({
        variant: "success",
        title: "Clientes",
        description: editingCustomer ? "Cliente actualizado correctamente." : "Cliente creado correctamente.",
      });
      setModalOpen(false);
      setEditingCustomer(null);
      setFormState(emptyCustomerForm());
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar el cliente";
      toast({ variant: "error", title: "Clientes", description: message });
    } finally {
      setSaving(false);
    }
  }, [editingCustomer, formState, saving, toast]);

  const handleToggleActive = useCallback(async (customer: CustomerDTO) => {
    if (!canManageCustomers) return;
    const targetState = !customer.isActive;
    try {
      const response = await fetch(`/api/cxc/clientes/${encodeURIComponent(customer.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: targetState }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.message ?? "No se pudo actualizar el estado";
        throw new Error(message);
      }
      const updated = normalizeCustomerRecord(body.customer as Record<string, unknown>);
      if (!updated) {
        throw new Error("Respuesta inválida del servidor");
      }
      setCustomers((prev) => prev.map((item) => (item.code === updated.code ? updated : item)));
      toast({
        variant: targetState ? "success" : "info",
        title: "Clientes",
        description: targetState ? "Cliente activado." : "Cliente desactivado.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar el estado";
      toast({ variant: "error", title: "Clientes", description: message });
    }
  }, [canManageCustomers, toast]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Clientes registrados"
          caption="Activos e inactivos"
          value={customerStats.total.toLocaleString("es-MX")}
          tone="text-foreground"
          icon={Users2}
        />
        <StatCard
          title="Activos"
          caption="Disponibles para crédito"
          value={customerStats.active.toLocaleString("es-MX")}
          tone="text-emerald-600"
          icon={CheckCircle2}
        />
        <StatCard
          title="Bloqueados"
          caption="Crédito suspendido"
          value={customerStats.blocked.toLocaleString("es-MX")}
          tone="text-destructive"
          icon={CircleAlert}
        />
        <StatCard
          title="Crédito disponible"
          caption="Líneas menos uso"
          value={formatCurrency(customerStats.available, { currency: "local" })}
          tone="text-primary"
          icon={HandCoins}
        />
      </div>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="gap-4 pb-0">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Catálogo de clientes</CardTitle>
              <CardDescription>Gestiona datos generales, condiciones de pago y estatus de crédito.</CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-muted bg-background px-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por código, nombre o RUC"
                  className="h-9 border-none px-0"
                />
              </div>
              <Button
                type="button"
                variant={showInactive ? "default" : "outline"}
                className="rounded-2xl"
                onClick={() => setShowInactive((prev) => !prev)}
              >
                {showInactive ? "Mostrar solo activos" : "Incluir inactivos"}
              </Button>
              {canManageCustomers ? (
                <Button type="button" className="rounded-2xl" onClick={handleOpenCreate}>
                  <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
                </Button>
              ) : null}
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
              <Button type="button" variant="outline" className="rounded-2xl" onClick={() => loadCustomers()}>
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
                    <th className="px-3 py-2">Contacto</th>
                    <th className="px-3 py-2">Crédito</th>
                    <th className="px-3 py-2">Estado</th>
                    {canManageCustomers ? <th className="px-3 py-2 text-right">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={canManageCustomers ? 5 : 4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No se encontraron clientes con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((customer) => {
                      const statusMeta = CREDIT_STATUS_LABELS[customer.creditStatus];
                      const availableCredit = Math.max(0, customer.creditLimit - customer.creditUsed - customer.creditOnHold);
                      return (
                        <tr key={customer.code} className="rounded-2xl border border-transparent bg-background/80 shadow-sm transition hover:border-primary/40">
                          <td className="px-3 py-3">
                            <div className="font-semibold text-foreground">{customer.code} • {customer.name}</div>
                            <div className="text-xs text-muted-foreground">Comercial: {customer.tradeName ?? "Sin registro"}</div>
                            <div className="text-xs text-muted-foreground">RUC/NIT: {customer.taxId ?? "Sin registro"}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            <div>Email: {customer.email ?? "Sin registro"}</div>
                            <div>Teléfono: {customer.phone ?? "Sin registro"}</div>
                            <div>Móvil: {customer.mobilePhone ?? "Sin registro"}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            <div className="text-sm font-semibold text-foreground">Límite: {formatCurrency(customer.creditLimit, { currency: "local" })}</div>
                            <div>Disponible: {formatCurrency(availableCredit, { currency: "local" })}</div>
                            <div>Término: {customer.paymentTermCode ?? "—"}</div>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            <div className={cn("text-sm font-semibold", statusMeta.tone)}>{statusMeta.label}</div>
                            <div>{customer.isActive ? "Activo" : "Inactivo"}</div>
                            <div>Última revisión: {customer.lastCreditReviewAt ? DATE_FORMATTER.format(new Date(customer.lastCreditReviewAt)) : "Sin registro"}</div>
                          </td>
                          {canManageCustomers ? (
                            <td className="px-3 py-3">
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => handleOpenEdit(customer)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant={customer.isActive ? "outline" : "default"}
                                  className="rounded-2xl"
                                  onClick={() => handleToggleActive(customer)}
                                >
                                  {customer.isActive ? (
                                    <>
                                      <Ban className="mr-2 h-4 w-4" /> Desactivar
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="mr-2 h-4 w-4" /> Activar
                                    </>
                                  )}
                                </Button>
                              </div>
                            </td>
                          ) : null}
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

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingCustomer ? "Editar cliente" : "Nuevo cliente"}
        description={editingCustomer ? "Actualiza los datos del cliente seleccionado" : "Registra un nuevo cliente para cuentas por cobrar"}
        contentClassName="max-w-4xl"
      >
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={formState.code}
                onChange={(event) => updateFormField("code", event.target.value.toUpperCase())}
                placeholder="CLI-001"
                disabled={Boolean(editingCustomer)}
                required={!editingCustomer}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre fiscal</Label>
              <Input
                id="name"
                value={formState.name}
                onChange={(event) => updateFormField("name", event.target.value)}
                placeholder="Razón social"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tradeName">Nombre comercial</Label>
              <Input
                id="tradeName"
                value={formState.tradeName}
                onChange={(event) => updateFormField("tradeName", event.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">RUC / NIT</Label>
              <Input
                id="taxId"
                value={formState.taxId}
                onChange={(event) => updateFormField("taxId", event.target.value)}
                placeholder="000-000000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                value={formState.email}
                onChange={(event) => updateFormField("email", event.target.value)}
                placeholder="cliente@dominio.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono fijo</Label>
              <Input
                id="phone"
                value={formState.phone}
                onChange={(event) => updateFormField("phone", event.target.value)}
                placeholder="2255-1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobilePhone">Teléfono móvil</Label>
              <Input
                id="mobilePhone"
                value={formState.mobilePhone}
                onChange={(event) => updateFormField("mobilePhone", event.target.value)}
                placeholder="8888-1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="countryCode">País</Label>
              <Input
                id="countryCode"
                value={formState.countryCode}
                onChange={(event) => updateFormField("countryCode", event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                placeholder="NI"
                maxLength={2}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="billingAddress">Dirección de facturación</Label>
              <textarea
                id="billingAddress"
                value={formState.billingAddress}
                onChange={(event) => updateFormField("billingAddress", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Dirección fiscal completa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                value={formState.city}
                onChange={(event) => updateFormField("city", event.target.value)}
                placeholder="Managua"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">Departamento / Estado</Label>
              <Input
                id="state"
                value={formState.state}
                onChange={(event) => updateFormField("state", event.target.value)}
                placeholder="Managua"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Código postal</Label>
              <Input
                id="postalCode"
                value={formState.postalCode}
                onChange={(event) => updateFormField("postalCode", event.target.value)}
                placeholder="11083"
              />
            </div>
            <div className="space-y-2">
              <Label>Condición de pago</Label>
              <Combobox
                value={formState.paymentTermCode}
                onChange={(value) => updateFormField("paymentTermCode", value)}
                options={paymentTerms}
                placeholder={paymentTermsLoading ? "Cargando..." : "Seleccionar"}
                emptyText={paymentTermsLoading ? "Cargando opciones" : "Sin coincidencias"}
                disabled={paymentTermsLoading}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditLimit">Límite de crédito</Label>
              <Input
                id="creditLimit"
                value={formState.creditLimit}
                onChange={(event) => updateFormField("creditLimit", event.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="5000"
              />
            </div>
            <div className="space-y-2">
              <Label>Estatus de crédito</Label>
              <Combobox
                value={formState.creditStatus}
                onChange={(value) => updateFormField("creditStatus", (value ?? "ACTIVE") as CustomerDTO["creditStatus"])}
                options={CREDIT_STATUS_OPTIONS}
                placeholder="Seleccionar"
                emptyText="Sin opciones"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="creditHoldReason">Motivo de retención</Label>
              <Input
                id="creditHoldReason"
                value={formState.creditHoldReason}
                onChange={(event) => updateFormField("creditHoldReason", event.target.value)}
                placeholder="Especifica el motivo cuando el crédito está retenido"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notas internas</Label>
              <textarea
                id="notes"
                value={formState.notes}
                onChange={(event) => updateFormField("notes", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Notas de cobranza, acuerdos o restricciones"
              />
            </div>
            <div className="space-y-2">
              <Label>Estado del cliente</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formState.isActive ? "default" : "outline"}
                  className="rounded-2xl flex-1"
                  onClick={() => updateFormField("isActive", true)}
                >
                  Activo
                </Button>
                <Button
                  type="button"
                  variant={!formState.isActive ? "default" : "outline"}
                  className="rounded-2xl flex-1"
                  onClick={() => updateFormField("isActive", false)}
                >
                  Inactivo
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Los campos vacíos se registran como nulos. Los cambios se aplican de inmediato en la cartera y reportes de cobranza.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-2xl" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

type CxcDocumentsPageProps = {
  canViewDocuments: boolean;
  canManageDocuments: boolean;
  canApplyDocuments: boolean;
  hasAccess: boolean;
};

function CxcDocumentsPage({ canViewDocuments, canManageDocuments, canApplyDocuments, hasAccess }: CxcDocumentsPageProps): JSX.Element {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [documents, setDocuments] = useState<CustomerDocumentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | CustomerDocumentStatus>("PENDIENTE");
  const [search, setSearch] = useState("");
  const [viewState, setViewState] = useState<ViewApplicationsState>(() => createInitialViewState());
  const [applyState, setApplyState] = useState<ApplyModalState>(() => createInitialApplyState());
  const [pendingPromptId, setPendingPromptId] = useState<number | null>(() => {
    const initial = searchParams.get("promptApply") ?? searchParams.get("apply") ?? searchParams.get("applyDocumentId");
    const parsed = initial ? Number(initial) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
  const [createState, setCreateState] = useState<CreateDocumentState>(() => createInitialCreateState());
  const createCustomersLoadedRef = useRef(false);
  const createPaymentTermsLoadedRef = useRef(false);

  useEffect(() => {
    const incoming = searchParams.get("promptApply") ?? searchParams.get("apply") ?? searchParams.get("applyDocumentId");
    if (!incoming) return;
    const parsed = Number(incoming);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setPendingPromptId(parsed);
  }, [searchParams]);

  const clearPromptParam = useCallback(() => {
    const params = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key === "promptApply" || key === "apply" || key === "applyDocumentId") {
        return;
      }
      params.append(key, value);
    });
    const query = params.toString();
    router.replace(query ? `/cuentas-por-cobrar?${query}` : "/cuentas-por-cobrar", { scroll: false });
  }, [router, searchParams]);

  const loadDocuments = useCallback(async () => {
    if (!hasAccess || !canViewDocuments) {
      setDocuments([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({
        includeSettled: "false",
        orderBy: "documentDate",
        limit: "200",
      });
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
      const normalized = items
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((record) => normalizeDocumentRecord(record))
        .filter((item): item is CustomerDocumentEntry => item !== null)
        .sort((a, b) => {
          const dateComparison = b.documentDate.localeCompare(a.documentDate);
          return dateComparison !== 0 ? dateComparison : b.id - a.id;
        });
      setDocuments(normalized);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron obtener los documentos";
      setDocuments([]);
      setError(message);
      toast({ variant: "error", title: "Documentos", description: message });
    } finally {
      setLoading(false);
    }
  }, [canViewDocuments, hasAccess, toast]);

  const loadCreateDocumentCatalogs = useCallback(async () => {
    const tasks: Promise<void>[] = [];

    if (!createCustomersLoadedRef.current) {
      tasks.push(
        (async () => {
          try {
            const response = await fetch("/api/cxc/clientes?includeInactive=false&limit=400", {
              cache: "no-store",
              credentials: "include",
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.message ?? "No se pudieron obtener los clientes";
              throw new Error(message);
            }
            const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
            const normalized = items
              .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
              .map((record) => normalizeCustomerRecord(record as Record<string, unknown>))
              .filter((item): item is CustomerDTO => item !== null)
              .sort((a, b) => a.name.localeCompare(b.name, "es"));
            createCustomersLoadedRef.current = true;
            setCreateState((prev) => ({ ...prev, customers: normalized }));
          } catch (err) {
            throw err instanceof Error ? err : new Error("No se pudieron obtener los clientes");
          }
        })()
      );
    }

    if (!createPaymentTermsLoadedRef.current) {
      tasks.push(
        (async () => {
          try {
            const response = await fetch("/api/preferencias/terminos-pago?includeInactive=true", {
              cache: "no-store",
              credentials: "include",
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.message ?? "No se pudieron obtener las condiciones de pago";
              throw new Error(message);
            }
            const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
            const normalized = items
              .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
              .map((record) => normalizeDocumentPaymentTerm(record as Record<string, unknown>))
              .filter((item): item is DocumentPaymentTerm => item !== null)
              .sort((a, b) => a.code.localeCompare(b.code, "es"));
            createPaymentTermsLoadedRef.current = true;
            setCreateState((prev) => ({ ...prev, paymentTerms: normalized }));
          } catch (err) {
            throw err instanceof Error ? err : new Error("No se pudieron obtener las condiciones de pago");
          }
        })()
      );
    }

    if (tasks.length === 0) {
      setCreateState((prev) => ({ ...prev, loading: false, error: null }));
      return;
    }

    const results = await Promise.allSettled(tasks);
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : "No se pudieron cargar los catálogos"));

    setCreateState((prev) => ({ ...prev, loading: false, error: errors.length > 0 ? errors.join(" · ") : null }));

    if (errors.length > 0) {
      toast({ variant: "error", title: "Documentos", description: errors.join(" · ") });
    }
  }, [toast]);

  const handleOpenCreateDocument = useCallback(() => {
    if (!canManageDocuments) {
      toast({ variant: "warning", title: "Documentos", description: "No tienes permisos para crear documentos." });
      return;
    }
    const needsCatalogs = !createCustomersLoadedRef.current || !createPaymentTermsLoadedRef.current;
    
    // Check for customerId in searchParams
    const customerIdParam = searchParams.get("customerId");
    const preselectedCustomerId = customerIdParam ? Number(customerIdParam) : null;

    setCreateState((prev) => ({
      ...prev,
      open: true,
      loading: needsCatalogs,
      saving: false,
      error: null,
      form: {
        ...createInitialDocumentForm(),
        customerId: preselectedCustomerId && Number.isFinite(preselectedCustomerId) ? preselectedCustomerId : null,
      },
    }));
    if (needsCatalogs) {
      void loadCreateDocumentCatalogs();
    }
  }, [canManageDocuments, loadCreateDocumentCatalogs, searchParams, toast]);

  const handleReloadCreateCatalogs = useCallback(() => {
    setCreateState((prev) => ({ ...prev, loading: true, error: null }));
    void loadCreateDocumentCatalogs();
  }, [loadCreateDocumentCatalogs]);

  const handleCloseCreateModal = useCallback(() => {
    setCreateState((prev) => ({
      ...prev,
      open: false,
      saving: false,
      error: null,
      form: createInitialDocumentForm(),
    }));
  }, []);

  const handleCreateFieldChange = useCallback(<K extends keyof CreateDocumentFormState>(field: K, value: CreateDocumentFormState[K]) => {
    setCreateState((prev) => {
      const nextForm: CreateDocumentFormState = { ...prev.form, [field]: value };

      if (field === "customerId") {
        const customerIdValue = value as CreateDocumentFormState["customerId"];
        const customer = prev.customers.find((item) => item.id === customerIdValue) ?? null;
        nextForm.paymentTermCode = customer?.paymentTermCode ?? null;
      }

      if (field === "originalAmount") {
        const amountValue = typeof value === "string" ? value : prev.form.originalAmount;
        const shouldSyncBalance = !prev.form.balanceAmount || prev.form.balanceAmount === prev.form.originalAmount;
        if (shouldSyncBalance) {
          nextForm.balanceAmount = amountValue;
        }
      }

      const isPaymentTermChange = field === "paymentTermCode";
      const isDocumentDateChange = field === "documentDate";
      const isCustomerChange = field === "customerId";
      const shouldRecalculateDueDate =
        isPaymentTermChange ||
        (isDocumentDateChange && Boolean(nextForm.paymentTermCode)) ||
        (isCustomerChange && Boolean(nextForm.paymentTermCode) && Boolean(nextForm.documentDate));

      if (shouldRecalculateDueDate) {
        const termCode = (field === "paymentTermCode" ? value : nextForm.paymentTermCode) as string | null;
        const documentDate = (field === "documentDate" ? value : nextForm.documentDate) as string | null;
        const term = termCode ? prev.paymentTerms.find((item) => item.code === termCode) ?? null : null;
        const base = documentDate ? new Date(documentDate) : null;
        if (term && base && !Number.isNaN(base.getTime())) {
          const totalDays = term.days + term.graceDays;
          const normalized = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
          normalized.setUTCDate(normalized.getUTCDate() + totalDays);
          nextForm.dueDate = normalized.toISOString().slice(0, 10);
        } else {
          nextForm.dueDate = null;
        }
      }

      return { ...prev, form: nextForm, error: null };
    });
  }, []);

  const handleSubmitCreateDocument = useCallback(async () => {
    if (createState.saving) {
      return;
    }
    const form = createState.form;
    if (!form.customerId) {
      const message = "Selecciona un cliente para el documento.";
      setCreateState((prev) => ({ ...prev, error: message }));
      toast({ variant: "warning", title: "Documentos", description: message });
      return;
    }
    const documentNumber = form.documentNumber.trim().toUpperCase();
    if (!documentNumber) {
      const message = "Ingresa un número de documento.";
      setCreateState((prev) => ({ ...prev, error: message }));
      toast({ variant: "warning", title: "Documentos", description: message });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.documentDate)) {
      const message = "Ingresa una fecha de emisión válida.";
      setCreateState((prev) => ({ ...prev, error: message }));
      toast({ variant: "warning", title: "Documentos", description: message });
      return;
    }
    const parseMoney = (input: string): number => {
      const normalized = input.replace(/,/g, ".").trim();
      if (!normalized) return NaN;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    const originalAmountValue = parseMoney(form.originalAmount);
    if (!Number.isFinite(originalAmountValue) || originalAmountValue <= 0) {
      const message = "Ingresa un monto original mayor a cero.";
      setCreateState((prev) => ({ ...prev, error: message }));
      toast({ variant: "warning", title: "Documentos", description: message });
      return;
    }
    // Balance always starts equal to original amount for new documents
    const balanceAmountValueRaw = originalAmountValue;
    
    const currencyRaw = form.currencyCode.trim().toUpperCase();
    const currencyCode = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : DEFAULT_DOCUMENT_CURRENCY;

    setCreateState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const payload: Record<string, unknown> = {
        customerId: form.customerId,
        documentType: form.documentType,
        documentNumber,
        documentDate: form.documentDate,
        dueDate: form.dueDate ?? null,
        currencyCode,
        originalAmount: Number(originalAmountValue.toFixed(2)),
        balanceAmount: Number(balanceAmountValueRaw.toFixed(2)),
        reference: form.reference.trim().length > 0 ? form.reference.trim() : null,
        notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
        paymentTermCode: form.paymentTermCode ?? null,
      };

      const response = await fetch("/api/cxc/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.message ?? "No se pudo registrar el documento";
        throw new Error(message);
      }

      toast({ variant: "success", title: "Documentos", description: "Documento registrado correctamente." });
      setCreateState((prev) => ({
        ...prev,
        open: false,
        saving: false,
        error: null,
        form: createInitialDocumentForm(),
      }));
      void loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo registrar el documento";
      setCreateState((prev) => ({ ...prev, saving: false, error: message }));
      toast({ variant: "error", title: "Documentos", description: message });
    }
  }, [createState, loadDocuments, toast]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const stats = useMemo(() => {
    const total = documents.length;
    const pending = documents.filter((doc) => doc.status === "PENDIENTE");
    const pendingAmount = pending.reduce((acc, doc) => acc + doc.balanceAmount, 0);
    const today = getTodayIsoDate();
    const overdue = pending.filter((doc) => doc.dueDate && doc.dueDate < today);
    const overdueAmount = overdue.reduce((acc, doc) => acc + doc.balanceAmount, 0);
    const collected = documents
      .filter((doc) => doc.status === "PAGADO")
      .reduce((acc, doc) => acc + doc.originalAmount, 0);
    return {
      total,
      pending: pending.length,
      pendingAmount,
      overdue: overdue.length,
      overdueAmount,
      collected,
    };
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents
      .filter((doc) => (statusFilter === "ALL" ? true : doc.status === statusFilter))
      .filter((doc) => {
        if (!term) return true;
        const haystack = `${doc.documentNumber} ${doc.customerName} ${doc.reference ?? ""}`.toLowerCase();
        return haystack.includes(term);
      });
  }, [documents, search, statusFilter]);

  const handleRefresh = useCallback(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleOpenApplications = useCallback(
    async (document: CustomerDocumentEntry) => {
      const baseLookup = documents.reduce<Record<number, CustomerDocumentEntry>>((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, { [document.id]: document });
      setViewState({
        open: true,
        document,
        loading: true,
        error: null,
        applied: [],
        received: [],
        lookup: baseLookup,
      });

      const fetchApplications = async (url: string): Promise<DocumentApplicationEntry[]> => {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload?.message ?? "No se pudieron obtener las aplicaciones";
          throw new Error(message);
        }
        const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
        return items
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((record) => normalizeApplicationRecord(record))
          .filter((item): item is DocumentApplicationEntry => item !== null)
          .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
      };

      try {
        const [appliedList, receivedList] = await Promise.all([
          fetchApplications(`/api/cxc/documentos/aplicaciones?appliedDocumentId=${document.id}`),
          fetchApplications(`/api/cxc/documentos/aplicaciones?targetDocumentId=${document.id}`),
        ]);

        const docsQuery = new URLSearchParams({
          customerId: document.customerId.toString(),
          includeSettled: "true",
          limit: "400",
        });
        const lookupResponse = await fetch(`/api/cxc/documentos?${docsQuery.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const lookupRecords = { ...baseLookup };
        if (lookupResponse.ok) {
          const lookupPayload = await lookupResponse.json().catch(() => null);
          const lookupItems: unknown[] = Array.isArray(lookupPayload?.items) ? lookupPayload.items : [];
          const normalizedDocs = lookupItems
            .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
            .map((record) => normalizeDocumentRecord(record))
            .filter((item): item is CustomerDocumentEntry => item !== null);
          for (const entry of normalizedDocs) {
            lookupRecords[entry.id] = entry;
          }
        }

        setViewState((prev) => ({
          ...prev,
          loading: false,
          applied: appliedList,
          received: receivedList,
          lookup: lookupRecords,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudieron obtener las aplicaciones";
        setViewState((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
        toast({ variant: "error", title: "Aplicaciones", description: message });
      }
    },
    [documents, toast],
  );

  const handleReloadApplications = useCallback(() => {
    if (viewState.document) {
      void handleOpenApplications(viewState.document);
    }
  }, [handleOpenApplications, viewState.document]);

  const handleCloseApplications = useCallback(() => {
    setViewState(createInitialViewState());
  }, []);

  const handleOpenApplyModal = useCallback(
    async (document: CustomerDocumentEntry) => {
      if (!canApplyDocuments) {
        toast({
          variant: "warning",
          title: "Aplicaciones",
          description: "No tienes permisos para aplicar documentos.",
        });
        return;
      }
      if (!isCreditDocumentType(document.documentType)) {
        toast({
          variant: "info",
          title: "Aplicaciones",
          description: "Solo se pueden aplicar recibos, notas de crédito o retenciones a otros documentos.",
        });
        return;
      }
      if (document.balanceAmount <= 0) {
        toast({
          variant: "info",
          title: "Aplicaciones",
          description: "Este documento no tiene saldo disponible para aplicar.",
        });
        return;
      }

      setApplyState({
        ...createInitialApplyState(),
        open: true,
        document,
        loadingCandidates: true,
      });

      try {
        const query = new URLSearchParams({
          customerId: document.customerId.toString(),
          status: "PENDIENTE",
          includeSettled: "false",
          orderBy: "dueDate",
          limit: "400",
          types: Array.from(DEBIT_DOCUMENT_TYPES).join(","),
        });
        const response = await fetch(`/api/cxc/documentos?${query.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload?.message ?? "No se pudieron obtener los documentos pendientes";
          throw new Error(message);
        }
        const items: unknown[] = Array.isArray(payload?.items) ? payload.items : [];
        const normalized = items
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((record) => normalizeDocumentRecord(record))
          .filter((item): item is CustomerDocumentEntry => item !== null)
          .filter((item) => item.id !== document.id && item.balanceAmount > 0 && isDebitDocumentTypeLocal(item.documentType))
          .sort((a, b) => a.dueDate?.localeCompare(b.dueDate ?? "") ?? 0);

        setApplyState((prev) => ({
          ...prev,
          loadingCandidates: false,
          candidates: normalized,
          error: normalized.length === 0 ? "No hay documentos con saldo pendiente para este cliente." : null,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudieron obtener los documentos pendientes";
        setApplyState((prev) => ({
          ...prev,
          loadingCandidates: false,
          error: message,
        }));
        toast({ variant: "error", title: "Aplicaciones", description: message });
      }
    },
    [canApplyDocuments, toast],
  );

  const handleCloseApplyModal = useCallback(() => {
    setApplyState(createInitialApplyState());
  }, []);

  const handleApplyAmountChange = useCallback((targetId: number, value: string) => {
    const normalized = value.replace(/,/g, ".");
    setApplyState((prev) => ({
      ...prev,
      error: null,
      amounts: { ...prev.amounts, [targetId]: normalized },
    }));
  }, []);

  const handleApplyFieldChange = useCallback((field: ApplyFieldName, value: string) => {
    setApplyState((prev) => ({
      ...prev,
      error: null,
      [field]: value,
    }));
  }, []);

  const handleApplyFillMax = useCallback((targetId: number) => {
    setApplyState((prev) => {
      if (!prev.document) return prev;
      const target = prev.candidates.find((item) => item.id === targetId);
      if (!target) return prev;
      const otherTotal = Object.entries(prev.amounts).reduce((acc, [key, raw]) => {
        const id = Number(key);
        if (id === targetId) return acc;
        const numeric = Number(raw);
        return Number.isFinite(numeric) && numeric > 0 ? acc + numeric : acc;
      }, 0);
      const remaining = Math.max(0, prev.document.balanceAmount - otherTotal);
      const allowed = Math.min(remaining, target.balanceAmount);
      const nextAmounts = { ...prev.amounts };
      nextAmounts[targetId] = allowed > 0 ? String(Number(allowed.toFixed(2))) : "";
      return { ...prev, error: null, amounts: nextAmounts };
    });
  }, []);

  const handleApplySubmit = useCallback(async () => {
    if (!applyState.document) {
      return;
    }
    const entries = applyState.candidates
      .map((candidate) => {
        const raw = applyState.amounts[candidate.id];
        if (typeof raw !== "string" || raw.trim().length === 0) {
          return null;
        }
        const numeric = Number(raw);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return null;
        }
        return { candidate, amount: numeric };
      })
      .filter((entry): entry is { candidate: CustomerDocumentEntry; amount: number } => entry !== null);

    if (entries.length === 0) {
      setApplyState((prev) => ({
        ...prev,
        error: "Ingresa al menos un monto a aplicar.",
      }));
      return;
    }

    for (const { candidate, amount } of entries) {
      if (amount > candidate.balanceAmount + 0.005) {
        setApplyState((prev) => ({
          ...prev,
          error: `El monto no puede exceder el saldo del documento ${candidate.documentNumber}.`,
        }));
        return;
      }
    }

    const totalApplied = entries.reduce((acc, entry) => acc + entry.amount, 0);
    if (totalApplied > applyState.document.balanceAmount + 0.005) {
      setApplyState((prev) => ({
        ...prev,
        error: "El total aplicado supera el saldo disponible del documento origen.",
      }));
      return;
    }

    setApplyState((prev) => ({
      ...prev,
      submitting: true,
      error: null,
    }));

    try {
      const payload = {
        applications: entries.map(({ candidate, amount }) => ({
          appliedDocumentId: applyState.document!.id,
          targetDocumentId: candidate.id,
          amount,
          applicationDate: applyState.applicationDate,
          reference: applyState.reference.trim().length > 0 ? applyState.reference.trim() : null,
          notes: applyState.notes.trim().length > 0 ? applyState.notes.trim() : null,
        })),
      };
      const response = await fetch("/api/cxc/documentos/aplicaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.message ?? "No se pudieron aplicar los documentos";
        throw new Error(message);
      }

      toast({
        variant: "success",
        title: "Aplicaciones",
        description: "Las aplicaciones se registraron correctamente.",
      });
      setApplyState(createInitialApplyState());
      void loadDocuments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron aplicar los documentos";
      setApplyState((prev) => ({
        ...prev,
        submitting: false,
        error: message,
      }));
      toast({ variant: "error", title: "Aplicaciones", description: message });
    }
  }, [applyState, loadDocuments, toast]);

  useEffect(() => {
    if (pendingPromptId === null || loading) {
      return;
    }
    const found = documents.find((doc) => doc.id === pendingPromptId);
    if (!found) {
      return;
    }
    setPendingPromptId(null);
    clearPromptParam();
    if (!canApplyDocuments || !isCreditDocumentType(found.documentType) || found.balanceAmount <= 0) {
      return;
    }
    void handleOpenApplyModal(found);
  }, [pendingPromptId, loading, documents, clearPromptParam, canApplyDocuments, handleOpenApplyModal]);

  const applySummary = useMemo(() => {
    if (!applyState.document) {
      return { total: 0, remaining: 0, selected: 0 };
    }
    let total = 0;
    let selected = 0;
    for (const candidate of applyState.candidates) {
      const numeric = Number(applyState.amounts[candidate.id]);
      if (Number.isFinite(numeric) && numeric > 0) {
        total += numeric;
        selected += 1;
      }
    }
    const remaining = Math.max(0, applyState.document.balanceAmount - total);
    return { total, remaining, selected };
  }, [applyState]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="rounded-2xl" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refrescar
        </Button>
      </div>
      <DocumentsPanel
        documents={filteredDocuments}
        stats={stats}
        loading={loading}
        error={error}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        onRetry={loadDocuments}
        onViewApplications={handleOpenApplications}
        onApplyDocument={canApplyDocuments ? handleOpenApplyModal : undefined}
        canApply={canApplyDocuments}
        onCreateDocument={handleOpenCreateDocument}
      />
      <CreateDocumentModal
        state={createState}
        onClose={handleCloseCreateModal}
        onSubmit={handleSubmitCreateDocument}
        onFieldChange={handleCreateFieldChange}
        onReloadCatalogs={handleReloadCreateCatalogs}
      />
      <ApplyDocumentModal
        state={applyState}
        summary={applySummary}
        onClose={handleCloseApplyModal}
        onAmountChange={handleApplyAmountChange}
        onFieldChange={handleApplyFieldChange}
        onFillAmount={handleApplyFillMax}
        onSubmit={handleApplySubmit}
      />
      <DocumentApplicationsModal state={viewState} onClose={handleCloseApplications} onReload={handleReloadApplications} />
    </div>
  );
}

function CxcReportsLanding(): JSX.Element {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <Card className="relative flex h-full flex-col justify-between rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={cardIconClasses}>
              <BarChart3 className="h-6 w-6" />
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resumen
            </span>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-xl font-semibold">Resumen de cartera</CardTitle>
            <CardDescription>Saldo pendiente por estatus de documento y clientes principales.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button type="button" className="w-full justify-between rounded-2xl" asChild>
            <Link href="/reportes">
              <span>Abrir reportes</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="relative flex h-full flex-col justify-between rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={cardIconClasses}>
              <Clock3 className="h-6 w-6" />
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Vencimientos
            </span>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-xl font-semibold">Análisis de vencimientos</CardTitle>
            <CardDescription>Distribución de cartera por antigüedad y clientes con riesgo.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button type="button" className="w-full justify-between rounded-2xl" asChild>
            <Link href="/reportes">
              <span>Ver vencimientos</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="relative flex h-full flex-col justify-between rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={cardIconClasses}>
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Estados de cuenta
            </span>
          </div>
          <div className="space-y-2">
            <CardTitle className="text-xl font-semibold">Estados de cuenta</CardTitle>
            <CardDescription>Genera el historial por cliente y descarga versiones imprimibles.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button type="button" className="w-full justify-between rounded-2xl" asChild>
            <Link href="/reportes">
              <span>Ir a reportes</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function AccountsReceivableDashboardPage(): JSX.Element {
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
            documentType: isCustomerDocumentType(record.documentType) ? record.documentType : "INVOICE",
            documentNumber: typeof record.documentNumber === "string" ? record.documentNumber : "",
            documentDate: typeof record.documentDate === "string" ? record.documentDate : new Date().toISOString().slice(0, 10),
            dueDate: typeof record.dueDate === "string" ? record.dueDate : null,
            currencyCode: typeof record.currencyCode === "string" ? record.currencyCode : "NIO",
            originalAmount: Number(record.originalAmount ?? 0) || 0,
            balanceAmount: Number(record.balanceAmount ?? record.originalAmount ?? 0) || 0,
            status: record.status === "PAGADO" || record.status === "CANCELADO" || record.status === "BORRADOR" ? record.status : "PENDIENTE",
            reference: typeof record.reference === "string" ? record.reference : null,
            paymentTermCode: typeof record.paymentTermCode === "string" ? record.paymentTermCode : null,
            paymentTermId: typeof record.paymentTermId === "number" ? record.paymentTermId : null,
            relatedInvoiceId: typeof record.relatedInvoiceId === "number" ? record.relatedInvoiceId : null,
            notes: typeof record.notes === "string" ? record.notes : null,
            metadata: typeof record.metadata === "object" && record.metadata !== null ? (record.metadata as Record<string, unknown>) : null,
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
            createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
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

export function DashboardOverview({
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

export function CustomersPanel({
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

export function DocumentsPanel({
  documents,
  stats,
  loading,
  error,
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onRetry,
  onViewApplications,
  onApplyDocument,
  canApply,
  onCreateDocument,
}: {
  documents: CustomerDocumentEntry[];
  stats: { total: number; pending: number; pendingAmount: number; overdue: number; overdueAmount: number; collected: number };
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: "ALL" | CustomerDocumentStatus;
  onStatusChange: (value: "ALL" | CustomerDocumentStatus) => void;
  onRetry: () => void;
  onViewApplications?: (document: CustomerDocumentEntry) => void;
  onApplyDocument?: (document: CustomerDocumentEntry) => void;
  canApply?: boolean;
  onCreateDocument?: () => void;
}) {
  const showActions = Boolean(onViewApplications || (canApply && onApplyDocument));

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
              {onCreateDocument ? (
                <Button
                  type="button"
                  className="rounded-2xl"
                  onClick={onCreateDocument}
                  disabled={loading}
                >
                  <Plus className="mr-2 h-4 w-4" /> Nuevo documento
                </Button>
              ) : null}
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
                    {showActions ? <th className="px-3 py-2 text-right">Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr>
                      <td colSpan={showActions ? 7 : 6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No se encontraron documentos con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    documents.map((doc) => {
                      const isOverdue = doc.status === "PENDIENTE" && doc.dueDate && doc.dueDate < new Date().toISOString().slice(0, 10);
                      const allowApply = Boolean(
                        canApply &&
                        onApplyDocument &&
                        isCreditDocumentType(doc.documentType) &&
                        doc.balanceAmount > 0,
                      );
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
                          {showActions ? (
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                {onViewApplications ? (
                                  <Button type="button" variant="outline" className="rounded-2xl" onClick={() => onViewApplications(doc)}>
                                    Movimientos
                                  </Button>
                                ) : null}
                                {allowApply ? (
                                  <Button type="button" className="rounded-2xl" onClick={() => onApplyDocument?.(doc)}>
                                    <HandCoins className="mr-2 h-4 w-4" /> Aplicar
                                  </Button>
                                ) : null}
                              </div>
                            </td>
                          ) : null}
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

type CreateDocumentModalProps = {
  state: CreateDocumentState;
  onClose: () => void;
  onSubmit: () => void;
  onFieldChange: <K extends keyof CreateDocumentFormState>(field: K, value: CreateDocumentFormState[K]) => void;
  onReloadCatalogs: () => void;
};

type CustomerSearchModalProps = {
  open: boolean;
  onClose: () => void;
  customers: CustomerDTO[];
  onSelect: (customerId: number) => void;
};

function CustomerSearchModal({ open, onClose, customers, onSelect }: CustomerSearchModalProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers.slice(0, 50);
    return customers
      .filter(
        (c) =>
          c.code.toLowerCase().includes(term) ||
          c.name.toLowerCase().includes(term) ||
          (c.taxId && c.taxId.toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [customers, search]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Buscar cliente" description="Selecciona un cliente para el documento.">
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-2xl border border-muted px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, nombre o RUC..."
            className="border-none shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto rounded-2xl border border-muted">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No se encontraron clientes.</div>
          ) : (
            <div className="divide-y">
              {filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-muted/50"
                  onClick={() => {
                    onSelect(customer.id);
                    onClose();
                  }}
                >
                  <div className="font-medium">
                    {customer.code} • {customer.name}
                  </div>
                  <div className="text-xs text-muted-foreground">RUC: {customer.taxId || "N/A"}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-2xl">
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateDocumentModal({ state, onClose, onSubmit, onFieldChange, onReloadCatalogs }: CreateDocumentModalProps): JSX.Element | null {
  const { open, form, loading, saving, customers, paymentTerms, error } = state;
  const [searchOpen, setSearchOpen] = useState(false);

  const paymentTermOptions = useMemo<ComboboxOption<string>[]>(
    () =>
      paymentTerms
        .filter((term) => term.isActive)
        .map((term) => ({
          value: term.code,
          label: `${term.code} · ${term.name}`,
          description: term.days + term.graceDays > 0 ? `${term.days + term.graceDays} días` : "Pago inmediato",
        })),
    [paymentTerms]
  );

  const currencyOptions: ComboboxOption<string>[] = [
    {
      value: process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO",
      label: `Moneda Local (${process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO"})`,
    },
    {
      value: process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_CODE || "USD",
      label: `Moneda Extranjera (${process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_CODE || "USD"})`,
    },
  ];

  const selectedCustomer = form.customerId ? customers.find((customer) => customer.id === form.customerId) ?? null : null;
  const selectedPaymentTerm = form.paymentTermCode
    ? paymentTerms.find((term) => term.code === form.paymentTermCode) ?? null
    : null;
  const disableForm = loading || saving;
  const isDebit = isDebitDocumentTypeLocal(form.documentType);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!saving) {
      onSubmit();
    }
  };

  const handleClose = () => {
    if (!saving) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <>
      <Modal
        open={state.open}
        onClose={handleClose}
        title="Nuevo documento"
        description="Registra un documento manual de cuentas por cobrar."
        contentClassName="max-w-4xl"
      >
        <form className="space-y-6" onSubmit={handleSubmit}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-muted p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogos…
            </div>
          ) : null}
          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <span>{error}</span>
              <Button type="button" variant="outline" className="rounded-2xl" onClick={onReloadCatalogs} disabled={loading || saving}>
                Reintentar
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Cliente</Label>
              <div className="flex gap-2">
                <div className="flex-1 rounded-2xl border border-input bg-background px-3 py-2 text-sm shadow-sm">
                  {selectedCustomer ? (
                    <span className="font-medium">
                      {selectedCustomer.code} • {selectedCustomer.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Selecciona un cliente</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setSearchOpen(true)}
                  disabled={disableForm}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Tipo de documento</Label>
              <Combobox<CustomerDocumentType>
                value={form.documentType}
                onChange={(value) => onFieldChange("documentType", value ?? "INVOICE")}
                options={DOCUMENT_TYPE_OPTIONS}
                placeholder="Selecciona tipo"
                disabled={disableForm}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Número de documento</Label>
              <Input
                value={form.documentNumber}
                onChange={(event) => onFieldChange("documentNumber", event.target.value.toUpperCase())}
                placeholder="Ej: FAC-000123"
                disabled={disableForm}
                className="rounded-2xl"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Moneda</Label>
              <Combobox<string>
                value={form.currencyCode}
                onChange={(value) => onFieldChange("currencyCode", value ?? (process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO"))}
                options={currencyOptions}
                placeholder="Selecciona moneda"
                disabled={disableForm}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Fecha de emisión</Label>
              <DatePicker value={form.documentDate} onChange={(value) => onFieldChange("documentDate", value)} disabled={disableForm} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Vencimiento {isDebit ? "(opcional)" : "(no aplica)"}</Label>
              <div className="flex items-center gap-2">
                <DatePicker
                  value={form.dueDate ?? undefined}
                  onChange={(value) => onFieldChange("dueDate", value)}
                  disabled={disableForm || !isDebit}
                  className="flex-1"
                />
                {form.dueDate && isDebit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-2xl"
                    onClick={() => onFieldChange("dueDate", null)}
                    disabled={disableForm}
                  >
                    Limpiar
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Monto total</Label>
              <Input
                value={form.originalAmount}
                onChange={(event) => onFieldChange("originalAmount", event.target.value.replace(/[^0-9.,]/g, ""))}
                placeholder="0.00"
                disabled={disableForm}
                className="rounded-2xl"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Referencia</Label>
              <Input
                value={form.reference}
                onChange={(event) => onFieldChange("reference", event.target.value)}
                placeholder="Opcional"
                disabled={disableForm}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Condición de pago</Label>
              <Combobox<string>
                value={form.paymentTermCode}
                onChange={(value) => onFieldChange("paymentTermCode", value ?? null)}
                options={paymentTermOptions}
                placeholder={loading ? "Cargando…" : "Opcional"}
                emptyText={paymentTermOptions.length === 0 ? "Sin opciones" : "Sin coincidencias"}
                disabled={disableForm}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
              <textarea
                value={form.notes}
                onChange={(event) => onFieldChange("notes", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Comentarios visibles para cobranza"
                disabled={disableForm}
              />
            </div>
          </div>

          {selectedCustomer ? (
            <div className="rounded-2xl border border-muted bg-background/90 px-4 py-3 text-xs text-muted-foreground">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold text-foreground">
                  {selectedCustomer.code} • {selectedCustomer.name}
                </span>
                <span>Término sugerido: {selectedCustomer.paymentTermCode ?? "CONTADO"}</span>
              </div>
            </div>
          ) : null}

          {selectedPaymentTerm ? (
            <div className="rounded-2xl border border-muted bg-background/90 px-4 py-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{selectedPaymentTerm.name}</span>
              <span className="ml-2">({selectedPaymentTerm.code})</span>
              <span className="ml-2">Plazo: {selectedPaymentTerm.days + selectedPaymentTerm.graceDays} días</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Si omites el vencimiento, se calculará automáticamente usando la condición de pago seleccionada.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={handleClose} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-2xl" disabled={disableForm}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
            </div>
          </div>
        </form>
      </Modal>
      <CustomerSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        customers={customers}
        onSelect={(id) => onFieldChange("customerId", id)}
      />
    </>
  );
}

type ApplyDocumentModalProps = {
  state: ApplyModalState;
  summary: { total: number; remaining: number; selected: number };
  onClose: () => void;
  onAmountChange: (targetId: number, value: string) => void;
  onFillAmount: (targetId: number) => void;
  onFieldChange: (field: ApplyFieldName, value: string) => void;
  onSubmit: () => void;
};

function ApplyDocumentModal({ state, summary, onClose, onAmountChange, onFillAmount, onFieldChange, onSubmit }: ApplyDocumentModalProps): JSX.Element | null {
  if (!state.open || !state.document) {
    return null;
  }

  const { document, loadingCandidates, submitting, candidates, amounts, applicationDate, reference, notes, error } = state;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submitting) {
      onSubmit();
    }
  };

  const handleClose = () => {
    if (!submitting) {
      onClose();
    }
  };

  return (
    <Modal
      open={state.open}
      onClose={handleClose}
      title={`Aplicar ${document.documentType} • ${document.documentNumber}`}
      description="Selecciona los documentos a los que aplicarás este movimiento."
      contentClassName="max-w-5xl"
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-3 rounded-3xl border border-muted bg-background/80 px-4 py-3 text-sm text-muted-foreground md:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="block font-semibold text-foreground">{document.customerCode} • {document.customerName}</span>
            <span>Saldo disponible: {formatCurrency(document.balanceAmount, { currency: "local" })}</span>
          </div>
          <div>
            <span className="block">Seleccionados: {summary.selected}</span>
          </div>
          <div>
            <span className="block">Total a aplicar: {formatCurrency(summary.total, { currency: "local" })}</span>
          </div>
          <div>
            <span className="block">Saldo restante: {formatCurrency(summary.remaining, { currency: "local" })}</span>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Documentos con saldo pendiente</h3>
            <span className="text-xs text-muted-foreground">Asigna montos parciales según el saldo disponible.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Emisión</th>
                  <th className="px-3 py-2">Saldo</th>
                  <th className="px-3 py-2">Monto a aplicar</th>
                </tr>
              </thead>
              <tbody>
                {loadingCandidates ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos disponibles…
                      </div>
                    </td>
                  </tr>
                ) : candidates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No hay documentos pendientes para este cliente.
                    </td>
                  </tr>
                ) : (
                  candidates.map((candidate) => {
                    const value = amounts[candidate.id] ?? "";
                    return (
                      <tr key={candidate.id} className="rounded-2xl border border-transparent bg-background/70 shadow-sm">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">{candidate.documentType} • {candidate.documentNumber}</div>
                          <div className="text-xs text-muted-foreground">Vence: {formatDate(candidate.dueDate)}</div>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(candidate.documentDate)}</td>
                        <td className="px-3 py-3 text-sm text-foreground">{formatCurrency(candidate.balanceAmount, { currency: "local" })}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={value}
                              onChange={(event) => onAmountChange(candidate.id, event.target.value)}
                              className="h-9 rounded-2xl"
                              disabled={submitting}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-2xl"
                              onClick={() => onFillAmount(candidate.id)}
                              disabled={submitting}
                            >
                              Usar saldo
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="applicationDate">Fecha de aplicación</Label>
            <Input
              id="applicationDate"
              type="date"
              value={applicationDate}
              onChange={(event) => onFieldChange("applicationDate", event.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="applicationReference">Referencia</Label>
            <Input
              id="applicationReference"
              value={reference}
              onChange={(event) => onFieldChange("reference", event.target.value)}
              placeholder="Número de recibo, nota, etc."
              disabled={submitting}
            />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="applicationNotes">Notas</Label>
            <textarea
              id="applicationNotes"
              value={notes}
              onChange={(event) => onFieldChange("notes", event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Opcional: anota aclaraciones o acuerdos."
              disabled={submitting}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" className="rounded-2xl" disabled={submitting || loadingCandidates || summary.total <= 0}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Aplicar documentos
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type DocumentApplicationsModalProps = {
  state: ViewApplicationsState;
  onClose: () => void;
  onReload: () => void;
};

function DocumentApplicationsModal({ state, onClose, onReload }: DocumentApplicationsModalProps): JSX.Element | null {
  if (!state.open || !state.document) {
    return null;
  }

  const { document, loading, error, applied, received, lookup } = state;

  const renderApplicationRows = (
    entries: DocumentApplicationEntry[],
    resolve: (entry: DocumentApplicationEntry) => CustomerDocumentEntry | undefined,
    getId: (entry: DocumentApplicationEntry) => number,
    emptyText: string,
  ) => {
    if (loading) {
      return (
        <tr>
          <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando aplicaciones…
            </div>
          </td>
        </tr>
      );
    }
    if (entries.length === 0) {
      return (
        <tr>
          <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </td>
        </tr>
      );
    }
    return entries.map((entry) => {
      const related = resolve(entry);
      const fallbackId = getId(entry);
      const label = related ? `${related.documentType} • ${related.documentNumber}` : `Documento #${fallbackId}`;
      const amountLabel = formatCurrency(entry.amount, { currency: "local" });
      return (
        <tr key={entry.id} className="rounded-2xl border border-transparent bg-background/70 shadow-sm">
          <td className="px-3 py-3">
            <div className="font-semibold text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">Saldo actual: {related ? formatCurrency(related.balanceAmount, { currency: "local" }) : "N/D"}</div>
          </td>
          <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTime(entry.applicationDate)}</td>
          <td className="px-3 py-3 text-sm text-foreground">{amountLabel}</td>
          <td className="px-3 py-3 text-xs text-muted-foreground">
            {entry.reference ? <span className="block">Ref: {entry.reference}</span> : null}
            {entry.notes ? <span className="block">Notas: {entry.notes}</span> : null}
            {!entry.reference && !entry.notes ? <span className="block">Sin detalles adicionales</span> : null}
          </td>
        </tr>
      );
    });
  };

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      title={`Aplicaciones de ${document.documentType} • ${document.documentNumber}`}
      description="Consulta los documentos relacionados a este movimiento."
      contentClassName="max-w-4xl"
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-2 rounded-3xl border border-muted bg-background/80 px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            <span className="block font-semibold text-foreground">{document.customerCode} • {document.customerName}</span>
            <span>Saldo actual: {formatCurrency(document.balanceAmount, { currency: "local" })}</span>
          </div>
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onReload} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </Button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Documentos liquidados por este movimiento</h3>
            <span className="text-xs text-muted-foreground">Se descuentan del saldo del documento origen.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Documento destino</th>
                  <th className="px-3 py-2">Aplicación</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">Detalles</th>
                </tr>
              </thead>
              <tbody>{renderApplicationRows(applied, (entry) => lookup[entry.targetDocumentId], (entry) => entry.targetDocumentId, "Sin aplicaciones registradas.")}</tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Documentos que aplicaron a este movimiento</h3>
            <span className="text-xs text-muted-foreground">Abonos recibidos desde otros documentos.</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Documento origen</th>
                  <th className="px-3 py-2">Aplicación</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">Detalles</th>
                </tr>
              </thead>
              <tbody>{renderApplicationRows(received, (entry) => lookup[entry.appliedDocumentId], (entry) => entry.appliedDocumentId, "Sin abonos registrados.")}</tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}

export function ApplicationsPanel({
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

export function StatCard({
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
