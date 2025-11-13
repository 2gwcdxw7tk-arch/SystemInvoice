"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { Combobox } from "@/components/ui/combobox";

const ALLOWED_TABS = ["unidades", "alertas", "notificaciones"] as const;
type TabKey = (typeof ALLOWED_TABS)[number];

interface UnitRow {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
}

interface UnitFormState {
  code: string;
  name: string;
}

interface AlertRow {
  id: number;
  name: string;
  description: string | null;
  threshold: number;
  unitCode: string | null;
  notifyChannel: string | null;
  isActive: boolean;
  updatedAt?: string;
}

interface AlertFormState {
  name: string;
  description: string;
  threshold: string;
  unitCode: string | null;
  notifyChannel: string;
  isActive: boolean;
}

interface ChannelRow {
  id: number;
  name: string;
  channelType: string;
  target: string;
  preferences: string | null;
  isActive: boolean;
  updatedAt?: string;
}

interface ChannelFormState {
  name: string;
  channelType: string;
  target: string;
  preferences: string;
  isActive: boolean;
}

const CHANNEL_TYPE_OPTIONS = [
  { value: "EMAIL", label: "Correo electrónico" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "SLACK", label: "Slack / Chat" },
] as const;

const EMPTY_UNIT_FORM: UnitFormState = { code: "", name: "" };
const EMPTY_ALERT_FORM: AlertFormState = { name: "", description: "", threshold: "", unitCode: null, notifyChannel: "", isActive: true };
const EMPTY_CHANNEL_FORM: ChannelFormState = { name: "", channelType: CHANNEL_TYPE_OPTIONS[0].value, target: "", preferences: "", isActive: true };

function sanitizeNumeric(value: string) {
  return value.replace(/[^0-9.,]/g, "");
}

function parseThreshold(value: string) {
  if (!value) return Number.NaN;
  const normalized = value.replace(/\s+/g, "").replace(/,/g, ".");
  return Number(normalized);
}

export default function PreferenciasPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("unidades");

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitForm, setUnitForm] = useState<UnitFormState>(EMPTY_UNIT_FORM);
  const [editingUnitCode, setEditingUnitCode] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertForm, setAlertForm] = useState<AlertFormState>(EMPTY_ALERT_FORM);
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null);

  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelForm, setChannelForm] = useState<ChannelFormState>(EMPTY_CHANNEL_FORM);
  const [editingChannelId, setEditingChannelId] = useState<number | null>(null);

  const unitsRequestedRef = useRef(false);
  const alertsRequestedRef = useRef(false);
  const channelsRequestedRef = useRef(false);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (ALLOWED_TABS.includes(hash as TabKey)) {
        setActiveTab(hash as TabKey);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      if (tab === "unidades") {
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        window.history.replaceState(null, "", `${window.location.pathname}#${tab}`);
      }
    }
  };

  const loadUnits = useCallback(async (force = false) => {
    if (unitsRequestedRef.current && !force) return;
    unitsRequestedRef.current = true;
    setUnitsLoading(true);
    try {
      const res = await fetch("/api/unidades");
      if (!res.ok) throw new Error("No se pudieron cargar las unidades");
      const data = (await res.json()) as { items?: UnitRow[] };
      setUnits(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      unitsRequestedRef.current = false;
      const message = error instanceof Error ? error.message : "No se pudieron cargar las unidades";
      toast({ variant: "error", title: "Unidades", description: message });
      setUnits([]);
    } finally {
      setUnitsLoading(false);
    }
  }, [toast]);

  const loadAlerts = useCallback(async (force = false) => {
    if (alertsRequestedRef.current && !force) return;
    alertsRequestedRef.current = true;
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/preferencias/alertas");
      if (!res.ok) throw new Error("No se pudieron cargar las alertas");
      const data = (await res.json()) as { items?: AlertRow[] };
      setAlerts(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      alertsRequestedRef.current = false;
      const message = error instanceof Error ? error.message : "No se pudieron cargar las alertas";
      toast({ variant: "error", title: "Alertas", description: message });
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, [toast]);

  const loadChannels = useCallback(async (force = false) => {
    if (channelsRequestedRef.current && !force) return;
    channelsRequestedRef.current = true;
    setChannelsLoading(true);
    try {
      const res = await fetch("/api/preferencias/notificaciones");
      if (!res.ok) throw new Error("No se pudieron cargar los canales");
      const data = (await res.json()) as { items?: ChannelRow[] };
      setChannels(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      channelsRequestedRef.current = false;
      const message = error instanceof Error ? error.message : "No se pudieron cargar los canales";
      toast({ variant: "error", title: "Notificaciones", description: message });
      setChannels([]);
    } finally {
      setChannelsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadUnits(true);
  }, [loadUnits]);

  useEffect(() => {
    if (activeTab === "alertas") {
      void loadAlerts();
      void loadChannels();
    }
    if (activeTab === "notificaciones") {
      void loadChannels();
    }
  }, [activeTab, loadAlerts, loadChannels]);

  const unitOptions = useMemo(
    () => units.map((unit) => ({ value: unit.code, label: `${unit.code} · ${unit.name}` })),
    [units]
  );

  const channelTypeOptions = useMemo(
    () => CHANNEL_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    []
  );

  const formatStatus = (isActive: boolean) => (isActive ? "Activo" : "Inactivo");

  async function handleSaveUnit() {
  const code = unitForm.code.trim().toUpperCase();
    const name = unitForm.name.trim();
    if (!code || !name) {
      toast({ variant: "error", title: "Unidades", description: "Captura código y nombre." });
      return;
    }
    setUnitSaving(true);
    try {
      const res = await fetch("/api/unidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, is_active: true }),
      });
      if (!res.ok) throw new Error("No se pudo guardar la unidad");
      toast({ variant: "success", title: "Unidades", description: editingUnitCode ? "Unidad actualizada" : "Unidad creada" });
      setUnitForm(EMPTY_UNIT_FORM);
      setEditingUnitCode(null);
      setUnitModalOpen(false);
      unitsRequestedRef.current = false;
      await loadUnits(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la unidad";
      toast({ variant: "error", title: "Unidades", description: message });
    } finally {
      setUnitSaving(false);
    }
  }

  async function handleDeactivateUnit(unit: UnitRow) {
    if (!confirm(`¿Eliminar la unidad ${unit.code}?`)) return;
    try {
      const res = await fetch("/api/unidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: unit.code, name: unit.name, is_active: false }),
      });
      if (!res.ok) throw new Error("No se pudo eliminar la unidad");
      toast({ variant: "success", title: "Unidades", description: "Unidad eliminada" });
      unitsRequestedRef.current = false;
      await loadUnits(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la unidad";
      toast({ variant: "error", title: "Unidades", description: message });
    }
  }

  async function handleSaveAlert() {
    const name = alertForm.name.trim();
    const description = alertForm.description.trim();
    const thresholdValue = parseThreshold(alertForm.threshold);
    if (!name || Number.isNaN(thresholdValue)) {
      toast({ variant: "error", title: "Alertas", description: "Nombre y umbral son obligatorios." });
      return;
    }
    setAlertSaving(true);
    try {
      const payload = {
        id: editingAlertId ?? undefined,
        name,
        description: description || null,
        threshold: thresholdValue,
        unitCode: alertForm.unitCode,
        notifyChannel: alertForm.notifyChannel.trim() || null,
        isActive: alertForm.isActive,
      };
      const res = await fetch("/api/preferencias/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("No se pudo guardar la alerta");
      toast({ variant: "success", title: "Alertas", description: editingAlertId ? "Alerta actualizada" : "Alerta creada" });
      setAlertForm(EMPTY_ALERT_FORM);
      setEditingAlertId(null);
      setAlertModalOpen(false);
      alertsRequestedRef.current = false;
      await loadAlerts(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la alerta";
      toast({ variant: "error", title: "Alertas", description: message });
    } finally {
      setAlertSaving(false);
    }
  }

  async function handleToggleAlert(alert: AlertRow) {
    try {
      const res = await fetch("/api/preferencias/alertas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.id, isActive: !alert.isActive }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar el estado");
      toast({ variant: "success", title: "Alertas", description: "Estado actualizado" });
      alertsRequestedRef.current = false;
      await loadAlerts(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el estado";
      toast({ variant: "error", title: "Alertas", description: message });
    }
  }

  async function handleSaveChannel() {
    const name = channelForm.name.trim();
    const target = channelForm.target.trim();
    if (!name || !target) {
      toast({ variant: "error", title: "Notificaciones", description: "Nombre y destino son obligatorios." });
      return;
    }
    setChannelSaving(true);
    try {
      const payload = {
        id: editingChannelId ?? undefined,
        name,
        channelType: channelForm.channelType,
        target,
        preferences: channelForm.preferences.trim() || null,
        isActive: channelForm.isActive,
      };
      const res = await fetch("/api/preferencias/notificaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("No se pudo guardar el canal");
      toast({ variant: "success", title: "Notificaciones", description: editingChannelId ? "Canal actualizado" : "Canal creado" });
      setChannelForm(EMPTY_CHANNEL_FORM);
      setEditingChannelId(null);
      setChannelModalOpen(false);
      channelsRequestedRef.current = false;
      await loadChannels(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el canal";
      toast({ variant: "error", title: "Notificaciones", description: message });
    } finally {
      setChannelSaving(false);
    }
  }

  async function handleToggleChannel(channel: ChannelRow) {
    try {
      const res = await fetch("/api/preferencias/notificaciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: channel.id, isActive: !channel.isActive }),
      });
      if (!res.ok) throw new Error("No se pudo actualizar el estado");
      toast({ variant: "success", title: "Notificaciones", description: "Estado actualizado" });
      channelsRequestedRef.current = false;
      await loadChannels(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el estado";
      toast({ variant: "error", title: "Notificaciones", description: message });
    }
  }

  const renderUnits = () => (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">Catálogo de unidades</CardTitle>
            <CardDescription>Define las unidades disponibles para captura y facturación.</CardDescription>
          </div>
          <Button
            type="button"
            className="rounded-2xl"
            onClick={() => {
              setUnitForm(EMPTY_UNIT_FORM);
              setEditingUnitCode(null);
              setUnitModalOpen(true);
            }}
          >
            Nueva unidad
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {unitsLoading ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Cargando unidades...
                  </td>
                </tr>
              ) : units.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No hay unidades registradas.
                  </td>
                </tr>
              ) : (
                units.map((unit) => (
                  <tr key={unit.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs">{unit.code}</td>
                    <td className="px-3 py-2">{unit.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => {
                            setEditingUnitCode(unit.code);
                            setUnitForm({ code: unit.code, name: unit.name });
                            setUnitModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => void handleDeactivateUnit(unit)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={() => void loadUnits(true)}>
            Refrescar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderAlerts = () => (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">Alertas de inventario</CardTitle>
            <CardDescription>Define umbrales mínimos y canales para notificar al equipo.</CardDescription>
          </div>
          <Button
            type="button"
            className="rounded-2xl"
            onClick={() => {
              setAlertForm(EMPTY_ALERT_FORM);
              setEditingAlertId(null);
              setAlertModalOpen(true);
            }}
          >
            Nueva alerta
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Umbral</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2">Canal</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {alertsLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Cargando alertas...
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No hay alertas configuradas.
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{alert.name}</span>
                        {alert.description ? <span className="text-xs text-muted-foreground">{alert.description}</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">{new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(alert.threshold)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{alert.unitCode ?? "—"}</td>
                    <td className="px-3 py-2">{alert.notifyChannel ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        alert.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                      }`}
                      >
                        {formatStatus(alert.isActive)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => {
                            setEditingAlertId(alert.id);
                            setAlertForm({
                              name: alert.name,
                              description: alert.description ?? "",
                              threshold: alert.threshold.toString(),
                              unitCode: alert.unitCode,
                              notifyChannel: alert.notifyChannel ?? "",
                              isActive: alert.isActive,
                            });
                            setAlertModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={alert.isActive ? "destructive" : "secondary"}
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => void handleToggleAlert(alert)}
                        >
                          {alert.isActive ? "Suspender" : "Activar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={() => void loadAlerts(true)}>
            Refrescar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderChannels = () => (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">Canales de notificación</CardTitle>
            <CardDescription>Controla a quién se envían avisos y por qué medio.</CardDescription>
          </div>
          <Button
            type="button"
            className="rounded-2xl"
            onClick={() => {
              setChannelForm(EMPTY_CHANNEL_FORM);
              setEditingChannelId(null);
              setChannelModalOpen(true);
            }}
          >
            Nuevo canal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-left text-sm">
            <thead className="border-b text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Preferencias</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {channelsLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Cargando canales...
                  </td>
                </tr>
              ) : channels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No hay canales configurados.
                  </td>
                </tr>
              ) : (
                channels.map((channel) => (
                  <tr key={channel.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2">{channel.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{channel.channelType}</td>
                    <td className="px-3 py-2">{channel.target}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{channel.preferences ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        channel.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                      }`}
                      >
                        {formatStatus(channel.isActive)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => {
                            setEditingChannelId(channel.id);
                            setChannelForm({
                              name: channel.name,
                              channelType: channel.channelType,
                              target: channel.target,
                              preferences: channel.preferences ?? "",
                              isActive: channel.isActive,
                            });
                            setChannelModalOpen(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={channel.isActive ? "destructive" : "secondary"}
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={() => void handleToggleChannel(channel)}
                        >
                          {channel.isActive ? "Suspender" : "Activar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={() => void loadChannels(true)}>
            Refrescar
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <section className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Preferencias</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Centraliza catálogos auxiliares para facilitar la configuración del sistema.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant={activeTab === "unidades" ? "default" : "outline"} className="rounded-2xl" onClick={() => handleTabChange("unidades")}>
          Unidades
        </Button>
        <Button type="button" variant={activeTab === "alertas" ? "default" : "outline"} className="rounded-2xl" onClick={() => handleTabChange("alertas")}>
          Alertas de insumos
        </Button>
        <Button type="button" variant={activeTab === "notificaciones" ? "default" : "outline"} className="rounded-2xl" onClick={() => handleTabChange("notificaciones")}>
          Notificaciones
        </Button>
      </div>

      {activeTab === "unidades" ? renderUnits() : null}
      {activeTab === "alertas" ? renderAlerts() : null}
      {activeTab === "notificaciones" ? renderChannels() : null}

      <Modal
        open={unitModalOpen}
        onClose={() => {
          setUnitModalOpen(false);
          setUnitForm(EMPTY_UNIT_FORM);
          setEditingUnitCode(null);
        }}
        title={editingUnitCode ? `Editar unidad (${editingUnitCode})` : "Nueva unidad"}
        contentClassName="max-w-md"
      >
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Código</Label>
            <Input
              value={unitForm.code}
              onChange={(event) => setUnitForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
              placeholder="UND"
              maxLength={20}
              disabled={!!editingUnitCode}
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
            <Input
              value={unitForm.name}
              onChange={(event) => setUnitForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Unidad"
              maxLength={60}
              className="rounded-2xl"
            />
          </div>
          <div className="flex gap-3">
            <Button type="button" className="rounded-2xl" disabled={unitSaving} onClick={() => void handleSaveUnit()}>
              {unitSaving ? "Guardando..." : editingUnitCode ? "Actualizar" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                setUnitModalOpen(false);
                setUnitForm(EMPTY_UNIT_FORM);
                setEditingUnitCode(null);
              }}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={alertModalOpen}
        onClose={() => {
          setAlertModalOpen(false);
          setAlertForm(EMPTY_ALERT_FORM);
          setEditingAlertId(null);
        }}
        title={editingAlertId ? "Editar alerta" : "Nueva alerta"}
        description="Define nombre, umbral y canal opcional para notificar cuando el inventario baje del límite."
        contentClassName="max-w-2xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
            <Input
              value={alertForm.name}
              onChange={(event) => setAlertForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Ingredientes críticos"
              maxLength={80}
              className="rounded-2xl"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Descripción</Label>
            <Input
              value={alertForm.description}
              onChange={(event) => setAlertForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Notificar cuando quede menos de 5 kg"
              maxLength={200}
              className="rounded-2xl"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Umbral mínimo</Label>
            <Input
              value={alertForm.threshold}
              onChange={(event) => setAlertForm((prev) => ({ ...prev, threshold: sanitizeNumeric(event.target.value) }))}
              inputMode="decimal"
              placeholder="5"
              className="rounded-2xl"
            />
          </div>
          <div className="grid gap-1">
            <Combobox
              value={alertForm.unitCode}
              onChange={(value) => setAlertForm((prev) => ({ ...prev, unitCode: value }))}
              options={unitOptions}
              placeholder="Unidad opcional"
              label="Unidad"
              className="rounded-2xl"
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="ghost" className="h-8 rounded-xl px-3 text-xs" onClick={() => setAlertForm((prev) => ({ ...prev, unitCode: null }))}>
                Limpiar selección
              </Button>
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Canal</Label>
            <Input
              value={alertForm.notifyChannel}
              onChange={(event) => setAlertForm((prev) => ({ ...prev, notifyChannel: event.target.value }))}
              placeholder="Correo cocina"
              maxLength={200}
              className="rounded-2xl"
            />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">Estado</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-xl px-3 text-xs"
              onClick={() => setAlertForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
            >
              {alertForm.isActive ? "Activo" : "Inactivo"}
            </Button>
          </div>
          <div className="flex gap-3">
            <Button type="button" className="rounded-2xl" disabled={alertSaving} onClick={() => void handleSaveAlert()}>
              {alertSaving ? "Guardando..." : editingAlertId ? "Actualizar" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                setAlertModalOpen(false);
                setAlertForm(EMPTY_ALERT_FORM);
                setEditingAlertId(null);
              }}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={channelModalOpen}
        onClose={() => {
          setChannelModalOpen(false);
          setChannelForm(EMPTY_CHANNEL_FORM);
          setEditingChannelId(null);
        }}
        title={editingChannelId ? "Editar canal" : "Nuevo canal"}
        description="Gestiona los destinatarios y medios por los que saldrán las alertas."
        contentClassName="max-w-2xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
            <Input
              value={channelForm.name}
              onChange={(event) => setChannelForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Correo gerencia"
              maxLength={80}
              className="rounded-2xl"
            />
          </div>
          <div className="grid gap-1">
            <Combobox
              value={channelForm.channelType}
              onChange={(value) => setChannelForm((prev) => ({ ...prev, channelType: value }))}
              options={channelTypeOptions}
              placeholder="Tipo de canal"
              label="Tipo"
              className="rounded-2xl"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Destino</Label>
            <Input
              value={channelForm.target}
              onChange={(event) => setChannelForm((prev) => ({ ...prev, target: event.target.value }))}
              placeholder="usuario@dominio.com"
              maxLength={200}
              className="rounded-2xl"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs uppercase text-muted-foreground">Preferencias</Label>
            <textarea
              value={channelForm.preferences}
              onChange={(event) => setChannelForm((prev) => ({ ...prev, preferences: event.target.value }))}
              placeholder="Resúmenes diarios, solo alertas críticas"
              maxLength={500}
              className="min-h-[100px] w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">Estado</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-xl px-3 text-xs"
              onClick={() => setChannelForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
            >
              {channelForm.isActive ? "Activo" : "Inactivo"}
            </Button>
          </div>
          <div className="flex gap-3">
            <Button type="button" className="rounded-2xl" disabled={channelSaving} onClick={() => void handleSaveChannel()}>
              {channelSaving ? "Guardando..." : editingChannelId ? "Actualizar" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                setChannelModalOpen(false);
                setChannelForm(EMPTY_CHANNEL_FORM);
                setEditingChannelId(null);
              }}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
