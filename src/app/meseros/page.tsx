"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { formatCurrency } from "@/config/currency";

const DATETIME_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

type WaiterDirectoryEntry = {
  id: number;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type WaiterFormState = {
  code: string;
  fullName: string;
  phone: string;
  email: string;
  isActive: boolean;
  pin: string;
};

type PinFormState = {
  pin: string;
  confirm: string;
};

const emptyWaiterForm: WaiterFormState = {
  code: "",
  fullName: "",
  phone: "",
  email: "",
  isActive: true,
  pin: "",
};

const emptyPinForm: PinFormState = {
  pin: "",
  confirm: "",
};

function formatDate(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return DATETIME_FORMATTER.format(date);
}

function formatDateOnly(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return DATE_FORMATTER.format(date);
}

export default function MeserosPage() {
  const { toast } = useToast();
  const [waiters, setWaiters] = useState<WaiterDirectoryEntry[]>([]);
  const [loadingWaiters, setLoadingWaiters] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<WaiterFormState>(emptyWaiterForm);
  const [editingWaiterId, setEditingWaiterId] = useState<number | null>(null);
  const [savingWaiter, setSavingWaiter] = useState(false);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinForm, setPinForm] = useState<PinFormState>(emptyPinForm);
  const [pinTarget, setPinTarget] = useState<WaiterDirectoryEntry | null>(null);
  const [resettingPinId, setResettingPinId] = useState<number | null>(null);

  const [togglingWaiterId, setTogglingWaiterId] = useState<number | null>(null);

  const loadWaiters = useCallback(async () => {
    setLoadingWaiters(true);
    try {
      const res = await fetch("/api/waiters?include_inactive=true", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("No se pudieron cargar los meseros");
      }
      const data = (await res.json()) as { waiters?: WaiterDirectoryEntry[] };
      setWaiters(Array.isArray(data.waiters) ? data.waiters : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los meseros";
      toast({ variant: "error", title: "Meseros", description: message });
      setWaiters([]);
    } finally {
      setLoadingWaiters(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadWaiters();
  }, [loadWaiters]);

  const stats = useMemo(() => {
    const total = waiters.length;
    const active = waiters.filter((waiter) => waiter.isActive).length;
    const inactive = total - active;
    const recentLogins = waiters.filter((waiter) => {
      if (!waiter.lastLoginAt) return false;
      const last = new Date(waiter.lastLoginAt).getTime();
      const today = Date.now();
      const diff = today - last;
      return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    return { total, active, inactive, recentLogins };
  }, [waiters]);

  const filteredWaiters = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return waiters
      .filter((waiter) => (showInactive ? true : waiter.isActive))
      .filter((waiter) => {
        if (!term) return true;
        return (
          waiter.code.toLowerCase().includes(term) ||
          waiter.fullName.toLowerCase().includes(term) ||
          (waiter.email ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [waiters, searchTerm, showInactive]);

  const openCreateModal = () => {
    setEditingWaiterId(null);
    setForm(emptyWaiterForm);
    setModalOpen(true);
  };

  const openEditModal = (waiter: WaiterDirectoryEntry) => {
    setEditingWaiterId(waiter.id);
    setForm({
      code: waiter.code,
      fullName: waiter.fullName,
      phone: waiter.phone ?? "",
      email: waiter.email ?? "",
      isActive: waiter.isActive,
      pin: "",
    });
    setModalOpen(true);
  };

  const openResetPinModal = (waiter: WaiterDirectoryEntry) => {
    setPinForm(emptyPinForm);
    setPinTarget(waiter);
    setPinModalOpen(true);
  };

  const handleSaveWaiter = async () => {
    const code = form.code.trim();
    const fullName = form.fullName.trim();
    if (!code || !fullName) {
      toast({ variant: "warning", title: "Meseros", description: "Captura el código y nombre del mesero" });
      return;
    }
    if (!editingWaiterId && !form.pin.trim()) {
      toast({ variant: "warning", title: "Meseros", description: "Ingresa un PIN temporal" });
      return;
    }

    setSavingWaiter(true);
    try {
      const payload: Record<string, unknown> = {
        code,
        full_name: fullName,
        phone: form.phone.trim(),
        email: form.email.trim(),
        is_active: form.isActive,
      };

      const endpoint = editingWaiterId ? `/api/waiters/${editingWaiterId}` : "/api/waiters";
      const method = editingWaiterId ? "PATCH" : "POST";
      if (!editingWaiterId) {
        payload.pin = form.pin.trim();
      }
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo guardar el mesero");
      }

      toast({
        variant: "success",
        title: "Meseros",
        description: editingWaiterId ? "Mesero actualizado" : "Mesero registrado",
      });
      setModalOpen(false);
      setForm(emptyWaiterForm);
      setEditingWaiterId(null);
      await loadWaiters();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el mesero";
      toast({ variant: "error", title: "Meseros", description: message });
    } finally {
      setSavingWaiter(false);
    }
  };

  const handleToggleActive = async (waiter: WaiterDirectoryEntry, isActive: boolean) => {
    setTogglingWaiterId(waiter.id);
    try {
      const res = await fetch(`/api/waiters/${waiter.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo actualizar el estado");
      }
      toast({
        variant: "success",
        title: "Meseros",
        description: isActive ? "Mesero activado" : "Mesero desactivado",
      });
      await loadWaiters();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el estado";
      toast({ variant: "error", title: "Meseros", description: message });
    } finally {
      setTogglingWaiterId(null);
    }
  };

  const handleResetPin = async () => {
    if (!pinTarget) {
      return;
    }
    const pin = pinForm.pin.trim();
    if (!pin) {
      toast({ variant: "warning", title: "Meseros", description: "Captura el nuevo PIN" });
      return;
    }
    if (pin !== pinForm.confirm.trim()) {
      toast({ variant: "warning", title: "Meseros", description: "El PIN y su confirmación no coinciden" });
      return;
    }
    setResettingPinId(pinTarget.id);
    try {
      const res = await fetch(`/api/waiters/${pinTarget.id}/reset-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo actualizar el PIN");
      }
      toast({ variant: "success", title: "Meseros", description: "PIN actualizado" });
      setPinModalOpen(false);
      setPinTarget(null);
      setPinForm(emptyPinForm);
      await loadWaiters();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el PIN";
      toast({ variant: "error", title: "Meseros", description: message });
    } finally {
      setResettingPinId(null);
    }
  };

  const totalTips = useMemo(() => {
    const activeSessions = waiters.reduce<number>((sum, waiter) => {
      if (!waiter.isActive) {
        return sum;
      }
      return sum + (waiter.lastLoginAt ? 1 : 0);
    }, 0);
    return activeSessions * 150;
  }, [waiters]);

  return (
    <section className="space-y-10 pb-16">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Meseros</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Administra credenciales y datos de contacto del equipo. Activa, desactiva o reinicia PINs desde el
            directorio centralizado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10 rounded-2xl px-4" onClick={() => void loadWaiters()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refrescar
          </Button>
          <Button type="button" className="h-10 rounded-2xl px-4" onClick={openCreateModal} aria-label="Agregar nuevo mesero">
            <Plus className="mr-2 h-4 w-4" /> Nuevo mesero
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Total de meseros</CardTitle>
            <CardTitle className="text-3xl font-semibold text-foreground">{stats.total}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Incluye personal activo e inactivo</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Activos</CardTitle>
            <CardTitle className="text-3xl font-semibold text-emerald-600">{stats.active}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Disponibles para turno</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Inactivos</CardTitle>
            <CardTitle className="text-3xl font-semibold text-amber-600">{stats.inactive}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Requieren reactivación</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Accesos recientes (7 días)</CardTitle>
            <CardTitle className="text-3xl font-semibold text-foreground">{stats.recentLogins}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Últimos inicios de sesión</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Directorio de meseros</CardTitle>
          <CardDescription>
            Consulta y actualiza la información del personal con filtros rápidos y acciones contextuales.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por código, nombre o correo"
                className="rounded-2xl border border-muted bg-background pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showInactive ? "default" : "outline"}
                className="gap-2 rounded-2xl"
                onClick={() => setShowInactive((previous) => !previous)}
              >
                {showInactive ? <ShieldCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                {showInactive ? "Mostrar solo activos" : "Incluir inactivos"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Mesero</th>
                  <th className="px-3 py-2">Contacto</th>
                  <th className="px-3 py-2">Último acceso</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingWaiters ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando directorio...
                      </span>
                    </td>
                  </tr>
                ) : filteredWaiters.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No hay registros con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filteredWaiters.map((waiter) => (
                    <tr key={waiter.id} className="align-top hover:bg-muted/40">
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{waiter.fullName}</p>
                          <p className="font-mono text-xs text-muted-foreground">{waiter.code}</p>
                          <p className="text-xs text-muted-foreground">Alta: {formatDateOnly(waiter.createdAt, "Sin registro")}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>{waiter.phone ? waiter.phone : "Sin teléfono"}</p>
                          <p>{waiter.email ? waiter.email : "Sin correo"}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {formatDate(waiter.lastLoginAt, "Sin accesos registrados")}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-2xl px-2.5 py-1 text-xs font-semibold ${
                            waiter.isActive ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {waiter.isActive ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                          {waiter.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openEditModal(waiter)}
                          >
                            <Pencil className="mr-1 h-4 w-4" /> Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openResetPinModal(waiter)}
                          >
                            <KeyRound className="mr-1 h-4 w-4" /> Cambiar PIN
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            disabled={togglingWaiterId === waiter.id}
                            onClick={() => void handleToggleActive(waiter, !waiter.isActive)}
                          >
                            {togglingWaiterId === waiter.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : waiter.isActive ? (
                              <UserX className="mr-1 h-4 w-4" />
                            ) : (
                              <UserCheck className="mr-1 h-4 w-4" />
                            )}
                            {waiter.isActive ? "Desactivar" : "Activar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Incentivos estimados</CardTitle>
          <CardDescription>
            Proyección simple basada en turnos con acceso reciente. Ajusta las variables reales desde Finanzas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-xs uppercase text-muted-foreground">Turnos recientes</p>
            <p className="text-2xl font-semibold text-foreground">{stats.recentLogins}</p>
            <p className="text-xs text-muted-foreground">Sesiones registradas últimos 7 días</p>
          </div>
          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-xs uppercase text-muted-foreground">Estimado de propinas</p>
            <p className="text-2xl font-semibold text-foreground">{formatCurrency(totalTips, { currency: "local" })}</p>
            <p className="text-xs text-muted-foreground">Promedio 150 córdobas por turno</p>
          </div>
          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-xs uppercase text-muted-foreground">Turnos pendientes</p>
            <p className="text-2xl font-semibold text-foreground">{Math.max(stats.active - stats.recentLogins, 0)}</p>
            <p className="text-xs text-muted-foreground">Meseros activos sin acceso reciente</p>
          </div>
          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-xs uppercase text-muted-foreground">Notas operativas</p>
            <p className="text-sm text-muted-foreground">
              Actualiza los montos reales al cierre de jornada para mantener el seguimiento de incentivos.
            </p>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (savingWaiter) return;
          setModalOpen(false);
          setEditingWaiterId(null);
          setForm(emptyWaiterForm);
        }}
        title={editingWaiterId ? "Editar mesero" : "Nuevo mesero"}
        contentClassName="max-w-xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Código</Label>
              <Input
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                  }))
                }
                placeholder="MESERO-001"
                disabled={savingWaiter}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Nombre completo</Label>
              <Input
                value={form.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Nombre y apellidos"
                disabled={savingWaiter}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Teléfono</Label>
              <Input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value.replace(/[^0-9+()\s-]/g, ""),
                  }))
                }
                placeholder="Ej. +505 5555 0000"
                disabled={savingWaiter}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Correo</Label>
              <Input
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="correo@empresa.com"
                disabled={savingWaiter}
                className="rounded-2xl"
              />
            </div>
            {!editingWaiterId ? (
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs uppercase text-muted-foreground">PIN temporal</Label>
                <Input
                  value={form.pin}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, pin: event.target.value.replace(/[^0-9]/g, "") }))
                  }
                  placeholder="4 a 12 dígitos"
                  disabled={savingWaiter}
                  className="rounded-2xl"
                />
                <p className="text-xs text-muted-foreground">
                  Comparte este PIN para el primer ingreso; el mesero podrá cambiarlo después.
                </p>
              </div>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              disabled={savingWaiter}
              className="h-4 w-4 rounded border-muted-foreground"
            />
            Mesero activo en catálogo
          </label>

          <div className="flex gap-3">
            <Button type="button" disabled={savingWaiter} onClick={() => void handleSaveWaiter()} className="rounded-2xl">
              {savingWaiter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingWaiterId ? "Actualizar" : "Guardar mesero"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (savingWaiter) return;
                setModalOpen(false);
                setEditingWaiterId(null);
                setForm(emptyWaiterForm);
              }}
              className="rounded-2xl"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pinModalOpen}
        onClose={() => {
          if (resettingPinId) return;
          setPinModalOpen(false);
          setPinTarget(null);
          setPinForm(emptyPinForm);
        }}
        title={pinTarget ? `Actualizar PIN (${pinTarget.code})` : "Actualizar PIN"}
        contentClassName="max-w-md"
      >
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Nuevo PIN</Label>
            <Input
              value={pinForm.pin}
              onChange={(event) => setPinForm((current) => ({ ...current, pin: event.target.value.replace(/[^0-9]/g, "") }))}
              placeholder="Ingresa entre 4 y 12 dígitos"
              disabled={!!resettingPinId}
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Confirmar PIN</Label>
            <Input
              value={pinForm.confirm}
              onChange={(event) => setPinForm((current) => ({ ...current, confirm: event.target.value.replace(/[^0-9]/g, "") }))}
              placeholder="Repite el PIN"
              disabled={!!resettingPinId}
              className="rounded-2xl"
            />
          </div>
          <div className="flex gap-3">
            <Button type="button" disabled={!!resettingPinId} onClick={() => void handleResetPin()} className="rounded-2xl">
              {resettingPinId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar PIN
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (resettingPinId) return;
                setPinModalOpen(false);
                setPinTarget(null);
                setPinForm(emptyPinForm);
              }}
              className="rounded-2xl"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
