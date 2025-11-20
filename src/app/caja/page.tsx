"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CircleDot,
  Download,
  History,
  Loader2,
  Lock,
  Minus,
  Plus,
  Receipt,
  Store,
  Users2,
} from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { formatCurrency } from "@/config/currency";
import { hasSessionPermission, isSessionAdministrator } from "@/lib/auth/session-roles";
import { cn } from "@/lib/utils";

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

interface CashRegisterOperatorOption {
  adminUserId: number;
  username: string;
  displayName: string | null;
  roles: string[];
}

interface CashRegisterOverviewRegister {
  cashRegisterId: number;
  cashRegisterCode: string;
  cashRegisterName: string;
  warehouseCode: string;
  warehouseName: string;
  allowManualWarehouseOverride: boolean;
  isActive: boolean;
  assignments: Array<{ adminUserId: number; username: string; displayName: string | null; isDefault: boolean }>;
  activeSession: {
    id: number;
    adminUserId: number;
    adminUsername: string;
    adminDisplayName: string | null;
    openingAt: string;
    openingAmount: number;
  } | null;
}

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";

interface ClosingFormPayment {
  method: PaymentMethod;
  amount: string;
}

type NormalizedClosingPayment = {
  method: PaymentMethod;
  reported_amount: number;
};
type DenominationKind = "COIN" | "BILL" | "OTHER";
type DenominationLine = { currency: string; kind: DenominationKind; value: string; qty: string };
const defaultCurrency = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO";
const denominationKindOptions: ComboboxOption<DenominationKind>[] = [
  { value: "COIN", label: "Moneda" },
  { value: "BILL", label: "Billete" },
  { value: "OTHER", label: "Otro" },
];

const paymentMethodOptions: ComboboxOption<PaymentMethod>[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "OTHER", label: "Otro" },
];

const HISTORY_FILTER_ALL = "__ALL__";

type LoadCashSessionResult = {
  activeSession: CashRegisterActiveSession | null;
  cashRegisters: CashRegisterAssignmentOption[];
  defaultCashRegisterId: number | null;
  recentSessions: CashRegisterSessionSnapshot[];
  operators: CashRegisterOperatorOption[];
  overview: CashRegisterOverviewRegister[];
};

const formatTimestampLocale = (value: string | null | undefined): string => {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin registro";
  }
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const createInitialClosingPayments = (): ClosingFormPayment[] => [{ method: "CASH", amount: "" }];

export default function CashManagementPage() {
  const session = useSession();
  const { toast } = useToast();

  const isAdmin = isSessionAdministrator(session);
  const canOpenCash = hasSessionPermission(session, "cash.register.open");
  const canCloseCash = hasSessionPermission(session, "cash.register.close");
  const canViewCashReports = hasSessionPermission(session, "cash.report.view");
  const canAccess = isAdmin || canOpenCash || canCloseCash || canViewCashReports;

  const currentAdminId = useMemo(() => {
    const rawId = Number(session?.sub);
    return Number.isFinite(rawId) ? rawId : null;
  }, [session?.sub]);

  const [cashState, setCashState] = useState<{
    loading: boolean;
    activeSession: CashRegisterActiveSession | null;
    cashRegisters: CashRegisterAssignmentOption[];
    defaultCashRegisterId: number | null;
    recentSessions: CashRegisterSessionSnapshot[];
    operators: CashRegisterOperatorOption[];
    overview: CashRegisterOverviewRegister[];
  }>({
    loading: false,
    activeSession: null,
    cashRegisters: [],
    defaultCashRegisterId: null,
    recentSessions: [],
    operators: [],
    overview: [],
  });
  const [cashError, setCashError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>(HISTORY_FILTER_ALL);

  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState({
    cashRegisterCode: "",
    openingAmount: "",
    openingNotes: "",
    operatorAdminUserId: currentAdminId,
  });
  const [openingSubmitting, setOpeningSubmitting] = useState(false);
  const [openingDenoms, setOpeningDenoms] = useState<DenominationLine[]>([]);

  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [closingForm, setClosingForm] = useState<{
    closingAmount: string;
    closingNotes: string;
    payments: ClosingFormPayment[];
    targetSessionId: number | null;
  }>({ closingAmount: "", closingNotes: "", payments: createInitialClosingPayments(), targetSessionId: null });
  const [closingSubmitting, setClosingSubmitting] = useState(false);
    const [closingDenoms, setClosingDenoms] = useState<DenominationLine[]>([]);
  // Confirmación por diferencia
  const [diffConfirmOpen, setDiffConfirmOpen] = useState(false);
  const preparedClosureRef = useRef<{
    sessionId: number;
    payments: NormalizedClosingPayment[];
    denoms: Array<{ currency: string; value: number; qty: number; kind?: DenominationKind }>;
    expected: number;
    reported: number;
  } | null>(null);
  // Resumen esperado para el cierre (desde facturas)
  const [closureExpectedTotal, setClosureExpectedTotal] = useState<number | null>(null);
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  // Impresión en modal (apertura/cierre)
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);

  const openPrintModal = useCallback((rawUrl: string) => {
    try {
      const absolute = new URL(rawUrl, window.location.origin).href;
      setIframeLoading(true);
      setIframeError(null);
      setPrintUrl(absolute);
      setPrintModalOpen(true);
    } catch {
      setIframeError("URL de reporte inválida");
      setPrintUrl(null);
      setPrintModalOpen(true);
    }
  }, []);

  const loadCashSession = useCallback(async (): Promise<LoadCashSessionResult | null> => {
    if (!canAccess) {
      setCashState((prev) => ({ ...prev, loading: false }));
      return null;
    }
    setCashState((prev) => ({ ...prev, loading: true }));
    try {
      const response = await fetch("/api/cajas/sesion-activa", { cache: "no-store", credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.message ?? "No se pudo obtener la información de la caja";
        throw new Error(message);
      }

      const assignments: CashRegisterAssignmentOption[] = Array.isArray(data?.cashRegisters) ? data.cashRegisters : [];
      const recentSessions: CashRegisterSessionSnapshot[] = Array.isArray(data?.recentSessions) ? data.recentSessions : [];
      const operators: CashRegisterOperatorOption[] = Array.isArray(data?.operators) ? data.operators : [];
      const overview: CashRegisterOverviewRegister[] = Array.isArray(data?.overview?.registers)
        ? data.overview.registers
        : [];

      const payload: LoadCashSessionResult = {
        activeSession: (data?.activeSession ?? null) as CashRegisterActiveSession | null,
        cashRegisters: assignments,
        defaultCashRegisterId: typeof data?.defaultCashRegisterId === "number" ? data.defaultCashRegisterId : null,
        recentSessions,
        operators,
        overview,
      };

      setCashState({
        loading: false,
        ...payload,
      });
      setCashError(null);

      const preferred =
        assignments.find((assignment) => assignment.cashRegisterId === data?.defaultCashRegisterId) ?? assignments[0];
      const fallbackOperatorId =
        operators.length > 0 && isAdmin
          ? operators.find((operator) => operator.adminUserId === currentAdminId)?.adminUserId ?? operators[0].adminUserId
          : currentAdminId;
      setOpeningForm((prev) => ({
        ...prev,
        cashRegisterCode: prev.cashRegisterCode || preferred?.cashRegisterCode || "",
        operatorAdminUserId: prev.operatorAdminUserId ?? fallbackOperatorId ?? null,
      }));

      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo obtener la información de la caja";
      setCashState({
        loading: false,
        activeSession: null,
        cashRegisters: [],
        defaultCashRegisterId: null,
        recentSessions: [],
        operators: [],
        overview: [],
      });
      setOpeningForm((prev) => ({
        ...prev,
        cashRegisterCode: "",
        operatorAdminUserId: isAdmin ? prev.operatorAdminUserId ?? currentAdminId : currentAdminId,
      }));
      setCashError(message);
      toast({
        variant: "error",
        title: "Caja",
        description: message,
      });
      return null;
    }
  }, [canAccess, currentAdminId, isAdmin, toast]);

  useEffect(() => {
    void loadCashSession();
  }, [loadCashSession]);

  const cashRegisterOptions = useMemo<ComboboxOption<string>[]>(() => {
    return cashState.cashRegisters.map((assignment) => ({
      value: assignment.cashRegisterCode,
      label: `${assignment.cashRegisterCode} • ${assignment.cashRegisterName}`,
      description: `${assignment.warehouseCode} • ${assignment.warehouseName}`,
    }));
  }, [cashState.cashRegisters]);

  const operatorOptions = useMemo<ComboboxOption<number>[]>(() => {
    return cashState.operators.map((operator) => ({
      value: operator.adminUserId,
      label: operator.displayName?.trim() ? `${operator.displayName} (${operator.username})` : operator.username,
      description: operator.roles.length > 0 ? operator.roles.join(", ") : undefined,
    }));
  }, [cashState.operators]);

  const historyFilterOptions = useMemo<ComboboxOption<string>[]>(() => {
    const registerMap = new Map<string, { label: string; description: string }>();
    for (const snapshot of cashState.recentSessions) {
      if (!registerMap.has(snapshot.cashRegister.code)) {
        registerMap.set(snapshot.cashRegister.code, {
          label: `${snapshot.cashRegister.code} • ${snapshot.cashRegister.name}`,
          description: `${snapshot.cashRegister.warehouseCode} • ${snapshot.cashRegister.warehouseName}`,
        });
      }
    }

    const registerOptions = Array.from(registerMap.entries()).map(([code, meta]) => ({
      value: code,
      label: meta.label,
      description: meta.description,
    }));

    return [
      { value: HISTORY_FILTER_ALL, label: "Todas las cajas" },
      ...registerOptions.sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [cashState.recentSessions]);

  const filteredRecentSessions = useMemo(() => {
    if (historyFilter === HISTORY_FILTER_ALL) {
      return cashState.recentSessions;
    }
    return cashState.recentSessions.filter((session) => session.cashRegister.code === historyFilter);
  }, [cashState.recentSessions, historyFilter]);

  useEffect(() => {
    if (historyFilter === HISTORY_FILTER_ALL) {
      return;
    }
    const exists = cashState.recentSessions.some((session) => session.cashRegister.code === historyFilter);
    if (!exists) {
      setHistoryFilter(HISTORY_FILTER_ALL);
    }
  }, [cashState.recentSessions, historyFilter]);

  const normalizedCashRegisterCode = openingForm.cashRegisterCode.trim().toUpperCase();
  const selectedCashRegister = normalizedCashRegisterCode
    ? cashState.cashRegisters.find((assignment) => assignment.cashRegisterCode === normalizedCashRegisterCode) ?? null
    : null;
  const selectedOperator =
    openingForm.operatorAdminUserId != null
      ? cashState.operators.find((operator) => operator.adminUserId === openingForm.operatorAdminUserId) ?? null
      : null;
  const closingTarget = useMemo(() => {
    const sessionId = closingForm.targetSessionId ?? cashState.activeSession?.id ?? null;
    if (sessionId == null) {
      return null;
    }

    if (cashState.activeSession && cashState.activeSession.id === sessionId) {
      const operatorFromDirectory = currentAdminId
        ? cashState.operators.find((operator) => operator.adminUserId === currentAdminId) ?? null
        : null;
      return {
        sessionId,
        cashRegisterCode: cashState.activeSession.cashRegister.cashRegisterCode,
        cashRegisterName: cashState.activeSession.cashRegister.cashRegisterName,
        warehouseCode: cashState.activeSession.cashRegister.warehouseCode,
        warehouseName: cashState.activeSession.cashRegister.warehouseName,
        operatorDisplayName:
          operatorFromDirectory?.displayName?.trim() ||
          operatorFromDirectory?.username ||
          session?.name ||
          (session?.sub ? `Usuario ${session.sub}` : ""),
        operatorUsername: operatorFromDirectory?.username || session?.sub || "-",
        openingAt: cashState.activeSession.openingAt,
      };
    }

    const registerMatch = cashState.overview.find((register) => register.activeSession?.id === sessionId);
    if (registerMatch?.activeSession) {
      return {
        sessionId,
        cashRegisterCode: registerMatch.cashRegisterCode,
        cashRegisterName: registerMatch.cashRegisterName,
        warehouseCode: registerMatch.warehouseCode,
        warehouseName: registerMatch.warehouseName,
        operatorDisplayName:
          registerMatch.activeSession.adminDisplayName?.trim() || registerMatch.activeSession.adminUsername,
        operatorUsername: registerMatch.activeSession.adminUsername,
        openingAt: registerMatch.activeSession.openingAt,
      };
    }

    return null;
  }, [cashState.activeSession, cashState.overview, cashState.operators, closingForm.targetSessionId, currentAdminId, session?.name, session?.sub]);

  const handleRefresh = useCallback(() => {
    void loadCashSession();
  }, [loadCashSession]);

  const handleOpenCashRegister = useCallback(async () => {
    const rawCode = openingForm.cashRegisterCode.trim().toUpperCase();
    if (!rawCode) {
      toast({ variant: "warning", title: "Caja", description: "Selecciona una caja asignada" });
      return;
    }
    const resolvedOperatorId = isAdmin ? openingForm.operatorAdminUserId : currentAdminId;
    if (resolvedOperatorId == null || !Number.isFinite(resolvedOperatorId)) {
      toast({ variant: "warning", title: "Caja", description: "Selecciona el cajero responsable" });
      return;
    }
    const normalizedAmount = openingForm.openingAmount.trim().replace(/,/g, ".");
    const amountValue = normalizedAmount === "" ? 0 : Number(normalizedAmount);
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      toast({ variant: "warning", title: "Caja", description: "Ingresa un monto de apertura válido" });
      return;
    }

    let normalizedDenoms: Array<{ currency: string; value: number; qty: number; kind?: DenominationKind }> = [];
    const requiresOpeningDenomsValidation = amountValue > 0;
    if (requiresOpeningDenomsValidation) {
      normalizedDenoms = openingDenoms
        .map((d) => ({
          currency: (d.currency || defaultCurrency).trim().toUpperCase(),
          value: Number(d.value.trim().replace(/,/g, ".")),
          qty: Number(d.qty.trim()),
          kind: d.kind,
        }))
        .filter((d) => d.currency.length === 3 && Number.isFinite(d.value) && d.value >= 0 && Number.isFinite(d.qty) && d.qty >= 0);
      if (normalizedDenoms.length === 0) {
        toast({ variant: "warning", title: "Caja", description: "Agrega el detalle de denominaciones de apertura" });
        return;
      }
      const currencies = Array.from(new Set(normalizedDenoms.map((d) => d.currency)));
      if (!(currencies.length === 1 && currencies[0] === defaultCurrency)) {
        toast({ variant: "warning", title: "Caja", description: `Las denominaciones deben ser en ${defaultCurrency}` });
        return;
      }
      const denomSum = normalizedDenoms.reduce((acc, d) => acc + d.value * d.qty, 0);
      if (Math.abs(Number(denomSum.toFixed(2)) - Number(amountValue.toFixed(2))) >= 0.005) {
        toast({ variant: "warning", title: "Caja", description: "La suma de denominaciones no coincide con el monto de apertura" });
        return;
      }
    }

    setOpeningSubmitting(true);
    try {
      const response = await fetch("/api/cajas/aperturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cash_register_code: rawCode,
          opening_amount: amountValue,
          opening_notes: openingForm.openingNotes.trim() ? openingForm.openingNotes.trim() : null,
          operator_admin_user_id: isAdmin ? resolvedOperatorId : undefined,
          ...(requiresOpeningDenomsValidation ? { opening_denominations: normalizedDenoms } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.message ?? "No se pudo abrir la caja";
        throw new Error(message);
      }

      toast({ variant: "success", title: "Caja", description: "Caja aperturada correctamente" });
      setOpeningModalOpen(false);
      setOpeningForm({
        cashRegisterCode: rawCode,
        openingAmount: "",
        openingNotes: "",
        operatorAdminUserId: resolvedOperatorId,
      });
      setOpeningDenoms([]);
      const reportUrl = data?.report_url ? String(data.report_url) : null;
      const openedSession = (data?.session ?? null) as CashRegisterActiveSession | null;
      if (openedSession) {
        setCashState((prev) => {
          const snapshot: CashRegisterSessionSnapshot = {
            id: openedSession.id,
            status: "OPEN",
            openingAmount: openedSession.openingAmount,
            openingAt: openedSession.openingAt,
            closingAmount: null,
            closingAt: null,
            cashRegister: {
              code: openedSession.cashRegister.cashRegisterCode,
              name: openedSession.cashRegister.cashRegisterName,
              warehouseCode: openedSession.cashRegister.warehouseCode,
              warehouseName: openedSession.cashRegister.warehouseName,
            },
          };
          const filteredRecent = prev.recentSessions.filter((sessionRow) => sessionRow.id !== openedSession.id);
          const nextRecent = [snapshot, ...filteredRecent].slice(0, 20);
          const operatorMeta = prev.operators.find((operator) => operator.adminUserId === resolvedOperatorId) ?? null;
          const fallbackUsername = operatorMeta?.username ?? session?.sub ?? String(resolvedOperatorId);
          const fallbackDisplay =
            operatorMeta?.displayName?.trim() || operatorMeta?.username || session?.name || fallbackUsername;
          const nextOverview = prev.overview.map((register) => {
            if (register.cashRegisterCode !== openedSession.cashRegister.cashRegisterCode) {
              return register;
            }
            return {
              ...register,
              activeSession: {
                id: openedSession.id,
                adminUserId: resolvedOperatorId,
                adminUsername: fallbackUsername,
                adminDisplayName: fallbackDisplay,
                openingAt: openedSession.openingAt,
                openingAmount: openedSession.openingAmount,
              },
            };
          });
          return {
            ...prev,
            loading: false,
            activeSession: openedSession,
            recentSessions: nextRecent,
            overview: nextOverview,
          };
        });
        setCashError(null);
      }
      await loadCashSession();
      if (reportUrl) {
        openPrintModal(reportUrl);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo abrir la caja";
      toast({ variant: "error", title: "Caja", description: message });
    } finally {
      setOpeningSubmitting(false);
    }
  }, [currentAdminId, isAdmin, loadCashSession, openingForm.cashRegisterCode, openingForm.openingAmount, openingForm.openingNotes, openingForm.operatorAdminUserId, openingDenoms, session?.name, session?.sub, toast, openPrintModal]);

  const handleOpenOpeningReport = useCallback((sessionId: number) => {
    openPrintModal(`/api/cajas/aperturas/${sessionId}/reporte?format=html`);
  }, [openPrintModal]);

  const handleOpenClosureReport = useCallback((sessionId: number) => {
    openPrintModal(`/api/cajas/cierres/${sessionId}/reporte?format=html`);
  }, [openPrintModal]);

  const addClosingPayment = useCallback(() => {
    setClosingForm((prev) => ({
      ...prev,
      payments: [...prev.payments, { method: "CASH", amount: "" }],
    }));
  }, []);

  const removeClosingPayment = useCallback((index: number) => {
    setClosingForm((prev) => {
      if (prev.payments.length === 1) {
        return prev;
      }
      const next = prev.payments.filter((_, idx) => idx !== index);
      return { ...prev, payments: next };
    });
  }, []);

  const updateClosingPayment = useCallback((index: number, patch: Partial<ClosingFormPayment>) => {
    setClosingForm((prev) => ({
      ...prev,
      payments: prev.payments.map((payment, idx) => (idx === index ? { ...payment, ...patch } : payment)),
    }));
  }, []);

  const handleCloseCashRegister = useCallback(async (forceSubmit: boolean = false) => {
    // Construir pagos reportados y validar
    let normalizedPayments = closingForm.payments
      .map((payment) => {
        const paymentAmount = Number(payment.amount.trim().replace(/,/g, "."));
        if (!Number.isFinite(paymentAmount) || paymentAmount < 0) {
          return null;
        }
        return {
          method: payment.method,
          reported_amount: Number(paymentAmount.toFixed(2)),
        };
      })
      .filter((entry): entry is NormalizedClosingPayment => entry !== null);

    if (normalizedPayments.length === 0) {
      toast({ variant: "warning", title: "Caja", description: "Agrega al menos un método de pago válido" });
      return;
    }

    const sessionId = closingForm.targetSessionId ?? cashState.activeSession?.id ?? null;
    if (sessionId == null) {
      toast({ variant: "warning", title: "Caja", description: "Selecciona una sesión abierta para cerrar" });
      return;
    }
    // Cálculo y validación de totales esperados y denominaciones según efectivo
    const expected = closureExpectedTotal ?? null;
    if (expected == null) {
      toast({ variant: "warning", title: "Caja", description: "No se pudo calcular el total esperado del cierre" });
      return;
    }
    let reportedTotal = normalizedPayments.reduce((acc, p) => acc + p.reported_amount, 0);
    let difference = Number((reportedTotal - expected).toFixed(2));
    const reportedCashBefore = normalizedPayments.filter((p) => {
      const m = p.method.trim().toUpperCase();
      return m === "CASH" || m === "EFECTIVO";
    }).reduce((acc, p) => acc + p.reported_amount, 0);
    let normClosingDenoms: Array<{ currency: string; value: number; qty: number; kind?: DenominationKind }> = [];
    if (reportedCashBefore > 0) {
      normClosingDenoms = closingDenoms
        .map((d) => ({
          currency: (d.currency || defaultCurrency).trim().toUpperCase(),
          value: Number(d.value.trim().replace(/,/g, ".")),
          qty: Number(d.qty.trim()),
          kind: d.kind,
        }))
        .filter((d) => d.currency.length === 3 && Number.isFinite(d.value) && d.value >= 0 && Number.isFinite(d.qty) && d.qty >= 0);
      if (normClosingDenoms.length === 0) {
        toast({ variant: "warning", title: "Caja", description: "Agrega el detalle de denominaciones para efectivo" });
        return;
      }
      const closeCurrencies = Array.from(new Set(normClosingDenoms.map((d) => d.currency)));
      if (!(closeCurrencies.length === 1 && closeCurrencies[0] === defaultCurrency)) {
        toast({ variant: "warning", title: "Caja", description: `Las denominaciones deben ser en ${defaultCurrency}` });
        return;
      }
      const closeSum = normClosingDenoms.reduce((acc, d) => acc + d.value * d.qty, 0);
      // Si las denominaciones no cuadran con el efectivo reportado, normalizamos el efectivo al monto de denominaciones
      if (Math.abs(Number(closeSum.toFixed(2)) - Number(reportedCashBefore.toFixed(2))) >= 0.005) {
        const cashIndexes = normalizedPayments
          .map((p, idx) => ({ p, idx }))
          .filter(({ p }) => {
            const m = p.method.trim().toUpperCase();
            return m === "CASH" || m === "EFECTIVO";
          })
          .map(({ idx }) => idx);
        if (cashIndexes.length > 0) {
          const firstIdx = cashIndexes[0];
          normalizedPayments = normalizedPayments.map((p, idx) => {
            if (!cashIndexes.includes(idx)) return p;
            if (idx === firstIdx) {
              return { ...p, reported_amount: Number(closeSum.toFixed(2)) };
            }
            return { ...p, reported_amount: 0 };
          });
          reportedTotal = normalizedPayments.reduce((acc, p) => acc + p.reported_amount, 0);
          difference = Number((reportedTotal - expected).toFixed(2));
        }
      }
    }
    // Si hay diferencia y no se ha confirmado aún, abrir modal de confirmación
    if (!forceSubmit && difference !== 0) {
      preparedClosureRef.current = {
        sessionId,
        payments: normalizedPayments,
        denoms: normClosingDenoms,
        expected,
        reported: reportedTotal,
      };
      setDiffConfirmOpen(true);
      return;
    }
    setClosingSubmitting(true);
    try {
      const response = await fetch("/api/cajas/cierres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          session_id: sessionId,
          closing_amount: Number((closureExpectedTotal ?? 0).toFixed(2)),
          payments: normalizedPayments,
          closing_notes: closingForm.closingNotes.trim() ? closingForm.closingNotes.trim() : null,
          closing_denominations: normClosingDenoms,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.message ?? "No se pudo cerrar la caja";
        throw new Error(message);
      }

      if (data?.already_closed) {
        toast({ variant: "warning", title: "Caja", description: "La sesión ya estaba cerrada, se recuperó el reporte." });
      } else {
        toast({ variant: "success", title: "Caja", description: "Caja cerrada correctamente" });
      }
      setClosingModalOpen(false);
      setClosingForm({ closingAmount: "", closingNotes: "", payments: createInitialClosingPayments(), targetSessionId: null });
      setClosingDenoms([]);
      const reportUrl = data?.report_url ? String(data.report_url) : null;
      const summary = (data?.summary ?? null) as
        | {
            sessionId: number;
            openingAmount: number;
            openingAt: string;
            closingAmount: number | null;
            closingAt: string | null;
            cashRegister: {
              cashRegisterCode: string;
              cashRegisterName: string;
              warehouseCode: string;
              warehouseName: string;
            };
          }
        | null;
      const closingSessionId = summary?.sessionId ?? sessionId;
      setCashState((prev) => {
        const filteredRecent = prev.recentSessions.filter((snapshot) => snapshot.id !== closingSessionId);
        const snapshot: CashRegisterSessionSnapshot | null = summary
          ? {
              id: summary.sessionId,
              status: "CLOSED",
              openingAmount: summary.openingAmount,
              openingAt: summary.openingAt,
              closingAmount: summary.closingAmount ?? null,
              closingAt: summary.closingAt ?? null,
              cashRegister: {
                code: summary.cashRegister.cashRegisterCode,
                name: summary.cashRegister.cashRegisterName,
                warehouseCode: summary.cashRegister.warehouseCode,
                warehouseName: summary.cashRegister.warehouseName,
              },
            }
          : null;
        const nextRecent = snapshot ? [snapshot, ...filteredRecent].slice(0, 20) : filteredRecent;
        const nextOverview = prev.overview.map((register) =>
          register.activeSession?.id === closingSessionId ? { ...register, activeSession: null } : register
        );
        const nextActiveSession = prev.activeSession && prev.activeSession.id === closingSessionId ? null : prev.activeSession;
        return {
          ...prev,
          loading: false,
          activeSession: nextActiveSession,
          recentSessions: nextRecent,
          overview: nextOverview,
        };
      });
      setCashError(null);
      await loadCashSession();
      if (reportUrl) {
        openPrintModal(reportUrl);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cerrar la caja";
      toast({ variant: "error", title: "Caja", description: message });
    } finally {
      setClosingSubmitting(false);
    }
  }, [cashState.activeSession?.id, closingForm, closingDenoms, closureExpectedTotal, loadCashSession, toast, openPrintModal]);

  const confirmAndSubmitDifference = useCallback(() => {
    const prepared = preparedClosureRef.current;
    if (!prepared) {
      setDiffConfirmOpen(false);
      return;
    }
    setDiffConfirmOpen(false);
    // Forzamos el envío reusando el flujo de validación principal
    void handleCloseCashRegister(true);
  }, [handleCloseCashRegister]);

  const openOpeningModalWithContext = useCallback(
    (registerCode?: string, operatorAdminUserId?: number | null) => {
      setOpeningForm((prev) => ({
        cashRegisterCode: registerCode ?? prev.cashRegisterCode ?? "",
        openingAmount: "",
        openingNotes: "",
        operatorAdminUserId:
          operatorAdminUserId ??
          prev.operatorAdminUserId ??
          currentAdminId ??
          (isAdmin && cashState.operators.length > 0 ? cashState.operators[0].adminUserId : null),
      }));
      setOpeningModalOpen(true);
      setOpeningDenoms([]);
    },
    [cashState.operators, currentAdminId, isAdmin]
  );

  const openClosingModalWithContext = useCallback(
    (sessionId?: number | null) => {
      setClosingForm({
        closingAmount: "",
        closingNotes: "",
        payments: createInitialClosingPayments(),
        targetSessionId: sessionId ?? cashState.activeSession?.id ?? null,
      });
      setClosingModalOpen(true);
      setClosingDenoms([]);
    },
    [cashState.activeSession?.id]
  );

  // Cargar total esperado del cierre al abrir modal o cambiar la sesión objetivo
  useEffect(() => {
    if (!closingModalOpen) {
      setClosureExpectedTotal(null);
      setClosureError(null);
      setClosureLoading(false);
      return;
    }
    const sessionId = closingForm.targetSessionId ?? cashState.activeSession?.id ?? null;
    if (!sessionId) return;
    let aborted = false;
    (async () => {
      try {
        setClosureLoading(true);
        // Usamos endpoint de preparación (más ligero y válido para sesiones abiertas)
        const response = await fetch(`/api/cajas/cierres/${sessionId}/preparacion?format=json`, { credentials: "include", cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) {
          throw new Error(data?.message || "No se pudo calcular el total esperado del cierre");
        }
        const total = Number(data.preview?.expectedTotalAmount ?? 0);
        if (!aborted) {
          setClosureExpectedTotal(Number(total.toFixed(2)));
          setClosureError(null);
        }
      } catch (error) {
        if (!aborted) {
          const message = error instanceof Error ? error.message : "No se pudo calcular el total esperado del cierre";
          setClosureExpectedTotal(null);
          setClosureError(message);
        }
      } finally {
        if (!aborted) setClosureLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [closingModalOpen, closingForm.targetSessionId, cashState.activeSession?.id]);

  const activeSession = cashState.activeSession;
  const hasAssignments = cashState.cashRegisters.length > 0;
  const addOpeningDenom = () => setOpeningDenoms((prev) => [...prev, { currency: defaultCurrency, kind: "BILL", value: "", qty: "" }]);
  const removeOpeningDenom = (idx: number) => setOpeningDenoms((prev) => prev.filter((_, i) => i !== idx));
  const patchOpeningDenom = (idx: number, patch: Partial<DenominationLine>) => setOpeningDenoms((prev) => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  const openingDenomTotalByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of openingDenoms) {
      const code = (d.currency || defaultCurrency).toUpperCase();
      const val = Number(d.value.replace(/,/g, "."));
      const qty = Number(d.qty);
      if (!Number.isFinite(val) || !Number.isFinite(qty)) continue;
      map.set(code, (map.get(code) || 0) + val * qty);
    }
    return map;
  }, [openingDenoms]);
  const openingAmountValue = useMemo(() => {
    const normalized = openingForm.openingAmount.trim().replace(/,/g, ".");
    if (!normalized) {
      return 0;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [openingForm.openingAmount]);
  const requiresOpeningDenoms = openingAmountValue > 0;
  useEffect(() => {
    if (!requiresOpeningDenoms && openingDenoms.length > 0) {
      setOpeningDenoms([]);
    }
  }, [requiresOpeningDenoms, openingDenoms.length]);
  const addClosingDenom = () => setClosingDenoms((prev) => [...prev, { currency: defaultCurrency, kind: "BILL", value: "", qty: "" }]);
  const removeClosingDenom = (idx: number) => setClosingDenoms((prev) => prev.filter((_, i) => i !== idx));
  const patchClosingDenom = (idx: number, patch: Partial<DenominationLine>) => setClosingDenoms((prev) => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  const closingDenomTotalByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of closingDenoms) {
      const code = (d.currency || defaultCurrency).toUpperCase();
      const val = Number(d.value.replace(/,/g, "."));
      const qty = Number(d.qty);
      if (!Number.isFinite(val) || !Number.isFinite(qty)) continue;
      map.set(code, (map.get(code) || 0) + val * qty);
    }
    return map;
  }, [closingDenoms]);

  // Si se reporta efectivo y no hay filas de denominaciones aún, agregar una fila inicial automáticamente
  useEffect(() => {
    if (!closingModalOpen) return;
    const reportedCash = closingForm.payments.reduce((acc, p) => {
      const m = (p.method || "").trim().toUpperCase();
      const a = Number((p.amount || "").replace(/,/g, ".")) || 0;
      return acc + (m === "CASH" || m === "EFECTIVO" ? a : 0);
    }, 0);
    if (reportedCash > 0 && closingDenoms.length === 0) {
      setClosingDenoms((prev) => [...prev, { currency: defaultCurrency, kind: "BILL", value: "", qty: "" }]);
    }
  }, [closingModalOpen, closingForm.payments, closingDenoms.length]);

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Caja</h1>
        <p className="text-sm text-muted-foreground">Gestiona aperturas, cierres y consulta el historial de tu caja asignada.</p>
      </header>

      {!canAccess ? (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold text-foreground">No tienes permisos para gestionar la caja.</p>
                <p className="text-muted-foreground">Contacta a un administrador para solicitar acceso.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-3xl border bg-background/95 shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <span className={
                    activeSession
                      ? "flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"
                      : cashError
                        ? "flex h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"
                        : hasAssignments
                          ? "flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"
                          : "flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
                  }>
                    <Receipt className="h-5 w-5" />
                  </span>
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold text-foreground">Estado actual</CardTitle>
                    {cashState.loading ? (
                      <p className="text-sm text-muted-foreground">Consultando información de la caja…</p>
                    ) : cashError ? (
                      <p className="text-sm text-destructive">{cashError}</p>
                    ) : activeSession ? (
                      <div className="text-sm text-muted-foreground">
                        <p className="font-semibold text-foreground">Caja abierta</p>
                        <p>{`${activeSession.cashRegister.cashRegisterCode} • ${activeSession.cashRegister.cashRegisterName}`}</p>
                        <p>{`${activeSession.cashRegister.warehouseCode} • ${activeSession.cashRegister.warehouseName}`}</p>
                      </div>
                    ) : hasAssignments ? (
                      <p className="text-sm text-muted-foreground">Aún no has aperturado tu caja asignada.</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No tienes cajas asignadas actualmente.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={cashState.loading}
                  >
                    {cashState.loading ? (
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
                  {canOpenCash ? (
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => openOpeningModalWithContext()}
                      disabled={cashState.loading || (!activeSession && !hasAssignments)}
                    >
                      {activeSession ? "Ver apertura" : "Abrir caja"}
                    </Button>
                  ) : null}
                  {activeSession ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => handleOpenOpeningReport(activeSession.id)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Reporte apertura
                    </Button>
                  ) : null}
                  {canCloseCash ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => openClosingModalWithContext()}
                      disabled={!activeSession}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Cerrar caja
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" className="rounded-2xl" asChild>
                    <Link href="/facturacion">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Ir a facturación
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {cashState.loading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Actualizando datos…
                </div>
              ) : cashError ? (
                <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <div>
                    <p className="font-semibold">No se pudo consultar la caja</p>
                    <p className="opacity-90">{cashError}</p>
                  </div>
                </div>
              ) : activeSession ? (
                <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3">
                    <dt className="text-xs uppercase tracking-wide opacity-70">Apertura</dt>
                    <dd className="font-medium text-foreground">{formatTimestampLocale(activeSession.openingAt)}</dd>
                  </div>
                  <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3">
                    <dt className="text-xs uppercase tracking-wide opacity-70">Monto inicial</dt>
                    <dd className="font-medium text-foreground">{formatCurrency(activeSession.openingAmount ?? 0, { currency: defaultCurrency })}</dd>
                  </div>
                  <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3">
                    <dt className="text-xs uppercase tracking-wide opacity-70">Notas</dt>
                    <dd className="font-medium text-foreground">{activeSession.openingNotes?.trim() || "Sin notas"}</dd>
                  </div>
                </dl>
              ) : hasAssignments ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700">
                  Selecciona tu caja asignada y registra la apertura para comenzar tus operaciones.
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                  No tienes cajas asignadas. Solicita apoyo a un administrador.
                </div>
              )}
            </CardContent>
          </Card>

          {isAdmin ? (
            <Card className="rounded-3xl border bg-background/95 shadow-sm">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg font-semibold text-foreground">Panel administrador</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Visualiza todas las cajas y apoya a los cajeros con aperturas o cierres cuando sea necesario.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {cashState.loading && cashState.overview.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Consultando registros…
                  </div>
                ) : cashState.overview.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                    No hay cajas registradas actualmente.
                  </div>
                ) : (
                  cashState.overview.map((register) => {
                    const hasActiveSession = Boolean(register.activeSession);
                    const defaultAssignment =
                      register.assignments.find((assignment) => assignment.isDefault) ?? register.assignments[0] ?? null;
                    const statusClasses = register.isActive
                      ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
                      : "text-muted-foreground bg-muted border-muted-foreground/30";

                    return (
                      <div
                        key={register.cashRegisterId}
                        className="space-y-4 rounded-2xl border border-muted-foreground/20 bg-background/95 p-5"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <p className="text-base font-semibold text-foreground">
                              {register.cashRegisterCode} • {register.cashRegisterName}
                            </p>
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Store className="h-3.5 w-3.5" />
                              {register.warehouseCode} • {register.warehouseName}
                            </p>
                          </div>
                          <span
                            className={`inline-flex h-7 items-center justify-center rounded-full border px-3 text-xs font-semibold ${statusClasses}`}
                          >
                            {register.isActive ? "Activa" : "Inactiva"}
                          </span>
                        </div>

                        <div className="space-y-3 text-sm text-muted-foreground">
                          <div>
                            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                              <Users2 className="h-3.5 w-3.5" /> Responsables asignados
                            </p>
                            {register.assignments.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {register.assignments.map((assignment) => (
                                  <span
                                    key={`${register.cashRegisterId}-${assignment.adminUserId}`}
                                    className="rounded-full border border-muted-foreground/30 bg-muted/10 px-3 py-1 text-xs text-muted-foreground"
                                  >
                                    {assignment.displayName?.trim() || assignment.username}
                                    {assignment.isDefault ? " • Predeterminada" : ""}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs">Sin operadores asignados.</p>
                            )}
                          </div>

                          {hasActiveSession && register.activeSession ? (
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-700">
                              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                                <CircleDot className="h-4 w-4" /> Sesión abierta por {register.activeSession.adminDisplayName?.trim() || register.activeSession.adminUsername}
                              </p>
                              <p className="text-emerald-700/80">Apertura: {formatTimestampLocale(register.activeSession.openingAt)}</p>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-xs text-muted-foreground">
                              No hay sesiones activas en este momento.
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRefresh()}
                          >
                            <History className="mr-2 h-4 w-4" />
                            Actualizar
                          </Button>
                          {hasActiveSession && register.activeSession ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenOpeningReport(register.activeSession!.id)}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Reporte apertura
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => openClosingModalWithContext(register.activeSession?.id)}
                              >
                                <Lock className="mr-2 h-4 w-4" />
                                Cerrar sesión
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={!register.isActive}
                              onClick={() =>
                                openOpeningModalWithContext(
                                  register.cashRegisterCode,
                                  defaultAssignment?.adminUserId ?? currentAdminId ?? null
                                )
                              }
                            >
                              Abrir caja
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-3xl border bg-background/95 shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg font-semibold text-foreground">Historial reciente</CardTitle>
                <p className="text-xs text-muted-foreground">Mostramos hasta 20 movimientos recientes.</p>
              </div>
              {historyFilterOptions.length > 1 ? (
                <Combobox<string>
                  value={historyFilter}
                  onChange={(value) => setHistoryFilter(value)}
                  options={historyFilterOptions}
                  placeholder="Filtrar por caja"
                  ariaLabel="Filtrar historial por caja"
                  className="w-full sm:w-64"
                />
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {cashState.loading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Consultando historial…
                </div>
              ) : cashState.recentSessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                  No se encontraron aperturas o cierres recientes.
                </div>
              ) : filteredRecentSessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
                  No hay movimientos para la caja seleccionada.
                </div>
              ) : (
                filteredRecentSessions.map((snapshot) => {
                  const isClosed = snapshot.status === "CLOSED";
                  const statusLabel = snapshot.status === "CLOSED" ? "Cerrada" : snapshot.status === "OPEN" ? "Abierta" : "Cancelada";
                  const statusTone = snapshot.status === "CLOSED" ? "text-emerald-600" : snapshot.status === "OPEN" ? "text-amber-600" : "text-destructive";
                  return (
                    <div key={snapshot.id} className="space-y-4 rounded-2xl border border-muted-foreground/20 bg-background/95 p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-foreground">
                            {snapshot.cashRegister.code} • {snapshot.cashRegister.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {snapshot.cashRegister.warehouseCode} • {snapshot.cashRegister.warehouseName}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold ${statusTone}`}>{statusLabel}</span>
                      </div>
                      <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                        <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3">
                          <dt className="text-xs uppercase tracking-wide opacity-70">Apertura</dt>
                          <dd className="font-medium text-foreground">{formatTimestampLocale(snapshot.openingAt)}</dd>
                        </div>
                        <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3">
                          <dt className="text-xs uppercase tracking-wide opacity-70">Monto inicial</dt>
                          <dd className="font-medium text-foreground">{formatCurrency(snapshot.openingAmount ?? 0, { currency: defaultCurrency })}</dd>
                        </div>
                        <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3">
                          <dt className="text-xs uppercase tracking-wide opacity-70">Cierre</dt>
                          <dd className="font-medium text-foreground">{snapshot.closingAt ? formatTimestampLocale(snapshot.closingAt) : "Sin cierre"}</dd>
                        </div>
                      </dl>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleOpenOpeningReport(snapshot.id)}>
                          <Download className="mr-2 h-4 w-4" />
                          Reporte apertura (HTML)
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!isClosed}
                          onClick={() => handleOpenClosureReport(snapshot.id)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Reporte cierre (HTML)
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Modal
        open={printModalOpen}
        onClose={() => { setPrintModalOpen(false); setPrintUrl(null); setIframeLoading(false); setIframeError(null); }}
        title="Imprimir reporte de caja"
        description="Vista preliminar del reporte. Puedes imprimir o abrir en pestaña."
        contentClassName="max-w-5xl"
      >
        {printUrl ? (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  const iframe = iframeRef.current;
                  try {
                    iframe?.contentWindow?.focus();
                    iframe?.contentWindow?.print();
                  } catch {
                    window.open(printUrl, "_blank", "noopener,noreferrer");
                  }
                }}
                disabled={!!iframeError || iframeLoading}
              >
                {iframeLoading ? "Cargando…" : "Imprimir"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href={printUrl} target="_blank" rel="noreferrer noopener">Abrir en pestaña</a>
              </Button>
              {iframeError ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!printUrl) return;
                    setIframeLoading(true);
                    setIframeError(null);
                    try {
                      const reloaded = new URL(printUrl);
                      reloaded.searchParams.set("_ts", Date.now().toString());
                      setPrintUrl(reloaded.href);
                    } catch {
                      setIframeError("No se pudo recargar el reporte");
                      setIframeLoading(false);
                    }
                  }}
                >
                  Reintentar
                </Button>
              ) : null}
            </div>
            <div className="h-[70vh] overflow-hidden rounded-2xl border">
              {iframeError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
                  <p className="font-semibold text-destructive">{iframeError}</p>
                  <p className="text-muted-foreground">Abre en una pestaña para más detalles o reintenta.</p>
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  src={printUrl}
                  title="Reporte de caja"
                  className="h-full w-full"
                  onLoad={() => {
                    setIframeLoading(false);
                    try {
                      const doc = iframeRef.current?.contentDocument;
                      const ct = doc?.contentType || "";
                      if (ct && !/html/i.test(ct)) {
                        const bodyText = doc?.body?.innerText?.trim() || "";
                        if (bodyText.startsWith("{") && bodyText.includes("\"success\":false")) {
                          setIframeError("Error al cargar el reporte. Verifica permisos.");
                        } else if (!bodyText) {
                          setIframeError("Contenido vacío del reporte.");
                        }
                      }
                    } catch {
                      /* noop */
                    }
                  }}
                  onError={() => {
                    setIframeLoading(false);
                    setIframeError("No se pudo cargar el iframe del reporte");
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
            No hay URL de reporte disponible.
          </div>
        )}
      </Modal>

      <Modal
        open={openingModalOpen}
        onClose={() => setOpeningModalOpen(false)}
        title={activeSession ? "Detalles de apertura" : "Abrir caja"}
        description={activeSession ? "Consulta la información de la sesión activa." : "Selecciona tu caja y registra el monto inicial."}
        contentClassName="max-w-2xl"
      >
        {cashState.loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Consultando estado de caja…
          </div>
        ) : cashError ? (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5" />
            <div>
              <p className="font-semibold">No se pudo consultar la caja</p>
              <p className="opacity-90">{cashError}</p>
            </div>
          </div>
        ) : activeSession ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <p className="text-sm font-semibold text-emerald-700">Caja asignada</p>
              <p className="text-base font-semibold text-foreground">
                {activeSession.cashRegister.cashRegisterCode} • {activeSession.cashRegister.cashRegisterName}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeSession.cashRegister.warehouseCode} • {activeSession.cashRegister.warehouseName}
              </p>
              <dl className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="rounded-2xl bg-white/70 p-3">
                  <dt className="text-xs uppercase tracking-wide opacity-70">Apertura</dt>
                  <dd className="font-semibold text-foreground">{formatTimestampLocale(activeSession.openingAt)}</dd>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <dt className="text-xs uppercase tracking-wide opacity-70">Monto inicial</dt>
                  <dd className="font-semibold text-foreground">{formatCurrency(activeSession.openingAmount ?? 0, { currency: defaultCurrency })}</dd>
                </div>
                <div className="rounded-2xl bg-white/70 p-3">
                  <dt className="text-xs uppercase tracking-wide opacity-70">Notas</dt>
                  <dd className="font-semibold text-foreground">{activeSession.openingNotes?.trim() || "Sin notas"}</dd>
                </div>
              </dl>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpeningModalOpen(false);
                  handleOpenOpeningReport(activeSession.id);
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Imprimir reporte
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpeningModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : hasAssignments ? (
          <div className="space-y-6">
            {isAdmin ? (
              operatorOptions.length > 0 ? (
                <Combobox<number>
                  value={openingForm.operatorAdminUserId ?? null}
                  onChange={(value) =>
                    setOpeningForm((prev) => ({
                      ...prev,
                      operatorAdminUserId: value,
                    }))
                  }
                  options={operatorOptions}
                  placeholder="Selecciona un cajero"
                  label="Cajero responsable"
                  ariaLabel="Seleccionar cajero"
                />
              ) : (
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-xs text-muted-foreground">
                  No se encontraron usuarios administradores activos. Asigna operadores desde el módulo de usuarios.
                </div>
              )
            ) : null}
            {isAdmin && selectedOperator ? (
              <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3 text-xs text-muted-foreground">
                Operará: {selectedOperator.displayName?.trim() || selectedOperator.username}
                {selectedOperator.roles.length > 0 ? ` • ${selectedOperator.roles.join(", ")}` : ""}
              </div>
            ) : null}
            <Combobox<string>
              value={openingForm.cashRegisterCode}
              onChange={(value) =>
                setOpeningForm((prev) => ({
                  ...prev,
                  cashRegisterCode: (value ?? "").toUpperCase(),
                }))
              }
              options={cashRegisterOptions}
              placeholder="Selecciona una caja"
              label="Caja asignada"
              ariaLabel="Seleccionar caja para apertura"
            />
            {selectedCashRegister ? (
              <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-4 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Detalles</p>
                <p>{selectedCashRegister.cashRegisterName}</p>
                <p className="mt-1">Almacén: {selectedCashRegister.warehouseCode} • {selectedCashRegister.warehouseName}</p>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Monto de apertura</Label>
              <Input
                value={openingForm.openingAmount}
                onChange={(event) =>
                  setOpeningForm((prev) => ({ ...prev, openingAmount: event.target.value.replace(/[^0-9.,]/g, "") }))
                }
                placeholder="0.00"
                inputMode="decimal"
                className="rounded-2xl"
              />
              <p className="text-xs text-muted-foreground">Puedes iniciar en 0 si no habrá efectivo disponible.</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase text-muted-foreground">Denominaciones</p>
                {!requiresOpeningDenoms ? (
                  <span className="text-xs text-muted-foreground">Se habilitan cuando el monto supera los 0.00</span>
                ) : null}
              </div>
              {requiresOpeningDenoms ? (
                <div className="space-y-2">
                  {openingDenoms.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-xs text-muted-foreground">
                      No has agregado denominaciones.
                    </div>
                  ) : (
                    openingDenoms.map((d, idx) => (
                      <div key={`open-denom-${idx}`} className="grid gap-3 rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3 sm:grid-cols-[minmax(90px,1fr),minmax(120px,1fr),minmax(120px,1fr),minmax(120px,1fr),auto]">
                        <Input
                          value={d.currency}
                          onChange={(e) => patchOpeningDenom(idx, { currency: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase() })}
                          placeholder="Moneda"
                          className="rounded-2xl"
                        />
                        <Combobox<DenominationKind>
                          value={d.kind}
                          onChange={(value) => patchOpeningDenom(idx, { kind: value })}
                          options={denominationKindOptions}
                          placeholder="Tipo"
                          ariaLabel="Tipo de denominación"
                        />
                        <Input
                          value={d.value}
                          onChange={(e) => patchOpeningDenom(idx, { value: e.target.value.replace(/[^0-9.,]/g, "") })}
                          placeholder="Valor"
                          inputMode="decimal"
                          className="rounded-2xl"
                        />
                        <Input
                          value={d.qty}
                          onChange={(e) => patchOpeningDenom(idx, { qty: e.target.value.replace(/[^0-9]/g, "") })}
                          placeholder="Cantidad"
                          inputMode="numeric"
                          className="rounded-2xl"
                        />
                        <div className="flex items-center justify-end">
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-[22px] w-[22px] min-h-0 min-w-0 rounded-full"
                            onClick={() => removeOpeningDenom(idx)}
                            aria-label="Quitar denominación"
                          >
                            <span className="leading-none">×</span>
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={addOpeningDenom}>Agregar denominación</Button>
                  </div>
                  {openingDenomTotalByCurrency.size > 0 ? (
                    <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3 text-xs text-muted-foreground">
                      {[...openingDenomTotalByCurrency.entries()].map(([cur, total]) => (
                        <div key={`open-denom-total-${cur}`}>{cur}: <span className="font-semibold text-foreground">{formatCurrency(total, { currency: cur })}</span></div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-xs text-muted-foreground">
                  Captura un monto mayor a 0 para detallar las denominaciones de apertura.
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
              <textarea
                value={openingForm.openingNotes}
                onChange={(event) =>
                  setOpeningForm((prev) => ({ ...prev, openingNotes: event.target.value }))
                }
                placeholder="Observaciones opcionales"
                rows={3}
                className="w-full rounded-2xl border border-muted bg-background/95 p-3 text-sm text-foreground"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpeningModalOpen(false)} disabled={openingSubmitting}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => { void handleOpenCashRegister(); }} disabled={openingSubmitting}>
                {openingSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Aperturando…
                  </>
                ) : (
                  "Abrir caja"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
            No tienes cajas asignadas. Solicita a un administrador que te asigne una antes de aperturar.
          </div>
        )}
      </Modal>

      <Modal
        open={closingModalOpen}
        onClose={() => setClosingModalOpen(false)}
        title="Cerrar caja"
        description="Verifica que los montos cuadren y registra el cierre."
        contentClassName="max-w-5xl"
      >
        {closingTarget ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-4 text-sm text-muted-foreground lg:col-span-2">
                <p className="text-sm font-semibold text-foreground">Caja seleccionada</p>
                <p className="text-base font-semibold text-foreground">
                  {closingTarget.cashRegisterCode} • {closingTarget.cashRegisterName}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Store className="h-3.5 w-3.5" />
                  {closingTarget.warehouseCode} • {closingTarget.warehouseName}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Responsable: {closingTarget.operatorDisplayName} ({closingTarget.operatorUsername})
                </p>
                <p className="text-xs text-muted-foreground">Apertura: {formatTimestampLocale(closingTarget.openingAt)}</p>
              </div>
              <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-4 text-sm">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Resumen</p>
                {closureLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Calculando…</div>
                ) : closureError ? (
                  <div className="text-destructive">{closureError}</div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total esperado</span><span className="font-semibold">{formatCurrency(closureExpectedTotal ?? 0, { currency: "local" })}</span></div>
                    <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total reportado</span><span className="font-semibold">{formatCurrency((() => { const s = closingForm.payments.reduce((acc, p) => acc + (Number((p.amount||"").replace(/,/g, ".")) || 0), 0); return Number(s.toFixed(2)); })(), { currency: "local" })}</span></div>
                    <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Diferencia</span><span className={cn("font-semibold", (() => { const expected = closureExpectedTotal ?? 0; const reported = closingForm.payments.reduce((acc, p) => acc + (Number((p.amount||"").replace(/,/g, ".")) || 0), 0); const diff = Number((reported - expected).toFixed(2)); return diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-emerald-600" : "text-destructive"; })())}>{formatCurrency((() => { const expected = closureExpectedTotal ?? 0; const reported = closingForm.payments.reduce((acc, p) => acc + (Number((p.amount||"").replace(/,/g, ".")) || 0), 0); return Number((reported - expected).toFixed(2)); })(), { currency: "local" })}</span></div>
                  </div>
                )}
              </div>
            </div>

            {/* Eliminado selector de "Sesión abierta"; el contexto define la sesión a cerrar */}

            {/* Notas se mueven al final del modal */}

            <div className="space-y-3">
              <p className="text-xs uppercase text-muted-foreground">Detalle por método de pago</p>
              <div className="space-y-3">
                {closingForm.payments.map((payment, index) => (
                  <div key={`payment-${index}`} className="grid gap-3 rounded-2xl border border-muted-foreground/20 bg-muted/10 p-4 sm:grid-cols-[minmax(140px,1fr),minmax(120px,1fr),auto]">
                    <Combobox<PaymentMethod>
                      value={payment.method}
                      onChange={(value) => updateClosingPayment(index, { method: value })}
                      options={paymentMethodOptions}
                      placeholder="Método"
                      ariaLabel="Método de pago"
                      className="min-w-[140px]"
                    />
                    <Input
                      value={payment.amount}
                      onChange={(event) => updateClosingPayment(index, { amount: event.target.value.replace(/[^0-9.,]/g, "") })}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="rounded-2xl"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="h-[22px] w-[22px] min-h-0 min-w-0 rounded-full"
                        onClick={() => removeClosingPayment(index)}
                        aria-label="Quitar forma de pago"
                      >
                        <Minus className="h-[10px] w-[10px]" />
                      </Button>
                      {index === closingForm.payments.length - 1 ? (
                        <Button
                          type="button"
                          variant="success"
                          size="icon"
                          className="h-[22px] w-[22px] min-h-0 min-w-0 rounded-full"
                          onClick={addClosingPayment}
                          aria-label="Agregar forma de pago"
                        >
                          <Plus className="h-[10px] w-[10px]" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {/* Denominaciones: mostrar solo si se reporta efectivo > 0 y colocarlas debajo del detalle de pagos */}
              {(() => { const cash = closingForm.payments.reduce((acc, p) => {
                  const m = (p.method||"").toUpperCase().trim(); const a = Number((p.amount||"").replace(/,/g, ".")) || 0; return acc + (m === "CASH" || m === "EFECTIVO" ? a : 0);
                }, 0); return cash > 0; })() ? (
                <>
                  <p className="text-xs uppercase text-muted-foreground">Denominaciones</p>
                  <div className="space-y-2">
                    {closingDenoms.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-xs text-muted-foreground">
                        No has agregado denominaciones.
                      </div>
                    ) : (
                      closingDenoms.map((d, idx) => (
                        <div key={`close-denom-${idx}`} className="grid gap-3 rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3 sm:grid-cols-[minmax(90px,1fr),minmax(120px,1fr),minmax(120px,1fr),minmax(120px,1fr),auto]">
                          <Input
                            value={d.currency}
                            onChange={(e) => patchClosingDenom(idx, { currency: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase() })}
                            placeholder="Moneda"
                            className="rounded-2xl"
                          />
                          <Combobox<DenominationKind>
                            value={d.kind}
                            onChange={(value) => patchClosingDenom(idx, { kind: value })}
                            options={denominationKindOptions}
                            placeholder="Tipo"
                            ariaLabel="Tipo de denominación"
                          />
                          <Input
                            value={d.value}
                            onChange={(e) => patchClosingDenom(idx, { value: e.target.value.replace(/[^0-9.,]/g, "") })}
                            placeholder="Valor"
                            inputMode="decimal"
                            className="rounded-2xl"
                          />
                          <Input
                            value={d.qty}
                            onChange={(e) => patchClosingDenom(idx, { qty: e.target.value.replace(/[^0-9]/g, "") })}
                            placeholder="Cantidad"
                            inputMode="numeric"
                            className="rounded-2xl"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-[22px] w-[22px] min-h-0 min-w-0 rounded-full"
                              onClick={() => removeClosingDenom(idx)}
                              aria-label="Quitar denominación"
                            >
                              <span className="leading-none">×</span>
                            </Button>
                            {idx === closingDenoms.length - 1 ? (
                              <Button
                                type="button"
                                variant="success"
                                size="icon"
                                className="h-[22px] w-[22px] min-h-0 min-w-0 rounded-full"
                                onClick={addClosingDenom}
                                aria-label="Agregar denominación"
                              >
                                <Plus className="h-[10px] w-[10px]" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                    {closingDenomTotalByCurrency.size > 0 ? (
                      <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-3 text-xs text-muted-foreground">
                        {[...closingDenomTotalByCurrency.entries()].map(([cur, total]) => (
                          <div key={`close-denom-total-${cur}`}>{cur}: <span className="font-semibold text-foreground">{formatCurrency(total, { currency: cur })}</span></div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-1 lg:col-span-3">
                <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
                <textarea
                  value={closingForm.closingNotes}
                  onChange={(event) =>
                    setClosingForm((prev) => ({ ...prev, closingNotes: event.target.value }))
                  }
                  placeholder="Observaciones del cierre"
                  rows={3}
                  className="w-full rounded-2xl border border-muted bg-background/95 p-3 text-sm text-foreground"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setClosingModalOpen(false)} disabled={closingSubmitting}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => { void handleCloseCashRegister(); }} disabled={closingSubmitting}>
                {closingSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cerrando…
                  </>
                ) : (
                  "Cerrar caja"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
            Selecciona una sesión activa desde el panel o abre una caja para registrar el cierre.
          </div>
        )}
      </Modal>

      {/* Confirmación por diferencia */}
      <Modal
        open={diffConfirmOpen}
        onClose={() => setDiffConfirmOpen(false)}
        title="Confirmar diferencia en cierre"
        description="Detectamos una diferencia entre lo esperado y lo reportado."
        contentClassName="max-w-xl"
      >
        {(() => {
          const prepared = preparedClosureRef.current;
          const expected = prepared?.expected ?? 0;
          const reported = prepared?.reported ?? 0;
          const diff = Number((reported - expected).toFixed(2));
          const isOver = diff > 0;
          return (
            <div className="space-y-5">
              <div className="rounded-2xl border border-muted-foreground/20 bg-muted/10 p-4 text-sm">
                <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total esperado</span><span className="font-semibold">{formatCurrency(expected, { currency: "local" })}</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Total reportado</span><span className="font-semibold">{formatCurrency(reported, { currency: "local" })}</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Diferencia</span><span className={cn("font-semibold", diff === 0 ? "text-muted-foreground" : isOver ? "text-emerald-600" : "text-destructive")}>{formatCurrency(diff, { currency: "local" })} {diff === 0 ? "" : isOver ? "(sobrante)" : "(faltante)"}</span></div>
              </div>
              <p className="text-sm text-muted-foreground">Si continúas, registraremos esta diferencia en el cierre como {isOver ? "sobrante" : "faltante"}. Podrás verlo en el reporte.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDiffConfirmOpen(false)}>Cancelar</Button>
                <Button type="button" onClick={confirmAndSubmitDifference}>Continuar y cerrar</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </section>
  );
}