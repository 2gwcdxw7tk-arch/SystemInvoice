"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, CalendarX, Filter, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import type { TableAdminSnapshot, TableZone } from "@/lib/db/tables";

const DATETIME_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

const statusToneStyles: Record<StatusTone, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
};

type TableFormState = {
  id: string;
  label: string;
  zoneId: string;
  capacity: string;
  isActive: boolean;
};

type ReservationFormState = {
  reservedBy: string;
  contactName: string;
  contactPhone: string;
  partySize: string;
  scheduledFor: string;
  notes: string;
};

const emptyTableForm: TableFormState = {
  id: "",
  label: "",
  zoneId: "",
  capacity: "",
  isActive: true,
};

const emptyReservationForm: ReservationFormState = {
  reservedBy: "",
  contactName: "",
  contactPhone: "",
  partySize: "",
  scheduledFor: "",
  notes: "",
};

function isTableAvailable(table: TableAdminSnapshot): boolean {
  return table.is_active && !table.reservation && table.order_status === "libre";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return DATETIME_FORMATTER.format(date);
}

function extractDatePart(value?: string | null): string {
  if (!value) {
    return "";
  }
  const [datePart] = value.split("T");
  return datePart ?? "";
}

function extractTimePart(value?: string | null): string {
  if (!value) {
    return "";
  }
  const [, timePart] = value.split("T");
  if (!timePart) {
    return "";
  }
  return timePart.slice(0, 5);
}

function combineDateTime(date: string, time: string): string {
  const normalizedTime = time && time.length >= 4 ? time.slice(0, 5) : "00:00";
  return `${date}T${normalizedTime}`;
}

function getStatusMeta(table: TableAdminSnapshot): { label: string; tone: StatusTone } {
  if (!table.is_active) {
    return { label: "Inactiva", tone: "muted" };
  }

  if (table.reservation) {
    const label = table.reservation.status === "seated" ? "Reservada en sala" : "Reservada";
    return { label, tone: "warning" };
  }

  if (table.order_status === "libre") {
    return { label: "Disponible", tone: "success" };
  }

  if (table.order_status === "normal") {
    return { label: "En servicio", tone: "info" };
  }

  if (table.order_status === "facturado") {
    return { label: "Facturada", tone: "success" };
  }

  if (table.order_status === "anulado") {
    return { label: "Anulada", tone: "danger" };
  }

  return { label: "En servicio", tone: "info" };
}

export default function MesasPage(): JSX.Element {
  const { toast } = useToast();
  const [tables, setTables] = useState<TableAdminSnapshot[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);

  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [reservationTableId, setReservationTableId] = useState<string | null>(null);
  const [tableForm, setTableForm] = useState<TableFormState>(emptyTableForm);
  const [reservationForm, setReservationForm] = useState<ReservationFormState>(emptyReservationForm);
  const [savingTable, setSavingTable] = useState(false);
  const [reservationSaving, setReservationSaving] = useState(false);
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);
  const [releaseInFlight, setReleaseInFlight] = useState<string | null>(null);

  const zoneOptions = useMemo(
    () =>
      zones.map((zone) => ({
        value: zone.id,
        label: zone.name,
        description: zone.is_active ? undefined : "Inactiva",
      })),
    [zones]
  );

  const stats = useMemo(() => {
    const total = tables.length;
    const available = tables.filter(isTableAvailable).length;
    const reserved = tables.filter((table) => !!table.reservation).length;
    const occupied = tables.filter((table) => table.order_status !== "libre" && table.order_status !== "anulado").length;
    const inactive = tables.filter((table) => !table.is_active).length;
    return { total, available, reserved, occupied, inactive };
  }, [tables]);

  const filteredTables = useMemo(() => {
    const base = showAvailableOnly ? tables.filter(isTableAvailable) : tables;
    return [...base].sort((a, b) => {
      const zoneA = (a.zone ?? "").toLocaleLowerCase("es-MX");
      const zoneB = (b.zone ?? "").toLocaleLowerCase("es-MX");
      if (zoneA === zoneB) {
        return a.label.localeCompare(b.label, "es-MX");
      }
      return zoneA.localeCompare(zoneB, "es-MX");
    });
  }, [tables, showAvailableOnly]);

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const res = await fetch("/api/tables", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("No se pudieron cargar las mesas");
      }
      const data = (await res.json()) as { tables?: TableAdminSnapshot[] };
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las mesas";
      toast({ variant: "error", title: "Mesas", description: message });
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  }, [toast]);

  const loadZones = useCallback(async () => {
    try {
      const res = await fetch("/api/tables/zones?include_inactive=true", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("No se pudieron cargar las zonas");
      }
      const data = (await res.json()) as { zones?: TableZone[] };
      setZones(Array.isArray(data.zones) ? data.zones : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las zonas";
      toast({ variant: "error", title: "Zonas", description: message });
      setZones([]);
    }
  }, [toast]);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  const handleReservationDateChange = useCallback((nextDate: string) => {
    setReservationForm((current) => {
      if (!nextDate) {
        return { ...current, scheduledFor: "" };
      }
      const currentTime = extractTimePart(current.scheduledFor) || "00:00";
      return { ...current, scheduledFor: combineDateTime(nextDate, currentTime) };
    });
  }, []);

  const handleReservationTimeChange = useCallback((nextTime: string) => {
    setReservationForm((current) => {
      const datePart = extractDatePart(current.scheduledFor);
      if (!datePart) {
        return current;
      }
      const sanitizedTime = nextTime ? nextTime.slice(0, 5) : "00:00";
      return { ...current, scheduledFor: combineDateTime(datePart, sanitizedTime) };
    });
  }, []);

  function openCreateModal(): void {
    const defaultZone = zones.find((zone) => zone.is_active);
    setEditingTableId(null);
    setTableForm({
      ...emptyTableForm,
      zoneId: defaultZone?.id ?? "",
    });
    setTableModalOpen(true);
  }

  function openEditModal(table: TableAdminSnapshot): void {
    setEditingTableId(table.id);
    setTableForm({
      id: table.id,
      label: table.label,
      zoneId: table.zone_id ?? "",
      capacity: table.capacity ? String(table.capacity) : "",
      isActive: table.is_active,
    });
    setTableModalOpen(true);
  }

  function openReservationModal(table: TableAdminSnapshot): void {
    setReservationTableId(table.id);
    setReservationForm({
      reservedBy: "",
      contactName: "",
      contactPhone: "",
      partySize: table.capacity ? String(table.capacity) : "",
      scheduledFor: "",
      notes: "",
    });
    setReservationModalOpen(true);
  }

  async function saveTable(): Promise<void> {
    const id = tableForm.id.trim();
    const label = tableForm.label.trim();
    if (!id || !label) {
      toast({ variant: "warning", title: "Mesas", description: "Captura el código y nombre de la mesa" });
      return;
    }
    if (!tableForm.zoneId) {
      toast({ variant: "warning", title: "Mesas", description: "Selecciona una zona para la mesa" });
      return;
    }

    setSavingTable(true);
    try {
      const payload = {
        id,
        label,
        zone_id: tableForm.zoneId || null,
        capacity: tableForm.capacity ? Number.parseInt(tableForm.capacity, 10) || null : null,
        is_active: tableForm.isActive,
      };

      const endpoint = editingTableId ? `/api/tables/${editingTableId}` : "/api/tables";
      const method = editingTableId ? "PATCH" : "POST";
      const body = editingTableId
        ? JSON.stringify({
            label: payload.label,
            zone_id: payload.zone_id,
            capacity: payload.capacity,
            is_active: payload.is_active,
          })
        : JSON.stringify(payload);

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const message = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(message?.message ?? "No se pudo guardar la mesa");
      }

      toast({ variant: "success", title: "Mesas", description: editingTableId ? "Mesa actualizada" : "Mesa registrada" });
      setTableModalOpen(false);
      setTableForm({ ...emptyTableForm, zoneId: zones.find((zone) => zone.is_active)?.id ?? "" });
      setEditingTableId(null);
      await loadTables();
      await loadZones();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la mesa";
      toast({ variant: "error", title: "Mesas", description: message });
    } finally {
      setSavingTable(false);
    }
  }

  async function deleteTable(table: TableAdminSnapshot): Promise<void> {
    if (!confirm(`¿Eliminar la mesa ${table.label}?`)) {
      return;
    }
    setDeletingTableId(table.id);
    try {
      const res = await fetch(`/api/tables/${table.id}`, { method: "DELETE" });
      if (!res.ok) {
        const message = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(message?.message ?? "No se pudo eliminar la mesa");
      }
      toast({ variant: "success", title: "Mesas", description: "Mesa eliminada" });
      await loadTables();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la mesa";
      toast({ variant: "error", title: "Mesas", description: message });
    } finally {
      setDeletingTableId(null);
    }
  }

  async function saveReservation(): Promise<void> {
    if (!reservationTableId) {
      return;
    }
    const reservedBy = reservationForm.reservedBy.trim();
    if (!reservedBy) {
      toast({ variant: "warning", title: "Reservaciones", description: "Indica quién realiza la reservación" });
      return;
    }

    setReservationSaving(true);
    try {
      const payload = {
        reserved_by: reservedBy,
        contact_name: reservationForm.contactName.trim() ? reservationForm.contactName.trim() : null,
        contact_phone: reservationForm.contactPhone.trim() ? reservationForm.contactPhone.trim() : null,
        party_size: reservationForm.partySize ? Number.parseInt(reservationForm.partySize, 10) || null : null,
        scheduled_for: reservationForm.scheduledFor ? reservationForm.scheduledFor : null,
        notes: reservationForm.notes.trim() ? reservationForm.notes.trim() : null,
      };

      const res = await fetch(`/api/tables/${reservationTableId}/reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const message = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(message?.message ?? "No se pudo registrar la reservación");
      }

      toast({ variant: "success", title: "Reservaciones", description: "Mesa reservada" });
      setReservationModalOpen(false);
      setReservationForm(emptyReservationForm);
      setReservationTableId(null);
      await loadTables();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo registrar la reservación";
      toast({ variant: "error", title: "Reservaciones", description: message });
    } finally {
      setReservationSaving(false);
    }
  }

  async function releaseReservation(table: TableAdminSnapshot): Promise<void> {
    setReleaseInFlight(table.id);
    try {
      const res = await fetch(`/api/tables/${table.id}/reservation`, { method: "DELETE" });
      if (!res.ok) {
        const message = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(message?.message ?? "No se pudo liberar la reservación");
      }
      toast({ variant: "success", title: "Reservaciones", description: "Reservación liberada" });
      await loadTables();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo liberar la reservación";
      toast({ variant: "error", title: "Reservaciones", description: message });
    } finally {
      setReleaseInFlight(null);
    }
  }

  const scheduledDate = extractDatePart(reservationForm.scheduledFor);
  const scheduledTime = extractTimePart(reservationForm.scheduledFor);
  const activeReservationTable = useMemo(
    () => tables.find((table) => table.id === reservationTableId) ?? null,
    [tables, reservationTableId]
  );

  return (
    <section className="space-y-10 pb-16">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Mesas</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Administra códigos, zonas, capacidad y reservaciones para mantener la operación sincronizada con la sala y la vista de facturación.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setShowAvailableOnly((value) => !value)} className="h-10 rounded-2xl px-4">
            <Filter className="mr-2 h-4 w-4" />
            {showAvailableOnly ? "Mostrar todas" : "Solo disponibles"}
          </Button>
          <Button type="button" onClick={openCreateModal} className="h-10 rounded-2xl px-4" aria-label="Registrar nueva mesa">
            <Plus className="mr-2 h-4 w-4" />
            Nueva mesa
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de mesas</CardTitle>
            <p className="text-3xl font-semibold text-foreground">{stats.total}</p>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disponibles</CardTitle>
            <p className="text-3xl font-semibold text-emerald-600">{stats.available}</p>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reservadas</CardTitle>
            <p className="text-3xl font-semibold text-amber-600">{stats.reserved}</p>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">En servicio</CardTitle>
            <p className="text-3xl font-semibold text-rose-600">{stats.occupied}</p>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactivas</CardTitle>
            <p className="text-3xl font-semibold text-muted-foreground">{stats.inactive}</p>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Listado de mesas</CardTitle>
          <CardDescription>
            Controla asignaciones, disponibilidad y reservas en tiempo real. Usa el filtro superior para revisar únicamente las mesas libres.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Zona</th>
                  <th className="px-3 py-2">Capacidad</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Mesero asignado</th>
                  <th className="px-3 py-2">Reservación</th>
                  <th className="px-3 py-2">Último cambio</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingTables ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando mesas...
                      </span>
                    </td>
                  </tr>
                ) : filteredTables.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No hay mesas registradas con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filteredTables.map((table) => {
                    const statusMeta = getStatusMeta(table);
                    const available = isTableAvailable(table);
                    return (
                      <tr key={table.id} className="align-top hover:bg-muted/40">
                        <td className="px-3 py-2 font-mono text-xs">{table.id}</td>
                        <td className="px-3 py-2">{table.zone ?? "—"}</td>
                        <td className="px-3 py-2">{table.capacity ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-2xl px-2.5 py-1 text-xs font-semibold ${statusToneStyles[statusMeta.tone]}`}>
                            {statusMeta.label}
                          </span>
                          {table.pending_items_count > 0 || table.sent_items_count > 0 ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Pendientes: {table.pending_items_count} · Servidos: {table.sent_items_count}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {table.assigned_waiter_name ? (
                            <div className="space-y-0.5">
                              <p className="font-medium">{table.assigned_waiter_name}</p>
                              <p className="text-xs text-muted-foreground">ID: {table.assigned_waiter_id}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {table.reservation ? (
                            <div className="space-y-1">
                              <p className="font-medium">{table.reservation.reserved_by}</p>
                              {table.reservation.scheduled_for ? (
                                <p className="text-xs text-muted-foreground">{formatDate(table.reservation.scheduled_for)}</p>
                              ) : null}
                              {table.reservation.party_size ? (
                                <p className="text-xs text-muted-foreground">{table.reservation.party_size} personas</p>
                              ) : null}
                              {table.reservation.contact_phone ? (
                                <p className="text-xs text-muted-foreground">Tel. {table.reservation.contact_phone}</p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(table.updated_state_at ?? table.updated_at)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-xl px-3 text-xs"
                              onClick={() => openReservationModal(table)}
                              disabled={!available || savingTable || reservationSaving}
                            >
                              <CalendarPlus className="mr-1 h-4 w-4" />
                              Reservar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-xl px-3 text-xs"
                              onClick={() => void releaseReservation(table)}
                              disabled={!table.reservation || releaseInFlight === table.id}
                            >
                              {releaseInFlight === table.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CalendarX className="mr-1 h-4 w-4" />}
                              Liberar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-xl px-3 text-xs"
                              onClick={() => openEditModal(table)}
                            >
                              <Pencil className="mr-1 h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-8 rounded-xl px-3 text-xs"
                              onClick={() => void deleteTable(table)}
                              disabled={deletingTableId === table.id}
                            >
                              {deletingTableId === table.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                              Eliminar
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
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => void loadTables()} className="rounded-2xl">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refrescar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={tableModalOpen}
        onClose={() => setTableModalOpen(false)}
        title={editingTableId ? `Editar mesa (${editingTableId})` : "Nueva mesa"}
        contentClassName="max-w-xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Código</Label>
              <Input
                value={tableForm.id}
                disabled={!!editingTableId}
                onChange={(event) =>
                  setTableForm((current) => ({
                    ...current,
                    id: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                  }))
                }
                placeholder="T-01"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
              <Input
                value={tableForm.label}
                onChange={(event) => setTableForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Mesa principal"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Zona</Label>
              <Combobox
                value={tableForm.zoneId || null}
                onChange={(value) => setTableForm((current) => ({ ...current, zoneId: value }))}
                options={zoneOptions}
                placeholder={zoneOptions.length ? "Selecciona una zona" : "No hay zonas activas"}
                emptyText="No hay zonas activas"
                disabled={!zoneOptions.length}
                ariaLabel="Zona"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Capacidad</Label>
              <Input
                value={tableForm.capacity}
                inputMode="numeric"
                onChange={(event) =>
                  setTableForm((current) => ({ ...current, capacity: event.target.value.replace(/[^0-9]/g, "") }))
                }
                placeholder="4"
                className="rounded-2xl"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={tableForm.isActive}
              onChange={(event) => setTableForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-4 w-4 rounded border-muted-foreground"
            />
            Mesa activa en catálogo
          </label>
          <div className="flex gap-3">
            <Button type="button" disabled={savingTable} onClick={() => void saveTable()} className="rounded-2xl">
              {savingTable ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingTableId ? "Actualizar" : "Guardar mesa"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setTableModalOpen(false)} className="rounded-2xl">
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={reservationModalOpen}
        onClose={() => setReservationModalOpen(false)}
        title={activeReservationTable ? `Reservar ${activeReservationTable.label}` : "Reservar mesa"}
        contentClassName="max-w-xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Reservada por</Label>
              <Input
                value={reservationForm.reservedBy}
                onChange={(event) => setReservationForm((current) => ({ ...current, reservedBy: event.target.value }))}
                placeholder="Cliente"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Contacto</Label>
              <Input
                value={reservationForm.contactPhone}
                onChange={(event) => setReservationForm((current) => ({ ...current, contactPhone: event.target.value }))}
                placeholder="555-123-4567"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Nombre de contacto</Label>
              <Input
                value={reservationForm.contactName}
                onChange={(event) => setReservationForm((current) => ({ ...current, contactName: event.target.value }))}
                placeholder="Responsable"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Personas</Label>
              <Input
                value={reservationForm.partySize}
                inputMode="numeric"
                onChange={(event) =>
                  setReservationForm((current) => ({ ...current, partySize: event.target.value.replace(/[^0-9]/g, "") }))
                }
                placeholder="4"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Fecha y hora</Label>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <DatePicker
                  value={scheduledDate || undefined}
                  onChange={handleReservationDateChange}
                  placeholder="Selecciona fecha"
                />
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => handleReservationTimeChange(event.target.value)}
                  disabled={!scheduledDate}
                  className="rounded-2xl"
                  step="900"
                />
              </div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
              <Input
                value={reservationForm.notes}
                onChange={(event) => setReservationForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Indicar pastel sorpresa, etc."
                className="rounded-2xl"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="button" disabled={reservationSaving} onClick={() => void saveReservation()} className="rounded-2xl">
              {reservationSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar reservación
            </Button>
            <Button type="button" variant="outline" onClick={() => setReservationModalOpen(false)} className="rounded-2xl">
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
