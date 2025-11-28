import "server-only";

import { env } from "@/lib/env";
import { assertRestaurantFeatureEnabled } from "@/lib/features/guards";
import { prisma } from "@/lib/db/prisma";
import type { OrderLine, OrderStatus } from "@/lib/orders/types";
import { TableZoneRepository } from "@/lib/repositories/TableZoneRepository";
import type { TableZoneRow } from "@/lib/repositories/ITableZoneRepository";

export type TableReservationSnapshot = {
  status: "holding" | "seated";
  reserved_by: string;
  contact_name: string | null;
  contact_phone: string | null;
  party_size: number | null;
  notes: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string;
};

export type TableZone = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

export type WaiterTableSnapshot = {
  id: string;
  label: string;
  zone_id: string | null;
  zone: string | null;
  capacity: number | null;
  assigned_waiter_id: number | null;
  assigned_waiter_name: string | null;
  updated_at: string | null;
  reservation: TableReservationSnapshot | null;
  order: {
    status: OrderStatus;
    pending_items: OrderLine[];
    sent_items: OrderLine[];
  } | null;
};

export type TableDefinition = {
  id: string;
  label: string;
  zone_id: string | null;
  zone: string | null;
  capacity: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
};

export type TableAdminSnapshot = TableDefinition & {
  assigned_waiter_id: number | null;
  assigned_waiter_name: string | null;
  updated_state_at: string | null;
  order_status: OrderStatus | "libre";
  pending_items_count: number;
  sent_items_count: number;
  reservation: TableReservationSnapshot | null;
  order: {
    status: OrderStatus;
    pending_items: OrderLine[];
    sent_items: OrderLine[];
  } | null;
};

type TableReservationRecord = {
  status: "holding" | "seated";
  reservedBy: string;
  contactName: string | null;
  contactPhone: string | null;
  partySize: number | null;
  notes: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
};

type TableOrderState = {
  assignedWaiterId: number | null;
  assignedWaiterName: string | null;
  status: OrderStatus;
  pendingItems: OrderLine[];
  sentItems: OrderLine[];
  reservation: TableReservationRecord | null;
  updatedAt: string | null;
};

type TableDefinitionRecord = {
  id: string;
  label: string;
  zoneId: string | null;
  zoneName: string | null;
  capacity: number | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string | null;
};

// -----------------------
// Helpers
// -----------------------
function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseOrderLines(raw: string | null | undefined): OrderLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: OrderLine[] = [];
    for (const item of parsed) {
      const articleCode = typeof item?.articleCode === "string" ? item.articleCode : "";
      const name = typeof item?.name === "string" ? item.name : "";
      const quantity = Number(item?.quantity);
      if (!articleCode || !Number.isFinite(quantity)) continue;
      const priceVal = item?.unitPrice;
      const unitPrice = priceVal === null || priceVal === undefined ? null : Number(priceVal);
      const notes = typeof item?.notes === "string" ? item.notes : undefined;
      out.push({ articleCode, name, quantity, unitPrice: unitPrice === null || Number.isFinite(unitPrice) ? unitPrice : null, notes });
    }
    return out;
  } catch {
    return [];
  }
}

function serializeOrderLines(lines: OrderLine[]): string {
  const sanitized: OrderLine[] = [];
  for (const line of lines) {
    const articleCode = typeof line.articleCode === "string" ? line.articleCode : String(line.articleCode ?? "");
    const name = typeof line.name === "string" ? line.name : "";
    const quantity = Number(line.quantity);
    if (!articleCode || !Number.isFinite(quantity)) continue;
    const unitPrice = line.unitPrice === null || line.unitPrice === undefined ? null : Number(line.unitPrice);
    const notes = typeof line.notes === "string" && line.notes.length > 0 ? line.notes : undefined;
    sanitized.push({ articleCode, name, quantity, unitPrice: unitPrice === null || Number.isFinite(unitPrice) ? unitPrice : null, notes });
  }
  return JSON.stringify(sanitized);
}

function toReservationSnapshot(rec: TableReservationRecord | null): TableReservationSnapshot | null {
  if (!rec) return null;
  return {
    status: rec.status,
    reserved_by: rec.reservedBy,
    contact_name: rec.contactName,
    contact_phone: rec.contactPhone,
    party_size: rec.partySize,
    notes: rec.notes,
    scheduled_for: rec.scheduledFor,
    created_at: rec.createdAt,
    updated_at: rec.updatedAt,
  };
}

function composeAdminSnapshot(def: TableDefinitionRecord, st: TableOrderState | null): TableAdminSnapshot {
  const pending = st ? st.pendingItems.reduce((s, l) => s + Number(l.quantity || 0), 0) : 0;
  const sent = st ? st.sentItems.reduce((s, l) => s + Number(l.quantity || 0), 0) : 0;
  const hasMovement = pending + sent > 0 || !!st?.assignedWaiterId;
  const orderStatus: OrderStatus | "libre" = st
    ? st.status === "normal"
      ? hasMovement
        ? "normal"
        : "libre"
      : hasMovement
      ? st.status
      : "libre"
    : "libre";

  return {
    id: def.id,
    label: def.label,
    zone_id: def.zoneId,
    zone: def.zoneName,
    capacity: def.capacity,
    is_active: def.isActive,
    sort_order: def.sortOrder,
    created_at: def.createdAt,
    updated_at: def.updatedAt,
    assigned_waiter_id: st?.assignedWaiterId ?? null,
    assigned_waiter_name: st?.assignedWaiterName ?? null,
    updated_state_at: st?.updatedAt ?? null,
    order_status: orderStatus,
    pending_items_count: pending,
    sent_items_count: sent,
    reservation: toReservationSnapshot(st?.reservation ?? null),
    order: st
      ? {
          status: st.status,
          pending_items: [...st.pendingItems],
          sent_items: [...st.sentItems],
        }
      : null,
  };
}

function toWaiterSnapshot(def: TableDefinitionRecord, st: TableOrderState | null): WaiterTableSnapshot {
  const hasVisibleOrder = !!st && (st.pendingItems.length > 0 || st.sentItems.length > 0 || st.assignedWaiterId !== null);
  return {
    id: def.id,
    label: def.label,
    zone_id: def.zoneId,
    zone: def.zoneName,
    capacity: def.capacity,
    assigned_waiter_id: st?.assignedWaiterId ?? null,
    assigned_waiter_name: st?.assignedWaiterName ?? null,
    updated_at: st?.updatedAt ?? null,
    reservation: toReservationSnapshot(st?.reservation ?? null),
    order: hasVisibleOrder && st
      ? {
          status: st.status,
          pending_items: [...st.pendingItems],
          sent_items: [...st.sentItems],
        }
      : null,
  };
}

function isTableStateAvailable(st?: TableOrderState | null): boolean {
  if (!st) return true;
  if (st.reservation) return false;
  if (st.assignedWaiterId !== null) return false;
  if (st.pendingItems.length > 0) return false;
  if (st.status === "normal" && st.sentItems.length > 0) return false;
  return true;
}

// -----------------------
// MOCK STORE
// -----------------------
type TableZoneRecord = { id: string; name: string; isActive: boolean; sortOrder: number; createdAt: string; updatedAt: string | null };
const mockZoneCatalog = new Map<string, TableZoneRecord>();
type MockTableRecord = TableDefinitionRecord;
const mockTableCatalog = new Map<string, MockTableRecord>();
const mockTableState = new Map<string, TableOrderState>();

function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}
function normalizeZoneId(nameOrId: string): string {
  return nameOrId
    .normalize("NFD")
    .replace(/[^\p{ASCII}]/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-");
}

function ensureZoneSeed(): void {
  if (!env.useMockData || mockZoneCatalog.size > 0) return;
  const now = new Date().toISOString();
  const seeds: Array<Omit<TableZoneRecord, "createdAt" | "updatedAt">> = [
    { id: "SALON-A", name: "Salón A", isActive: true, sortOrder: 1 },
    { id: "TERRAZA", name: "Terraza", isActive: true, sortOrder: 2 },
    { id: "BARRA", name: "Barra", isActive: true, sortOrder: 3 },
    { id: "VIP", name: "VIP", isActive: true, sortOrder: 4 },
  ];
  for (const s of seeds) mockZoneCatalog.set(s.id, { ...s, createdAt: now, updatedAt: now });
}

function getZoneName(zoneId: string | null): string | null {
  if (!zoneId) return null;
  ensureZoneSeed();
  return mockZoneCatalog.get(zoneId)?.name ?? null;
}

function ensureTableSeed(): void {
  if (!env.useMockData || mockTableCatalog.size > 0) return;
  ensureZoneSeed();
  const now = new Date().toISOString();
  const seeds: Array<Omit<TableDefinitionRecord, "createdAt" | "updatedAt">> = [
    { id: "T-01", label: "Mesa 1", zoneId: "SALON-A", zoneName: getZoneName("SALON-A"), capacity: 4, isActive: true, sortOrder: 1 },
    { id: "T-02", label: "Mesa 2", zoneId: "SALON-A", zoneName: getZoneName("SALON-A"), capacity: 4, isActive: true, sortOrder: 2 },
    { id: "T-03", label: "Mesa 3", zoneId: "SALON-A", zoneName: getZoneName("SALON-A"), capacity: 6, isActive: true, sortOrder: 3 },
  ];
  for (const s of seeds) mockTableCatalog.set(s.id, { ...s, createdAt: now, updatedAt: now });
  if (mockTableState.size === 0) {
    mockTableState.set("T-01", {
      assignedWaiterId: 101,
      assignedWaiterName: "Mesero Demo",
      status: "normal",
      pendingItems: [{ articleCode: "TAC-001", name: "Taco de arrachera", unitPrice: 42, quantity: 1 }],
      sentItems: [],
      reservation: null,
      updatedAt: now,
    });
  }
}

// -----------------------
// Prisma mappers
// -----------------------
async function fetchDefinitions(includeInactive: boolean): Promise<Array<{ def: TableDefinitionRecord; st: TableOrderState | null }>> {
  const rows = await prisma.tables.findMany({
    where: includeInactive ? {} : { is_active: true },
    include: {
      table_zones: { select: { name: true } },
      table_state: true,
      table_reservations: true,
    },
    orderBy: [{ sort_order: "asc" }, { label: "asc" }],
  });

  return rows.map((row) => {
    const def: TableDefinitionRecord = {
      id: row.id,
      label: row.label,
      zoneId: row.zone_id ?? null,
      zoneName: row.table_zones?.name ?? null,
      capacity: row.capacity ?? null,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
      updatedAt: toIsoString(row.updated_at),
    };
    const stRow = row.table_state;
    const resRow = row.table_reservations;
    const st: TableOrderState | null = stRow || resRow
      ? {
          assignedWaiterId: stRow?.assigned_waiter_id ?? null,
          assignedWaiterName: stRow?.assigned_waiter_name ?? null,
          status: ((stRow?.status as OrderStatus) ?? "normal") as OrderStatus,
          pendingItems: parseOrderLines(stRow?.pending_items ?? null),
          sentItems: parseOrderLines(stRow?.sent_items ?? null),
          reservation: resRow
            ? {
              status: (resRow.status === "seated" ? "seated" : "holding") as "seated" | "holding",
                reservedBy: resRow.reserved_by,
                contactName: resRow.contact_name ?? null,
                contactPhone: resRow.contact_phone ?? null,
                partySize: resRow.party_size ?? null,
                notes: resRow.notes ?? null,
                scheduledFor: resRow.scheduled_for ?? null,
                createdAt: toIsoString(resRow.created_at) ?? new Date().toISOString(),
                updatedAt: toIsoString(resRow.updated_at) ?? toIsoString(resRow.created_at) ?? new Date().toISOString(),
              }
            : null,
          updatedAt: toIsoString(stRow?.updated_at) ?? null,
        }
      : null;
    return { def, st };
  });
}

async function fetchOneDefinition(tableId: string): Promise<{ def: TableDefinitionRecord; st: TableOrderState | null } | null> {
  const row = await prisma.tables.findUnique({
    where: { id: tableId },
    include: {
      table_zones: { select: { name: true } },
      table_state: true,
      table_reservations: true,
    },
  });
  if (!row) return null;
  const def: TableDefinitionRecord = {
    id: row.id,
    label: row.label,
    zoneId: row.zone_id ?? null,
    zoneName: row.table_zones?.name ?? null,
    capacity: row.capacity ?? null,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at),
  };
  const stRow = row.table_state;
  const resRow = row.table_reservations;
  const st: TableOrderState | null = stRow || resRow
    ? {
        assignedWaiterId: stRow?.assigned_waiter_id ?? null,
        assignedWaiterName: stRow?.assigned_waiter_name ?? null,
        status: ((stRow?.status as OrderStatus) ?? "normal") as OrderStatus,
        pendingItems: parseOrderLines(stRow?.pending_items ?? null),
        sentItems: parseOrderLines(stRow?.sent_items ?? null),
        reservation: resRow
            ? {
              status: (resRow.status === "seated" ? "seated" : "holding") as "seated" | "holding",
              reservedBy: resRow.reserved_by,
              contactName: resRow.contact_name ?? null,
              contactPhone: resRow.contact_phone ?? null,
              partySize: resRow.party_size ?? null,
              notes: resRow.notes ?? null,
              scheduledFor: resRow.scheduled_for ?? null,
              createdAt: toIsoString(resRow.created_at) ?? new Date().toISOString(),
              updatedAt: toIsoString(resRow.updated_at) ?? toIsoString(resRow.created_at) ?? new Date().toISOString(),
            }
          : null,
        updatedAt: toIsoString(stRow?.updated_at) ?? null,
      }
    : null;
  return { def, st };
}

// -----------------------
// Public API (Service)
// -----------------------

export async function listWaiterTables(): Promise<WaiterTableSnapshot[]> {
  assertRestaurantFeatureEnabled();
  if (env.useMockData) {
    ensureTableSeed();
    return Array.from(mockTableCatalog.values())
      .filter((r) => r.isActive)
      .map((r) => toWaiterSnapshot(r, mockTableState.get(r.id) ?? null));
  }
  const rows = await fetchDefinitions(false);
  return rows.map(({ def, st }) => toWaiterSnapshot(def, st));
}

export async function getWaiterTable(tableId: string): Promise<WaiterTableSnapshot | null> {
  assertRestaurantFeatureEnabled();
  if (env.useMockData) {
    ensureTableSeed();
    const rec = mockTableCatalog.get(normalizeId(tableId));
    if (!rec) return null;
    return toWaiterSnapshot(rec, mockTableState.get(rec.id) ?? null);
  }
  const row = await fetchOneDefinition(normalizeId(tableId));
  if (!row) return null;
  return toWaiterSnapshot(row.def, row.st);
}

export async function claimWaiterTable(params: { tableId: string; waiterId: number; waiterName: string }): Promise<WaiterTableSnapshot> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(params.tableId);
  if (env.useMockData) {
    ensureTableSeed();
    const def = mockTableCatalog.get(id);
    if (!def) throw new Error("Mesa no encontrada");
    if (!def.isActive) throw new Error("La mesa está inactiva");
    const current = mockTableState.get(id) ?? null;
    if (current && current.assignedWaiterId && current.assignedWaiterId !== params.waiterId && current.status === "normal") {
      throw new Error("La mesa está asignada a otro mesero");
    }
    const now = new Date().toISOString();
    const nextStatus: OrderStatus = current && (current.status === "facturado" || current.status === "anulado") ? "normal" : current?.status ?? "normal";
    const reservation = current?.reservation ? { ...current.reservation, status: "seated" as const, updatedAt: now } : null;
    const next: TableOrderState = {
      assignedWaiterId: params.waiterId,
      assignedWaiterName: params.waiterName,
      status: nextStatus,
      pendingItems: current ? [...current.pendingItems] : [],
      sentItems: current ? [...current.sentItems] : [],
      reservation,
      updatedAt: now,
    };
    mockTableState.set(id, next);
    return toWaiterSnapshot(def, next);
  }

  const row = await fetchOneDefinition(id);
  if (!row) throw new Error("Mesa no encontrada");
  if (!row.def.isActive) throw new Error("La mesa está inactiva");
  const state = row.st;
  if (state && state.assignedWaiterId && state.assignedWaiterId !== params.waiterId && state.status === "normal") {
    throw new Error("La mesa está asignada a otro mesero");
  }
  const nextStatus: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
  const pending = serializeOrderLines(state?.pendingItems ?? []);
  const sent = serializeOrderLines(state?.sentItems ?? []);
  await prisma.$transaction(async (tx) => {
    await tx.table_state.upsert({
      where: { table_id: id },
      update: {
        assigned_waiter_id: params.waiterId,
        assigned_waiter_name: params.waiterName,
        status: nextStatus,
        pending_items: pending,
        sent_items: sent,
        updated_at: new Date(),
      },
      create: {
        table_id: id,
        assigned_waiter_id: params.waiterId,
        assigned_waiter_name: params.waiterName,
        status: nextStatus,
        pending_items: pending,
        sent_items: sent,
        updated_at: new Date(),
      },
    });
    if (state?.reservation) {
      await tx.table_reservations.update({ where: { table_id: id }, data: { status: "seated", updated_at: new Date() } });
    }
  });
  const updated = await fetchOneDefinition(id);
  if (!updated) throw new Error("Mesa no encontrada");
  return toWaiterSnapshot(updated.def, updated.st);
}

export async function storeWaiterTableOrder(params: {
  tableId: string;
  waiterId: number;
  waiterName: string;
  pendingItems: OrderLine[];
  sentItems: OrderLine[];
}): Promise<WaiterTableSnapshot> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(params.tableId);
  if (env.useMockData) {
    ensureTableSeed();
    const def = mockTableCatalog.get(id);
    if (!def) throw new Error("Mesa no encontrada");
    if (!def.isActive) throw new Error("La mesa está inactiva");
    const current = mockTableState.get(id) ?? null;
    if (current && current.assignedWaiterId && current.assignedWaiterId !== params.waiterId && current.status === "normal") {
      throw new Error("La mesa está asignada a otro mesero");
    }
    const now = new Date().toISOString();
    const nextStatus: OrderStatus = current && (current.status === "facturado" || current.status === "anulado") ? "normal" : current?.status ?? "normal";
    const next: TableOrderState = {
      assignedWaiterId: params.waiterId,
      assignedWaiterName: params.waiterName,
      status: nextStatus,
      pendingItems: [...params.pendingItems],
      sentItems: [...params.sentItems],
      reservation: current?.reservation ? { ...current.reservation } : null,
      updatedAt: now,
    };
    mockTableState.set(id, next);
    return toWaiterSnapshot(def, next);
  }

  const row = await fetchOneDefinition(id);
  if (!row) throw new Error("Mesa no encontrada");
  if (!row.def.isActive) throw new Error("La mesa está inactiva");
  const state = row.st;
  if (state && state.assignedWaiterId && state.assignedWaiterId !== params.waiterId && state.status === "normal") {
    throw new Error("La mesa está asignada a otro mesero");
  }
  const nextStatus: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
  await prisma.table_state.upsert({
    where: { table_id: id },
    update: {
      assigned_waiter_id: params.waiterId,
      assigned_waiter_name: params.waiterName,
      status: nextStatus,
      pending_items: serializeOrderLines(params.pendingItems),
      sent_items: serializeOrderLines(params.sentItems),
      updated_at: new Date(),
    },
    create: {
      table_id: id,
      assigned_waiter_id: params.waiterId,
      assigned_waiter_name: params.waiterName,
      status: nextStatus,
      pending_items: serializeOrderLines(params.pendingItems),
      sent_items: serializeOrderLines(params.sentItems),
      updated_at: new Date(),
    },
  });
  const updated = await fetchOneDefinition(id);
  if (!updated) throw new Error("Mesa no encontrada");
  return toWaiterSnapshot(updated.def, updated.st);
}

export async function listTableDefinitions(): Promise<TableDefinition[]> {
  assertRestaurantFeatureEnabled();
  if (env.useMockData) {
    ensureTableSeed();
    return Array.from(mockTableCatalog.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((r) => ({
        id: r.id,
        label: r.label,
        zone_id: r.zoneId,
        zone: r.zoneName,
        capacity: r.capacity,
        is_active: r.isActive,
        sort_order: r.sortOrder,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      }));
  }
  const rows = await fetchDefinitions(true);
  return rows.map(({ def }) => ({
    id: def.id,
    label: def.label,
    zone_id: def.zoneId,
    zone: def.zoneName,
    capacity: def.capacity,
    is_active: def.isActive,
    sort_order: def.sortOrder,
    created_at: def.createdAt,
    updated_at: def.updatedAt,
  }));
}

export async function getTableAdminSnapshot(tableId: string): Promise<TableAdminSnapshot | null> {
  assertRestaurantFeatureEnabled();
  if (env.useMockData) {
    ensureTableSeed();
    const rec = mockTableCatalog.get(normalizeId(tableId));
    if (!rec) return null;
    return composeAdminSnapshot(rec, mockTableState.get(rec.id) ?? null);
  }
  const row = await fetchOneDefinition(normalizeId(tableId));
  if (!row) return null;
  return composeAdminSnapshot(row.def, row.st);
}

export async function listTableAdminSnapshots(): Promise<TableAdminSnapshot[]> {
  assertRestaurantFeatureEnabled();
  if (env.useMockData) {
    ensureTableSeed();
    return Array.from(mockTableCatalog.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((r) => composeAdminSnapshot(r, mockTableState.get(r.id) ?? null));
  }
  const rows = await fetchDefinitions(true);
  return rows.map(({ def, st }) => composeAdminSnapshot(def, st));
}

export async function createTableDefinition(input: {
  id: string;
  label: string;
  zoneId: string | null;
  capacity: number | null;
  isActive?: boolean;
}): Promise<TableDefinition> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(input.id);
  if (env.useMockData) {
    ensureTableSeed();
    if (mockTableCatalog.has(id)) throw new Error("Ya existe una mesa con ese código");
    const zoneId = input.zoneId ? normalizeZoneId(input.zoneId) : null;
    const zoneName = zoneId ? getZoneName(zoneId) : null;
    if (zoneId && !zoneName) throw new Error("La zona seleccionada no existe");
    const now = new Date().toISOString();
    const sortOrder = mockTableCatalog.size + 1;
    const rec: TableDefinitionRecord = {
      id,
      label: input.label.trim(),
      zoneId,
      zoneName,
      capacity: input.capacity ?? null,
      isActive: input.isActive ?? true,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    mockTableCatalog.set(id, rec);
    return {
      id: rec.id,
      label: rec.label,
      zone_id: rec.zoneId,
      zone: rec.zoneName,
      capacity: rec.capacity,
      is_active: rec.isActive,
      sort_order: rec.sortOrder,
      created_at: rec.createdAt,
      updated_at: rec.updatedAt,
    };
  }

  const label = input.label.trim();
  if (!label) throw new Error("El nombre de la mesa es obligatorio");
  const capacity = typeof input.capacity === "number" && Number.isFinite(input.capacity) && input.capacity > 0 ? Math.floor(input.capacity) : null;
  const zoneId = input.zoneId ? normalizeZoneId(input.zoneId) : null;
  const isActive = input.isActive ?? true;
  const duplicate = await prisma.tables.findUnique({ where: { id } });
  if (duplicate) throw new Error("Ya existe una mesa con ese código");
  if (zoneId) {
    const zone = await prisma.table_zones.findUnique({ where: { id: zoneId } });
    if (!zone) throw new Error("La zona seleccionada no existe");
  }
  const max = await prisma.tables.aggregate({ _max: { sort_order: true } });
  const sortOrder = (max._max.sort_order ?? 0) + 1;
  const created = await prisma.tables.create({
    data: { id, label, zone_id: zoneId, capacity, is_active: isActive, sort_order: sortOrder },
  });
  const zone = created.zone_id ? await prisma.table_zones.findUnique({ where: { id: created.zone_id } }) : null;
  return {
    id: created.id,
    label: created.label,
    zone_id: created.zone_id ?? null,
    zone: zone?.name ?? null,
    capacity: created.capacity ?? null,
    is_active: created.is_active,
    sort_order: created.sort_order,
    created_at: toIsoString(created.created_at) ?? new Date().toISOString(),
    updated_at: toIsoString(created.updated_at),
  };
}

export async function updateTableDefinition(tableId: string, patch: {
  label?: string;
  zoneId?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}): Promise<TableDefinition> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(tableId);
  if (env.useMockData) {
    ensureTableSeed();
    const cur = mockTableCatalog.get(id);
    if (!cur) throw new Error("Mesa no encontrada");
    const nextZoneId = patch.zoneId !== undefined ? (patch.zoneId ? normalizeZoneId(patch.zoneId) : null) : cur.zoneId;
    const nextZoneName = nextZoneId ? getZoneName(nextZoneId) : null;
    if (nextZoneId && !nextZoneName) throw new Error("La zona seleccionada no existe");
    const rec: TableDefinitionRecord = {
      ...cur,
      label: patch.label !== undefined ? patch.label.trim() : cur.label,
      zoneId: nextZoneId,
      zoneName: nextZoneName,
      capacity: patch.capacity !== undefined ? patch.capacity : cur.capacity,
      isActive: patch.isActive !== undefined ? patch.isActive : cur.isActive,
      updatedAt: new Date().toISOString(),
    };
    mockTableCatalog.set(id, rec);
    if (!rec.isActive) mockTableState.delete(id);
    return {
      id: rec.id,
      label: rec.label,
      zone_id: rec.zoneId,
      zone: rec.zoneName,
      capacity: rec.capacity,
      is_active: rec.isActive,
      sort_order: rec.sortOrder,
      created_at: rec.createdAt,
      updated_at: rec.updatedAt,
    };
  }

  const current = await prisma.tables.findUnique({ where: { id }, include: { table_zones: true } });
  if (!current) throw new Error("Mesa no encontrada");
  const label = patch.label !== undefined ? patch.label.trim() : current.label;
  if (!label) throw new Error("El nombre de la mesa es obligatorio");
  const zoneId = patch.zoneId !== undefined ? (patch.zoneId ? normalizeZoneId(patch.zoneId) : null) : current.zone_id;
  if (zoneId) {
    const zone = await prisma.table_zones.findUnique({ where: { id: zoneId } });
    if (!zone) throw new Error("La zona seleccionada no existe");
  }
  const capacity =
    patch.capacity !== undefined && patch.capacity !== null && Number.isFinite(patch.capacity)
      ? Math.max(1, Math.floor(patch.capacity))
      : patch.capacity === null
      ? null
      : current.capacity;
  const isActive = patch.isActive !== undefined ? patch.isActive : current.is_active;
  const updated = await prisma.tables.update({
    where: { id },
    data: { label, zone_id: zoneId, capacity, is_active: isActive, updated_at: new Date() },
  });
  if (!isActive) {
    await prisma.table_reservations.deleteMany({ where: { table_id: id } });
    await prisma.table_state.deleteMany({ where: { table_id: id } });
  }
  const zone = updated.zone_id ? await prisma.table_zones.findUnique({ where: { id: updated.zone_id } }) : null;
  return {
    id: updated.id,
    label: updated.label,
    zone_id: updated.zone_id ?? null,
    zone: zone?.name ?? null,
    capacity: updated.capacity ?? null,
    is_active: updated.is_active,
    sort_order: updated.sort_order,
    created_at: toIsoString(updated.created_at) ?? new Date().toISOString(),
    updated_at: toIsoString(updated.updated_at),
  };
}

export async function deleteTableDefinition(tableId: string): Promise<void> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(tableId);
  if (env.useMockData) {
    ensureTableSeed();
    const cur = mockTableCatalog.get(id);
    if (!cur) throw new Error("Mesa no encontrada");
    const st = mockTableState.get(id) ?? null;
    const hasActiveOrder = st && st.status === "normal" && (st.pendingItems.length > 0 || st.sentItems.length > 0 || st.assignedWaiterId !== null);
    const hasReservation = !!st?.reservation;
    if (hasActiveOrder) throw new Error("No puedes eliminar una mesa con una comanda activa");
    if (hasReservation) throw new Error("No puedes eliminar una mesa con una reservación activa");
    mockTableCatalog.delete(id);
    mockTableState.delete(id);
    let i = 1;
    for (const rec of Array.from(mockTableCatalog.values()).sort((a, b) => a.sortOrder - b.sortOrder)) {
      rec.sortOrder = i++;
    }
    return;
  }

  const row = await fetchOneDefinition(id);
  if (!row) throw new Error("Mesa no encontrada");
  const st = row.st;
  const hasActiveOrder = st && st.status === "normal" && (st.pendingItems.length > 0 || st.sentItems.length > 0 || st.assignedWaiterId !== null);
  const hasReservation = !!st?.reservation;
  if (hasActiveOrder) throw new Error("No puedes eliminar una mesa con una comanda activa");
  if (hasReservation) throw new Error("No puedes eliminar una mesa con una reservación activa");

  await prisma.$transaction(async (tx) => {
    await tx.table_reservations.deleteMany({ where: { table_id: id } });
    await tx.table_state.deleteMany({ where: { table_id: id } });
    await tx.tables.delete({ where: { id } });
    const all = await tx.tables.findMany({ orderBy: [{ sort_order: "asc" }, { label: "asc" }, { id: "asc" }] });
    let index = 1;
    for (const rec of all) {
      if (rec.sort_order !== index) {
        await tx.tables.update({ where: { id: rec.id }, data: { sort_order: index } });
      }
      index += 1;
    }
  });
}

export async function setTableOrderStatus(tableId: string, status: OrderStatus): Promise<TableAdminSnapshot> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(tableId);
  if (env.useMockData) {
    ensureTableSeed();
    const def = mockTableCatalog.get(id);
    if (!def) throw new Error("Mesa no encontrada");
    const cur = mockTableState.get(id) ?? null;
    const next: TableOrderState = cur
      ? {
          assignedWaiterId: status === "normal" ? cur.assignedWaiterId : null,
          assignedWaiterName: status === "normal" ? cur.assignedWaiterName : null,
          status,
          pendingItems: status === "normal" ? [...cur.pendingItems] : [],
          sentItems: status === "normal" ? [...cur.sentItems] : [],
          reservation: status === "normal" ? (cur.reservation ? { ...cur.reservation } : null) : null,
          updatedAt: new Date().toISOString(),
        }
      : {
          assignedWaiterId: null,
          assignedWaiterName: null,
          status,
          pendingItems: [],
          sentItems: [],
          reservation: null,
          updatedAt: new Date().toISOString(),
        };
    mockTableState.set(id, next);
    return composeAdminSnapshot(def, next);
  }

  await prisma.$transaction(async (tx) => {
    const current = await fetchOneDefinition(id);
    if (!current) throw new Error("Mesa no encontrada");
    const st = current.st;
    const assignedWaiterId = status === "normal" ? st?.assignedWaiterId ?? null : null;
    const assignedWaiterName = status === "normal" ? st?.assignedWaiterName ?? null : null;
    const pending = status === "normal" ? serializeOrderLines(st?.pendingItems ?? []) : serializeOrderLines([]);
    const sent = status === "normal" ? serializeOrderLines(st?.sentItems ?? []) : serializeOrderLines([]);
    await tx.table_state.upsert({
      where: { table_id: id },
      update: {
        assigned_waiter_id: assignedWaiterId,
        assigned_waiter_name: assignedWaiterName,
        status,
        pending_items: pending,
        sent_items: sent,
        updated_at: new Date(),
      },
      create: {
        table_id: id,
        assigned_waiter_id: assignedWaiterId,
        assigned_waiter_name: assignedWaiterName,
        status,
        pending_items: pending,
        sent_items: sent,
        updated_at: new Date(),
      },
    });
    if (status !== "normal") {
      await tx.table_reservations.deleteMany({ where: { table_id: id } });
    }
  });
  const updated = await fetchOneDefinition(id);
  if (!updated) throw new Error("Mesa no encontrada");
  return composeAdminSnapshot(updated.def, updated.st);
}

export async function reserveTable(params: {
  tableId: string;
  reservedBy: string;
  contactName?: string | null;
  contactPhone?: string | null;
  partySize?: number | null;
  scheduledFor?: string | null;
  notes?: string | null;
}): Promise<TableAdminSnapshot> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(params.tableId);
  const reservedBy = params.reservedBy.trim();
  if (!reservedBy) throw new Error("Debes indicar quién realiza la reservación");
  if (env.useMockData) {
    ensureTableSeed();
    const def = mockTableCatalog.get(id);
    if (!def) throw new Error("Mesa no encontrada");
    if (!def.isActive) throw new Error("La mesa está inactiva");
    const state = mockTableState.get(id) ?? null;
    if (state?.reservation) {
      if (state.reservation.status === "holding") throw new Error("La mesa ya está reservada");
      throw new Error("La mesa está ocupada");
    }
    if (state && (state.assignedWaiterId !== null || state.pendingItems.length > 0 || state.sentItems.length > 0)) {
      throw new Error("La mesa está ocupada");
    }
    const now = new Date().toISOString();
    const reservation: TableReservationRecord = {
      status: "holding",
      reservedBy,
      contactName: params.contactName?.trim() || null,
      contactPhone: params.contactPhone?.trim() || null,
      partySize: typeof params.partySize === "number" && Number.isFinite(params.partySize) && params.partySize > 0 ? Math.floor(params.partySize) : null,
      notes: params.notes?.trim() || null,
      scheduledFor: params.scheduledFor?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
    const next: TableOrderState = {
      assignedWaiterId: state?.assignedWaiterId ?? null,
      assignedWaiterName: state?.assignedWaiterName ?? null,
      status: state?.status ?? "normal",
      pendingItems: state ? [...state.pendingItems] : [],
      sentItems: state ? [...state.sentItems] : [],
      reservation,
      updatedAt: now,
    };
    mockTableState.set(id, next);
    return composeAdminSnapshot(def, next);
  }

  const row = await fetchOneDefinition(id);
  if (!row) throw new Error("Mesa no encontrada");
  if (!row.def.isActive) throw new Error("La mesa está inactiva");
  const state = row.st;
  if (state?.reservation) {
    if (state.reservation.status === "holding") throw new Error("La mesa ya está reservada");
    throw new Error("La mesa está ocupada");
  }
  if (state && (state.assignedWaiterId !== null || state.pendingItems.length > 0 || state.sentItems.length > 0)) {
    throw new Error("La mesa está ocupada");
  }
  const status: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
  const pending = serializeOrderLines(state?.pendingItems ?? []);
  const sent = serializeOrderLines(state?.sentItems ?? []);
  await prisma.$transaction(async (tx) => {
    await tx.table_state.upsert({
      where: { table_id: id },
      update: { status, pending_items: pending, sent_items: sent, updated_at: new Date() },
      create: { table_id: id, status, pending_items: pending, sent_items: sent, updated_at: new Date() },
    });
    await tx.table_reservations.upsert({
      where: { table_id: id },
      update: {
        status: "holding",
        reserved_by: reservedBy,
        contact_name: params.contactName?.trim() || null,
        contact_phone: params.contactPhone?.trim() || null,
        party_size: typeof params.partySize === "number" && Number.isFinite(params.partySize) && params.partySize > 0 ? Math.floor(params.partySize) : null,
        notes: params.notes?.trim() || null,
        scheduled_for: params.scheduledFor?.trim() || null,
        updated_at: new Date(),
      },
      create: {
        table_id: id,
        status: "holding",
        reserved_by: reservedBy,
        contact_name: params.contactName?.trim() || null,
        contact_phone: params.contactPhone?.trim() || null,
        party_size: typeof params.partySize === "number" && Number.isFinite(params.partySize) && params.partySize > 0 ? Math.floor(params.partySize) : null,
        notes: params.notes?.trim() || null,
        scheduled_for: params.scheduledFor?.trim() || null,
      },
    });
  });
  const updated = await fetchOneDefinition(id);
  if (!updated) throw new Error("Mesa no encontrada");
  return composeAdminSnapshot(updated.def, updated.st);
}

export async function releaseTableReservation(tableId: string): Promise<TableAdminSnapshot> {
  assertRestaurantFeatureEnabled();
  const id = normalizeId(tableId);
  if (env.useMockData) {
    ensureTableSeed();
    const def = mockTableCatalog.get(id);
    if (!def) throw new Error("Mesa no encontrada");
    const st = mockTableState.get(id) ?? null;
    if (!st?.reservation) return composeAdminSnapshot(def, st);
    const next: TableOrderState = {
      assignedWaiterId: st.assignedWaiterId,
      assignedWaiterName: st.assignedWaiterName,
      status: st.status,
      pendingItems: [...st.pendingItems],
      sentItems: [...st.sentItems],
      reservation: null,
      updatedAt: new Date().toISOString(),
    };
    mockTableState.set(id, next);
    return composeAdminSnapshot(def, next);
  }

  await prisma.$transaction(async (tx) => {
    await tx.table_reservations.deleteMany({ where: { table_id: id } });
    await tx.table_state.update({ where: { table_id: id }, data: { updated_at: new Date() } }).catch(() => void 0);
  });
  const updated = await fetchOneDefinition(id);
  if (!updated) throw new Error("Mesa no encontrada");
  return composeAdminSnapshot(updated.def, updated.st);
}

export async function listAvailableTables(): Promise<TableAdminSnapshot[]> {
  assertRestaurantFeatureEnabled();
  if (env.useMockData) {
    ensureTableSeed();
    const records = Array.from(mockTableCatalog.values()).filter((r) => r.isActive);
    return records
      .filter((r) => isTableStateAvailable(mockTableState.get(r.id) ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((r) => composeAdminSnapshot(r, mockTableState.get(r.id) ?? null));
  }
  const rows = await fetchDefinitions(false);
  return rows
    .filter(({ st }) => isTableStateAvailable(st))
    .map(({ def, st }) => composeAdminSnapshot(def, st));
}

// -----------------------
// Zones (reuse repository for non-mock)
// -----------------------
const zoneRepo = new TableZoneRepository();

export async function listTableZones(options?: { includeInactive?: boolean }): Promise<TableZone[]> {
  assertRestaurantFeatureEnabled();
  if (!env.useMockData) {
    const rows = await zoneRepo.listZones(options?.includeInactive ?? true);
    return rows.map<TableZone>((z: TableZoneRow) => ({
      id: z.id,
      name: z.name,
      is_active: z.isActive,
      sort_order: z.sortOrder,
      created_at: z.createdAt,
      updated_at: z.updatedAt ?? null,
    }));
  }
  ensureZoneSeed();
  const includeInactive = options?.includeInactive ?? true;
  return Array.from(mockZoneCatalog.values())
    .filter((r) => includeInactive || r.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map<TableZone>((r) => ({ id: r.id, name: r.name, is_active: r.isActive, sort_order: r.sortOrder, created_at: r.createdAt, updated_at: r.updatedAt }));
}

export async function createTableZone(input: { name: string; isActive?: boolean }): Promise<TableZone> {
  assertRestaurantFeatureEnabled();
  if (!env.useMockData) {
    const created = await zoneRepo.createZone({ name: input.name, isActive: input.isActive });
    return { id: created.id, name: created.name, is_active: created.isActive, sort_order: created.sortOrder, created_at: created.createdAt, updated_at: created.updatedAt ?? null };
  }
  ensureZoneSeed();
  const name = input.name.trim();
  if (!name) throw new Error("El nombre de la zona es obligatorio");
  const id = normalizeZoneId(name);
  if (!id) throw new Error("La zona debe tener un identificador válido");
  if (mockZoneCatalog.has(id)) throw new Error("Ya existe una zona con ese nombre");
  const now = new Date().toISOString();
  const sortOrder = mockZoneCatalog.size + 1;
  const rec: TableZoneRecord = { id, name, isActive: input.isActive ?? true, sortOrder, createdAt: now, updatedAt: now };
  mockZoneCatalog.set(id, rec);
  return { id: rec.id, name: rec.name, is_active: rec.isActive, sort_order: rec.sortOrder, created_at: rec.createdAt, updated_at: rec.updatedAt };
}

export async function updateTableZone(zoneId: string, patch: { name?: string; isActive?: boolean }): Promise<TableZone> {
  assertRestaurantFeatureEnabled();
  if (!env.useMockData) {
    const updated = await zoneRepo.updateZone(zoneId, { name: patch.name, isActive: patch.isActive });
    return { id: updated.id, name: updated.name, is_active: updated.isActive, sort_order: updated.sortOrder, created_at: updated.createdAt, updated_at: updated.updatedAt ?? null };
  }
  ensureZoneSeed();
  const id = normalizeZoneId(zoneId);
  const cur = mockZoneCatalog.get(id);
  if (!cur) throw new Error("Zona no encontrada");
  const name = patch.name !== undefined ? patch.name.trim() : cur.name;
  if (!name) throw new Error("El nombre de la zona es obligatorio");
  cur.name = name;
  if (patch.isActive !== undefined) cur.isActive = patch.isActive;
  cur.updatedAt = new Date().toISOString();
  for (const table of mockTableCatalog.values()) {
    if (table.zoneId === cur.id) table.zoneName = cur.name;
  }
  return { id: cur.id, name: cur.name, is_active: cur.isActive, sort_order: cur.sortOrder, created_at: cur.createdAt, updated_at: cur.updatedAt };
}

export async function deleteTableZone(zoneId: string): Promise<void> {
  assertRestaurantFeatureEnabled();
  ensureZoneSeed();
  if (!env.useMockData) {
    // En producción validamos uso mediante Prisma
    const inUse = await prisma.tables.count({ where: { zone_id: zoneId } });
    if (inUse > 0) throw new Error("No puedes eliminar una zona asignada a mesas");
    await prisma.table_zones.delete({ where: { id: zoneId } });
    // Reordenar sort_order
    const all = await prisma.table_zones.findMany({ orderBy: { sort_order: "asc" } });
    let index = 1;
    for (const rec of all) {
      if (rec.sort_order !== index) await prisma.table_zones.update({ where: { id: rec.id }, data: { sort_order: index } });
      index += 1;
    }
    return;
  }
  const id = normalizeZoneId(zoneId);
  const cur = mockZoneCatalog.get(id);
  if (!cur) throw new Error("Zona no encontrada");
  const inUse = Array.from(mockTableCatalog.values()).some((t) => t.zoneId === id);
  if (inUse) throw new Error("No puedes eliminar una zona asignada a mesas");
  mockZoneCatalog.delete(id);
  let i = 1;
  for (const rec of Array.from(mockZoneCatalog.values()).sort((a, b) => a.sortOrder - b.sortOrder)) {
    rec.sortOrder = i++;
  }
}
