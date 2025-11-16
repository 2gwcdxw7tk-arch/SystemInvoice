import "server-only";

import { env } from "@/lib/env";
import type { PoolClient } from "@/lib/db/postgres";
import { query, withTransaction } from "@/lib/db/postgres";
import { TableZoneRepository } from "@/lib/repositories/TableZoneRepository";
import type { TableZoneRow } from "@/lib/repositories/ITableZoneRepository";
import type { OrderLine, OrderStatus } from "@/lib/orders/types";

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

type TableZoneRecord = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string | null;
};

type DbTableRow = {
  id: string;
  label: string;
  zone_id: string | null;
  zone_name: string | null;
  capacity: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date | string;
  updated_at: Date | string | null;
  assigned_waiter_id: number | null;
  assigned_waiter_name: string | null;
  state_status: OrderStatus | null;
  pending_items: string | null;
  sent_items: string | null;
  state_updated_at: Date | string | null;
  reservation_status: "holding" | "seated" | null;
  reserved_by: string | null;
  reservation_contact_name: string | null;
  reservation_contact_phone: string | null;
  reservation_party_size: number | null;
  reservation_notes: string | null;
  reservation_scheduled_for: string | null;
  reservation_created_at: Date | string | null;
  reservation_updated_at: Date | string | null;
};

type DbSnapshot = {
  definition: TableDefinitionRecord;
  state: TableOrderState | null;
};

const mockZoneCatalog = new Map<string, TableZoneRecord>();
const mockTableCatalog = new Map<string, TableDefinitionRecord>();
const mockTableStore = new Map<string, TableOrderState>();

const tableZoneRepository = new TableZoneRepository();

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseOrderLines(raw: string | null): OrderLine[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const lines: OrderLine[] = [];
    for (const item of parsed) {
      const articleCode = typeof item?.articleCode === "string" ? item.articleCode : "";
      const name = typeof item?.name === "string" ? item.name : "";
      const quantityValue = Number(item?.quantity);
      if (!articleCode || !Number.isFinite(quantityValue)) {
        continue;
      }
      const unitPriceValue = item?.unitPrice;
      const unitPrice = unitPriceValue === null || unitPriceValue === undefined ? null : Number(unitPriceValue);
      const notes = typeof item?.notes === "string" ? item.notes : undefined;
      lines.push({
        articleCode,
        name,
        unitPrice: unitPrice === null || Number.isFinite(unitPrice) ? unitPrice : null,
        quantity: quantityValue,
        notes,
      });
    }
    return lines;
  } catch (error) {
    console.warn("No se pudo parsear el estado de la mesa", error);
    return [];
  }
}

function sanitizeOrderLines(lines: OrderLine[]): OrderLine[] {
  const sanitized: OrderLine[] = [];
  for (const line of lines) {
    const articleCode = typeof line.articleCode === "string" ? line.articleCode : String(line.articleCode ?? "");
    const name = typeof line.name === "string" ? line.name : "";
    const quantity = Number(line.quantity);
    if (!articleCode || !Number.isFinite(quantity)) {
      continue;
    }
    const unitPrice = line.unitPrice === null || line.unitPrice === undefined ? null : Number(line.unitPrice);
    const notes = typeof line.notes === "string" && line.notes.length > 0 ? line.notes : undefined;
    sanitized.push({
      articleCode,
      name,
      unitPrice: unitPrice === null || Number.isFinite(unitPrice) ? unitPrice : null,
      quantity,
      notes,
    });
  }
  return sanitized;
}

function serializeOrderLines(lines: OrderLine[]): string {
  return JSON.stringify(sanitizeOrderLines(lines));
}

function buildReservationRecord(row: DbTableRow): TableReservationRecord | null {
  if (!row.reservation_status || !row.reserved_by) {
    return null;
  }
  return {
    status: row.reservation_status,
    reservedBy: row.reserved_by,
    contactName: row.reservation_contact_name ?? null,
    contactPhone: row.reservation_contact_phone ?? null,
    partySize: row.reservation_party_size ?? null,
    notes: row.reservation_notes ?? null,
    scheduledFor: row.reservation_scheduled_for ?? null,
    createdAt: toIsoString(row.reservation_created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.reservation_updated_at) ?? toIsoString(row.reservation_created_at) ?? new Date().toISOString(),
  } satisfies TableReservationRecord;
}

function buildStateFromRow(row: DbTableRow): TableOrderState | null {
  const hasState =
    row.state_status !== null ||
    row.assigned_waiter_id !== null ||
    row.assigned_waiter_name !== null ||
    !!row.pending_items ||
    !!row.sent_items;
  const reservation = buildReservationRecord(row);
  if (!hasState && !reservation) {
    return null;
  }
  const status: OrderStatus = row.state_status ?? "normal";
  return {
    assignedWaiterId: row.assigned_waiter_id ?? null,
    assignedWaiterName: row.assigned_waiter_name ?? null,
    status,
    pendingItems: parseOrderLines(row.pending_items),
    sentItems: parseOrderLines(row.sent_items),
    reservation,
    updatedAt: toIsoString(row.state_updated_at),
  } satisfies TableOrderState;
}

function mapRowToDefinition(row: DbTableRow): TableDefinitionRecord {
  return {
    id: row.id,
    label: row.label,
    zoneId: row.zone_id ?? null,
    zoneName: row.zone_name ?? null,
    capacity: row.capacity ?? null,
    isActive: !!row.is_active,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at),
  } satisfies TableDefinitionRecord;
}

async function fetchTableSnapshots(
  params: { tableId?: string; includeInactive?: boolean } = {},
  client?: PoolClient
): Promise<DbSnapshot[]> {
  const normalizedId = params.tableId ? normalizeTableId(params.tableId) : null;
  const includeInactive = params.includeInactive ?? true;
  const values: Array<string | boolean | null> = [normalizedId, includeInactive];
  const sqlText = `
    SELECT
      t.id,
      t.label,
      t.zone_id,
      z.name AS zone_name,
      t.capacity,
      t.is_active,
      t.sort_order,
      t.created_at,
      t.updated_at,
      ts.assigned_waiter_id,
      ts.assigned_waiter_name,
      ts.status AS state_status,
      ts.pending_items,
      ts.sent_items,
      ts.updated_at AS state_updated_at,
      tr.status AS reservation_status,
      tr.reserved_by,
      tr.contact_name AS reservation_contact_name,
      tr.contact_phone AS reservation_contact_phone,
      tr.party_size AS reservation_party_size,
      tr.notes AS reservation_notes,
      tr.scheduled_for AS reservation_scheduled_for,
      tr.created_at AS reservation_created_at,
      tr.updated_at AS reservation_updated_at
    FROM app.tables t
    LEFT JOIN app.table_zones z ON z.id = t.zone_id
    LEFT JOIN app.table_state ts ON ts.table_id = t.id
    LEFT JOIN app.table_reservations tr ON tr.table_id = t.id
    WHERE ($1::text IS NULL OR t.id = $1::text)
      AND ($2::boolean OR t.is_active = TRUE)
    ORDER BY t.sort_order, t.label;
  `;
  const result = client
    ? await client.query<DbTableRow>(sqlText, values)
    : await query<DbTableRow>(sqlText, values);
  return result.rows.map((row) => ({
    definition: mapRowToDefinition(row),
    state: buildStateFromRow(row),
  }));
}

async function fetchSnapshotOrThrow(tableId: string, client: PoolClient): Promise<DbSnapshot> {
  const rows = await fetchTableSnapshots({ tableId, includeInactive: true }, client);
  if (rows.length === 0) {
    throw new Error("Mesa no encontrada");
  }
  return rows[0];
}

function cloneLines(lines: OrderLine[]): OrderLine[] {
  return lines.map((line) => ({ ...line }));
}

function cloneReservation(record: TableReservationRecord | null): TableReservationRecord | null {
  return record ? { ...record } : null;
}

function toReservationSnapshot(record: TableReservationRecord | null): TableReservationSnapshot | null {
  if (!record) {
    return null;
  }
  return {
    status: record.status,
    reserved_by: record.reservedBy,
    contact_name: record.contactName,
    contact_phone: record.contactPhone,
    party_size: record.partySize,
    notes: record.notes,
    scheduled_for: record.scheduledFor,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function normalizeZoneId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[^\p{ASCII}]/gu, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-");
}

function ensureZoneCatalogSeed(): void {
  if (!env.useMockData || mockZoneCatalog.size > 0) {
    return;
  }
  const now = new Date().toISOString();
  const seeds: Array<Omit<TableZoneRecord, "createdAt" | "updatedAt">> = [
    { id: "SALON-A", name: "Salón A", isActive: true, sortOrder: 1 },
    { id: "TERRAZA", name: "Terraza", isActive: true, sortOrder: 2 },
    { id: "BARRA", name: "Barra", isActive: true, sortOrder: 3 },
    { id: "VIP", name: "VIP", isActive: true, sortOrder: 4 },
  ];

  for (const seed of seeds) {
    mockZoneCatalog.set(seed.id, {
      ...seed,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function getZoneName(zoneId: string | null): string | null {
  if (!zoneId) {
    return null;
  }
  ensureZoneCatalogSeed();
  const record = mockZoneCatalog.get(zoneId);
  return record?.name ?? null;
}

function toZoneSnapshot(record: TableZoneRecord): TableZone {
  return {
    id: record.id,
    name: record.name,
    is_active: record.isActive,
    sort_order: record.sortOrder,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function toZoneSnapshotFromRow(row: TableZoneRow): TableZone {
  return {
    id: row.id,
    name: row.name,
    is_active: row.isActive,
    sort_order: row.sortOrder,
    created_at: row.createdAt,
    updated_at: row.updatedAt ?? null,
  };
}

function normalizeTableId(id: string): string {
  return id.trim().toUpperCase();
}

function ensureCatalogSeed(): void {
  if (!env.useMockData || mockTableCatalog.size > 0) {
    return;
  }
  ensureZoneCatalogSeed();
  const now = new Date().toISOString();
  const seeds: Array<Omit<TableDefinitionRecord, "createdAt" | "updatedAt">> = [
    { id: "T-01", label: "Mesa 1", zoneId: "SALON-A", zoneName: getZoneName("SALON-A"), capacity: 4, isActive: true, sortOrder: 1 },
    { id: "T-02", label: "Mesa 2", zoneId: "SALON-A", zoneName: getZoneName("SALON-A"), capacity: 4, isActive: true, sortOrder: 2 },
    { id: "T-03", label: "Mesa 3", zoneId: "SALON-A", zoneName: getZoneName("SALON-A"), capacity: 6, isActive: true, sortOrder: 3 },
    { id: "T-04", label: "Mesa 4", zoneId: "SALON-A", zoneName: getZoneName("SALON-A"), capacity: 6, isActive: true, sortOrder: 4 },
    { id: "T-05", label: "Mesa 5", zoneId: "TERRAZA", zoneName: getZoneName("TERRAZA"), capacity: 4, isActive: true, sortOrder: 5 },
    { id: "T-06", label: "Mesa 6", zoneId: "TERRAZA", zoneName: getZoneName("TERRAZA"), capacity: 2, isActive: true, sortOrder: 6 },
    { id: "T-07", label: "Mesa 7", zoneId: "TERRAZA", zoneName: getZoneName("TERRAZA"), capacity: 2, isActive: true, sortOrder: 7 },
    { id: "T-08", label: "Mesa 8", zoneId: "BARRA", zoneName: getZoneName("BARRA"), capacity: 4, isActive: true, sortOrder: 8 },
    { id: "T-09", label: "Mesa 9", zoneId: "BARRA", zoneName: getZoneName("BARRA"), capacity: 4, isActive: true, sortOrder: 9 },
    { id: "T-10", label: "Mesa 10", zoneId: "VIP", zoneName: getZoneName("VIP"), capacity: 8, isActive: true, sortOrder: 10 },
  ];

  for (const seed of seeds) {
    mockTableCatalog.set(seed.id, {
      ...seed,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function ensureMockSeed(): void {
  if (!env.useMockData) {
    return;
  }
  ensureCatalogSeed();
  if (mockTableStore.size > 0) {
    return;
  }
  const now = new Date().toISOString();
  mockTableStore.set("T-01", {
    assignedWaiterId: 101,
    assignedWaiterName: "Mesero Demo",
    status: "normal",
    pendingItems: [
      { articleCode: "TAC-001", name: "Taco de arrachera", unitPrice: 42, quantity: 1 },
    ],
    sentItems: [],
    reservation: null,
    updatedAt: now,
  });
  mockTableStore.set("T-03", {
    assignedWaiterId: 202,
    assignedWaiterName: "Mesera Invitada",
    status: "normal",
    pendingItems: [],
    sentItems: [
      { articleCode: "REF-001", name: "Refresco cola 600ml", unitPrice: 35, quantity: 2, notes: "Vasos con hielo aparte" },
    ],
    reservation: null,
    updatedAt: now,
  });
}

function assertMockMode(): void {
  if (!env.useMockData) {
    throw new Error("Gestión de mesas no disponible sin MOCK_DATA por ahora");
  }
}

function getDefinition(tableId: string): TableDefinitionRecord {
  ensureCatalogSeed();
  const record = mockTableCatalog.get(tableId);
  if (!record) {
    throw new Error("Mesa no encontrada");
  }
  return record;
}

function toWaiterSnapshot(record: TableDefinitionRecord, providedState?: TableOrderState | null): WaiterTableSnapshot {
  let state = providedState ?? null;
  if (env.useMockData && providedState === undefined) {
    ensureMockSeed();
    state = mockTableStore.get(record.id) ?? null;
  }
  const zoneName = record.zoneName ?? getZoneName(record.zoneId);
  const reservation = toReservationSnapshot(state?.reservation ?? null);
  const hasVisibleOrder = !!state && (state.pendingItems.length > 0 || state.sentItems.length > 0 || state.assignedWaiterId !== null);
  return {
    id: record.id,
    label: record.label,
    zone_id: record.zoneId,
    zone: zoneName,
    capacity: record.capacity,
    assigned_waiter_id: state?.assignedWaiterId ?? null,
    assigned_waiter_name: state?.assignedWaiterName ?? null,
    updated_at: state?.updatedAt ?? null,
    reservation,
    order: hasVisibleOrder && state
      ? {
          status: state.status,
          pending_items: cloneLines(state.pendingItems),
          sent_items: cloneLines(state.sentItems),
        }
      : null,
  };
}

function toDefinitionSnapshot(record: TableDefinitionRecord): TableDefinition {
  return {
    id: record.id,
    label: record.label,
    zone_id: record.zoneId,
    zone: record.zoneName,
    capacity: record.capacity,
    is_active: record.isActive,
    sort_order: record.sortOrder,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function composeAdminSnapshot(record: TableDefinitionRecord, providedState?: TableOrderState | null): TableAdminSnapshot {
  const base = toDefinitionSnapshot(record);
  let state = providedState ?? null;
  if (env.useMockData && providedState === undefined) {
    ensureMockSeed();
    state = mockTableStore.get(record.id) ?? null;
  }
  const pending = state ? state.pendingItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
  const sent = state ? state.sentItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
  const hasMovement = pending + sent > 0 || !!state?.assignedWaiterId;
  const orderStatus: OrderStatus | "libre" = state
    ? state.status === "normal"
      ? hasMovement
        ? "normal"
        : "libre"
      : hasMovement
      ? state.status
      : "libre"
    : "libre";

  return {
    ...base,
    assigned_waiter_id: state?.assignedWaiterId ?? null,
    assigned_waiter_name: state?.assignedWaiterName ?? null,
    updated_state_at: state?.updatedAt ?? null,
    order_status: orderStatus,
    pending_items_count: pending,
    sent_items_count: sent,
      reservation: toReservationSnapshot(state?.reservation ?? null),
    order: state
      ? {
          status: state.status,
          pending_items: cloneLines(state.pendingItems),
          sent_items: cloneLines(state.sentItems),
        }
      : null,
  };
}

function isTableStateAvailable(state: TableOrderState | undefined): boolean {
  if (!state) {
    return true;
  }
  if (state.reservation) {
    return false;
  }
  if (state.assignedWaiterId !== null) {
    return false;
  }
  if (state.pendingItems.length > 0) {
    return false;
  }
  if (state.status === "normal" && state.sentItems.length > 0) {
    return false;
  }
  return true;
}

export async function listWaiterTables(): Promise<WaiterTableSnapshot[]> {
  if (env.useMockData) {
    ensureCatalogSeed();
    return Array.from(mockTableCatalog.values())
      .filter((record) => record.isActive)
      .map((record) => toWaiterSnapshot(record));
  }
  const rows = await fetchTableSnapshots({ includeInactive: false });
  return rows.map(({ definition, state }) => toWaiterSnapshot(definition, state));
}

export async function getWaiterTable(tableId: string): Promise<WaiterTableSnapshot | null> {
  if (env.useMockData) {
    ensureCatalogSeed();
    const record = mockTableCatalog.get(tableId);
    if (!record) {
      return null;
    }
    return toWaiterSnapshot(record);
  }
  const rows = await fetchTableSnapshots({ tableId, includeInactive: true });
  if (rows.length === 0) {
    return null;
  }
  const snapshot = rows[0];
  return toWaiterSnapshot(snapshot.definition, snapshot.state);
}

export async function claimWaiterTable(params: {
  tableId: string;
  waiterId: number;
  waiterName: string;
}): Promise<WaiterTableSnapshot> {
  if (env.useMockData) {
    assertMockMode();
    ensureMockSeed();
    const record = getDefinition(params.tableId);
    if (!record.isActive) {
      throw new Error("La mesa está inactiva");
    }
    const state = mockTableStore.get(params.tableId);
    if (state && state.assignedWaiterId && state.assignedWaiterId !== params.waiterId && state.status === "normal") {
      throw new Error("La mesa está asignada a otro mesero");
    }
    const now = new Date().toISOString();
    const status: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
    const reservation = state?.reservation
      ? {
          ...state.reservation,
          status: "seated" as const,
          updatedAt: now,
        }
      : null;
    mockTableStore.set(params.tableId, {
      assignedWaiterId: params.waiterId,
      assignedWaiterName: params.waiterName,
      status,
      pendingItems: state ? cloneLines(state.pendingItems) : [],
      sentItems: state ? cloneLines(state.sentItems) : [],
      reservation,
      updatedAt: now,
    });
    return toWaiterSnapshot(record, mockTableStore.get(params.tableId) ?? null);
  }
  return claimWaiterTableDb(params);
}

export async function storeWaiterTableOrder(params: {
  tableId: string;
  waiterId: number;
  waiterName: string;
  pendingItems: OrderLine[];
  sentItems: OrderLine[];
}): Promise<WaiterTableSnapshot> {
  if (env.useMockData) {
    assertMockMode();
    ensureMockSeed();
    const record = getDefinition(params.tableId);
    if (!record.isActive) {
      throw new Error("La mesa está inactiva");
    }
    const state = mockTableStore.get(params.tableId);
    if (state && state.assignedWaiterId && state.assignedWaiterId !== params.waiterId && state.status === "normal") {
      throw new Error("La mesa está asignada a otro mesero");
    }
    const now = new Date().toISOString();
    const status: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
    mockTableStore.set(params.tableId, {
      assignedWaiterId: params.waiterId,
      assignedWaiterName: params.waiterName,
      status,
      pendingItems: cloneLines(params.pendingItems),
      sentItems: cloneLines(params.sentItems),
      reservation: state ? cloneReservation(state.reservation) : null,
      updatedAt: now,
    });
    return toWaiterSnapshot(record, mockTableStore.get(params.tableId) ?? null);
  }
  return storeWaiterTableOrderDb(params);
}

export async function listTableDefinitions(): Promise<TableDefinition[]> {
  if (env.useMockData) {
    ensureCatalogSeed();
    return Array.from(mockTableCatalog.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((record) => toDefinitionSnapshot(record));
  }
  const rows = await fetchTableSnapshots({ includeInactive: true });
  return rows.map(({ definition }) => toDefinitionSnapshot(definition));
}

export async function getTableAdminSnapshot(tableId: string): Promise<TableAdminSnapshot | null> {
  if (env.useMockData) {
    ensureCatalogSeed();
    const record = mockTableCatalog.get(tableId);
    if (!record) {
      return null;
    }
    return composeAdminSnapshot(record);
  }
  const rows = await fetchTableSnapshots({ tableId, includeInactive: true });
  if (rows.length === 0) {
    return null;
  }
  const snapshot = rows[0];
  return composeAdminSnapshot(snapshot.definition, snapshot.state);
}

export async function listTableAdminSnapshots(): Promise<TableAdminSnapshot[]> {
  if (env.useMockData) {
    ensureCatalogSeed();
    return Array.from(mockTableCatalog.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((record) => composeAdminSnapshot(record));
  }
  const rows = await fetchTableSnapshots({ includeInactive: true });
  return rows.map(({ definition, state }) => composeAdminSnapshot(definition, state));
}

export async function createTableDefinition(input: {
  id: string;
  label: string;
  zoneId: string | null;
  capacity: number | null;
  isActive?: boolean;
}): Promise<TableDefinition> {
  if (env.useMockData) {
    assertMockMode();
    ensureCatalogSeed();
    const id = normalizeTableId(input.id);
    if (mockTableCatalog.has(id)) {
      throw new Error("Ya existe una mesa con ese código");
    }
    const zoneId = input.zoneId ? normalizeZoneId(input.zoneId) : null;
    const zoneName = zoneId ? getZoneName(zoneId) : null;
    if (zoneId && !zoneName) {
      throw new Error("La zona seleccionada no existe");
    }
    const now = new Date().toISOString();
    const sortOrder = mockTableCatalog.size + 1;
    const record: TableDefinitionRecord = {
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
    mockTableCatalog.set(id, record);
    return toDefinitionSnapshot(record);
  }
  return createTableDefinitionDb(input);
}

export async function updateTableDefinition(tableId: string, patch: {
  label?: string;
  zoneId?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}): Promise<TableDefinition> {
  if (env.useMockData) {
    assertMockMode();
    ensureCatalogSeed();
    const id = normalizeTableId(tableId);
    const current = getDefinition(id);
    const nextZoneId = patch.zoneId !== undefined ? (patch.zoneId ? normalizeZoneId(patch.zoneId) : null) : current.zoneId;
    const nextZoneName = nextZoneId ? getZoneName(nextZoneId) : null;
    if (nextZoneId && !nextZoneName) {
      throw new Error("La zona seleccionada no existe");
    }
    const updated: TableDefinitionRecord = {
      ...current,
      label: patch.label !== undefined ? patch.label.trim() : current.label,
      zoneId: nextZoneId,
      zoneName: nextZoneName,
      capacity: patch.capacity !== undefined ? patch.capacity : current.capacity,
      isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
      updatedAt: new Date().toISOString(),
    };
    mockTableCatalog.set(id, updated);
    if (!updated.isActive) {
      mockTableStore.delete(id);
    }
    return toDefinitionSnapshot(updated);
  }
  return updateTableDefinitionDb(tableId, patch);
}

export async function deleteTableDefinition(tableId: string): Promise<void> {
  if (env.useMockData) {
    assertMockMode();
    ensureCatalogSeed();
    const id = normalizeTableId(tableId);
    getDefinition(id);
    const state = mockTableStore.get(id);
    const hasActiveOrder = state && (state.status === "normal" && (state.pendingItems.length > 0 || state.sentItems.length > 0 || state.assignedWaiterId !== null));
    const hasReservation = !!state?.reservation;
    if (hasActiveOrder) {
      throw new Error("No puedes eliminar una mesa con una comanda activa");
    }
    if (hasReservation) {
      throw new Error("No puedes eliminar una mesa con una reservación activa");
    }
    mockTableCatalog.delete(id);
    mockTableStore.delete(id);
    let index = 1;
    for (const record of Array.from(mockTableCatalog.values()).sort((a, b) => a.sortOrder - b.sortOrder)) {
      record.sortOrder = index++;
    }
    return;
  }
  await deleteTableDefinitionDb(tableId);
}

export async function setTableOrderStatus(tableId: string, status: OrderStatus): Promise<TableAdminSnapshot> {
  if (env.useMockData) {
    assertMockMode();
    ensureMockSeed();
    const id = normalizeTableId(tableId);
    const record = getDefinition(id);
    const state = mockTableStore.get(id);
    if (!state) {
      mockTableStore.set(id, {
        assignedWaiterId: null,
        assignedWaiterName: null,
        status,
        pendingItems: [],
        sentItems: [],
        reservation: null,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const updated: TableOrderState = {
        assignedWaiterId: status === "normal" ? state.assignedWaiterId : null,
        assignedWaiterName: status === "normal" ? state.assignedWaiterName : null,
        status,
        pendingItems: status === "normal" ? cloneLines(state.pendingItems) : [],
        sentItems: status === "normal" ? cloneLines(state.sentItems) : [],
        reservation: status === "normal" ? cloneReservation(state.reservation) : null,
        updatedAt: new Date().toISOString(),
      };
      mockTableStore.set(id, updated);
    }
    return composeAdminSnapshot(record, mockTableStore.get(id) ?? null);
  }
  return setTableOrderStatusDb(tableId, status);
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
  if (env.useMockData) {
    assertMockMode();
    ensureMockSeed();
    const id = normalizeTableId(params.tableId);
    const record = getDefinition(id);
    if (!record.isActive) {
      throw new Error("La mesa está inactiva");
    }
    const state = mockTableStore.get(id);
    const isReserved = state?.reservation;
    if (isReserved) {
      if (state?.reservation?.status === "holding") {
        throw new Error("La mesa ya está reservada");
      }
      throw new Error("La mesa está ocupada");
    }
    if (state && (state.assignedWaiterId !== null || state.pendingItems.length > 0 || state.sentItems.length > 0)) {
      throw new Error("La mesa está ocupada");
    }

    const reservedBy = params.reservedBy.trim();
    if (!reservedBy) {
      throw new Error("Debes indicar quién realiza la reservación");
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

    const status: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
    const pendingItems = state ? cloneLines(state.pendingItems) : [];
    const sentItems = state ? cloneLines(state.sentItems) : [];
    const newState: TableOrderState = {
      assignedWaiterId: state?.assignedWaiterId ?? null,
      assignedWaiterName: state?.assignedWaiterName ?? null,
      status,
      pendingItems,
      sentItems,
      reservation,
      updatedAt: now,
    };
    mockTableStore.set(id, newState);
    return composeAdminSnapshot(record, newState);
  }
  return reserveTableDb(params);
}

export async function releaseTableReservation(tableId: string): Promise<TableAdminSnapshot> {
  if (env.useMockData) {
    assertMockMode();
    ensureMockSeed();
    const id = normalizeTableId(tableId);
    const record = getDefinition(id);
    const state = mockTableStore.get(id);
    if (!state || !state.reservation) {
      return composeAdminSnapshot(record);
    }
    const now = new Date().toISOString();
    const updated: TableOrderState = {
      assignedWaiterId: state.assignedWaiterId,
      assignedWaiterName: state.assignedWaiterName,
      status: state.status,
      pendingItems: cloneLines(state.pendingItems),
      sentItems: cloneLines(state.sentItems),
      reservation: null,
      updatedAt: now,
    };
    mockTableStore.set(id, updated);
    return composeAdminSnapshot(record, updated);
  }
  return releaseTableReservationDb(tableId);
}

export async function listAvailableTables(): Promise<TableAdminSnapshot[]> {
  if (env.useMockData) {
    ensureCatalogSeed();
    ensureMockSeed();
    const records = Array.from(mockTableCatalog.values()).filter((record) => record.isActive);
    return records
      .filter((record) => isTableStateAvailable(mockTableStore.get(record.id)))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((record) => composeAdminSnapshot(record));
  }
  const rows = await fetchTableSnapshots({ includeInactive: false });
  return rows
    .filter(({ state }) => isTableStateAvailable(state ?? undefined))
    .map(({ definition, state }) => composeAdminSnapshot(definition, state));
}

async function claimWaiterTableDb(params: {
  tableId: string;
  waiterId: number;
  waiterName: string;
}): Promise<WaiterTableSnapshot> {
  const tableId = normalizeTableId(params.tableId);
  const waiterName = params.waiterName.trim();
  return withTransaction(async (client: PoolClient) => {
    const snapshot = await fetchSnapshotOrThrow(tableId, client);
    if (!snapshot.definition.isActive) {
      throw new Error("La mesa está inactiva");
    }
    const state = snapshot.state;
    if (state && state.assignedWaiterId && state.assignedWaiterId !== params.waiterId && state.status === "normal") {
      throw new Error("La mesa está asignada a otro mesero");
    }
    const status: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
    const pendingItems = serializeOrderLines(state?.pendingItems ?? []);
    const sentItems = serializeOrderLines(state?.sentItems ?? []);
    await client.query(
      `
        INSERT INTO app.table_state (table_id, assigned_waiter_id, assigned_waiter_name, status, pending_items, sent_items, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (table_id)
        DO UPDATE SET
          assigned_waiter_id = EXCLUDED.assigned_waiter_id,
          assigned_waiter_name = EXCLUDED.assigned_waiter_name,
          status = EXCLUDED.status,
          pending_items = EXCLUDED.pending_items,
          sent_items = EXCLUDED.sent_items,
          updated_at = NOW();
      `,
      [tableId, params.waiterId, waiterName || null, status, pendingItems, sentItems]
    );
    if (state?.reservation) {
      await client.query(
        `
          UPDATE app.table_reservations
          SET status = 'seated', updated_at = NOW()
          WHERE table_id = $1;
        `,
        [tableId]
      );
    }
    const updated = await fetchSnapshotOrThrow(tableId, client);
    return toWaiterSnapshot(updated.definition, updated.state);
  });
}

async function storeWaiterTableOrderDb(params: {
  tableId: string;
  waiterId: number;
  waiterName: string;
  pendingItems: OrderLine[];
  sentItems: OrderLine[];
}): Promise<WaiterTableSnapshot> {
  const tableId = normalizeTableId(params.tableId);
  const waiterName = params.waiterName.trim();
  const pendingItems = serializeOrderLines(params.pendingItems);
  const sentItems = serializeOrderLines(params.sentItems);
  return withTransaction(async (client: PoolClient) => {
    const snapshot = await fetchSnapshotOrThrow(tableId, client);
    if (!snapshot.definition.isActive) {
      throw new Error("La mesa está inactiva");
    }
    const state = snapshot.state;
    if (state && state.assignedWaiterId && state.assignedWaiterId !== params.waiterId && state.status === "normal") {
      throw new Error("La mesa está asignada a otro mesero");
    }
    const status: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
    await client.query(
      `
        INSERT INTO app.table_state (table_id, assigned_waiter_id, assigned_waiter_name, status, pending_items, sent_items, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (table_id)
        DO UPDATE SET
          assigned_waiter_id = EXCLUDED.assigned_waiter_id,
          assigned_waiter_name = EXCLUDED.assigned_waiter_name,
          status = EXCLUDED.status,
          pending_items = EXCLUDED.pending_items,
          sent_items = EXCLUDED.sent_items,
          updated_at = NOW();
      `,
      [tableId, params.waiterId, waiterName || null, status, pendingItems, sentItems]
    );
    const updated = await fetchSnapshotOrThrow(tableId, client);
    return toWaiterSnapshot(updated.definition, updated.state);
  });
}

async function createTableDefinitionDb(input: {
  id: string;
  label: string;
  zoneId: string | null;
  capacity: number | null;
  isActive?: boolean;
}): Promise<TableDefinition> {
  const id = normalizeTableId(input.id);
  const label = input.label.trim();
  if (!label) {
    throw new Error("El nombre de la mesa es obligatorio");
  }
  const capacityValue = typeof input.capacity === "number" && Number.isFinite(input.capacity) && input.capacity > 0 ? Math.floor(input.capacity) : null;
  const zoneId = input.zoneId ? normalizeZoneId(input.zoneId) : null;
  const isActive = input.isActive ?? true;
  return withTransaction(async (client: PoolClient) => {
    const duplicate = await client.query(`SELECT 1 FROM app.tables WHERE id = $1 LIMIT 1;`, [id]);
    if ((duplicate.rowCount ?? 0) > 0) {
      throw new Error("Ya existe una mesa con ese código");
    }
    if (zoneId) {
      const zoneResult = await client.query(`SELECT 1 FROM app.table_zones WHERE id = $1 LIMIT 1;`, [zoneId]);
      if ((zoneResult.rowCount ?? 0) === 0) {
        throw new Error("La zona seleccionada no existe");
      }
    }
    const sortOrderResult = await client.query<{ next_sort_order: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM app.tables;`
    );
    const sortOrder = Number(sortOrderResult.rows[0]?.next_sort_order ?? 1);
    await client.query(
      `
        INSERT INTO app.tables (id, label, zone_id, capacity, is_active, sort_order, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NULL);
      `,
      [id, label, zoneId, capacityValue, isActive, sortOrder]
    );
    const snapshot = await fetchSnapshotOrThrow(id, client);
    return toDefinitionSnapshot(snapshot.definition);
  });
}

async function updateTableDefinitionDb(tableId: string, patch: {
  label?: string;
  zoneId?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}): Promise<TableDefinition> {
  const id = normalizeTableId(tableId);
  return withTransaction(async (client: PoolClient) => {
    const snapshot = await fetchSnapshotOrThrow(id, client);
    const current = snapshot.definition;
    const label = patch.label !== undefined ? patch.label.trim() : current.label;
    if (!label) {
      throw new Error("El nombre de la mesa es obligatorio");
    }
    const zoneId =
      patch.zoneId !== undefined ? (patch.zoneId ? normalizeZoneId(patch.zoneId) : null) : current.zoneId;
    if (zoneId) {
      const zoneResult = await client.query(`SELECT 1 FROM app.table_zones WHERE id = $1 LIMIT 1;`, [zoneId]);
      if (zoneResult.rowCount === 0) {
        throw new Error("La zona seleccionada no existe");
      }
    }
    const capacityValue =
      patch.capacity !== undefined && patch.capacity !== null && Number.isFinite(patch.capacity)
        ? Math.max(1, Math.floor(patch.capacity))
        : patch.capacity === null
        ? null
        : current.capacity;
    const isActive = patch.isActive !== undefined ? patch.isActive : current.isActive;
    await client.query(
      `
        UPDATE app.tables
        SET label = $1,
            zone_id = $2,
            capacity = $3,
            is_active = $4,
            updated_at = NOW()
        WHERE id = $5;
      `,
      [label, zoneId, capacityValue, isActive, id]
    );
    if (!isActive) {
      await client.query(`DELETE FROM app.table_reservations WHERE table_id = $1;`, [id]);
      await client.query(`DELETE FROM app.table_state WHERE table_id = $1;`, [id]);
    }
    const updated = await fetchSnapshotOrThrow(id, client);
    return toDefinitionSnapshot(updated.definition);
  });
}

async function deleteTableDefinitionDb(tableId: string): Promise<void> {
  const id = normalizeTableId(tableId);
  await withTransaction(async (client: PoolClient) => {
    const snapshot = await fetchSnapshotOrThrow(id, client);
    const state = snapshot.state;
    const hasActiveOrder =
      state && state.status === "normal" && (state.pendingItems.length > 0 || state.sentItems.length > 0 || state.assignedWaiterId !== null);
    const hasReservation = !!state?.reservation;
    if (hasActiveOrder) {
      throw new Error("No puedes eliminar una mesa con una comanda activa");
    }
    if (hasReservation) {
      throw new Error("No puedes eliminar una mesa con una reservación activa");
    }
    await client.query(`DELETE FROM app.table_reservations WHERE table_id = $1;`, [id]);
    await client.query(`DELETE FROM app.table_state WHERE table_id = $1;`, [id]);
    await client.query(`DELETE FROM app.tables WHERE id = $1;`, [id]);
    await client.query(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, label, id) AS rn
        FROM app.tables
      )
      UPDATE app.tables AS t
      SET sort_order = ordered.rn
      FROM ordered
      WHERE ordered.id = t.id;
    `);
  });
}

async function setTableOrderStatusDb(tableId: string, status: OrderStatus): Promise<TableAdminSnapshot> {
  const id = normalizeTableId(tableId);
  return withTransaction(async (client: PoolClient) => {
    const snapshot = await fetchSnapshotOrThrow(id, client);
    const state = snapshot.state;
    const assignedWaiterId = status === "normal" ? state?.assignedWaiterId ?? null : null;
    const assignedWaiterName = status === "normal" ? state?.assignedWaiterName ?? null : null;
    const pendingItems = status === "normal" ? serializeOrderLines(state?.pendingItems ?? []) : serializeOrderLines([]);
    const sentItems = status === "normal" ? serializeOrderLines(state?.sentItems ?? []) : serializeOrderLines([]);
    await client.query(
      `
        INSERT INTO app.table_state (table_id, assigned_waiter_id, assigned_waiter_name, status, pending_items, sent_items, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (table_id)
        DO UPDATE SET
          assigned_waiter_id = EXCLUDED.assigned_waiter_id,
          assigned_waiter_name = EXCLUDED.assigned_waiter_name,
          status = EXCLUDED.status,
          pending_items = EXCLUDED.pending_items,
          sent_items = EXCLUDED.sent_items,
          updated_at = NOW();
      `,
      [id, assignedWaiterId, assignedWaiterName, status, pendingItems, sentItems]
    );
    if (status !== "normal") {
      await client.query(`DELETE FROM app.table_reservations WHERE table_id = $1;`, [id]);
    }
    const updated = await fetchSnapshotOrThrow(id, client);
    return composeAdminSnapshot(updated.definition, updated.state);
  });
}

async function reserveTableDb(params: {
  tableId: string;
  reservedBy: string;
  contactName?: string | null;
  contactPhone?: string | null;
  partySize?: number | null;
  scheduledFor?: string | null;
  notes?: string | null;
}): Promise<TableAdminSnapshot> {
  const id = normalizeTableId(params.tableId);
  const reservedBy = params.reservedBy.trim();
  if (!reservedBy) {
    throw new Error("Debes indicar quién realiza la reservación");
  }
  const contactName = params.contactName?.trim() || null;
  const contactPhone = params.contactPhone?.trim() || null;
  const scheduledFor = params.scheduledFor?.trim() || null;
  const notes = params.notes?.trim() || null;
  const partySize =
    typeof params.partySize === "number" && Number.isFinite(params.partySize) && params.partySize > 0
      ? Math.floor(params.partySize)
      : null;
  return withTransaction(async (client: PoolClient) => {
    const snapshot = await fetchSnapshotOrThrow(id, client);
    if (!snapshot.definition.isActive) {
      throw new Error("La mesa está inactiva");
    }
    const state = snapshot.state;
    if (state?.reservation) {
      if (state.reservation.status === "holding") {
        throw new Error("La mesa ya está reservada");
      }
      throw new Error("La mesa está ocupada");
    }
    if (state && (state.assignedWaiterId !== null || state.pendingItems.length > 0 || state.sentItems.length > 0)) {
      throw new Error("La mesa está ocupada");
    }
    const status: OrderStatus = state && (state.status === "facturado" || state.status === "anulado") ? "normal" : state?.status ?? "normal";
    const pendingItems = serializeOrderLines(state?.pendingItems ?? []);
    const sentItems = serializeOrderLines(state?.sentItems ?? []);
    await client.query(
      `
        INSERT INTO app.table_state (table_id, assigned_waiter_id, assigned_waiter_name, status, pending_items, sent_items, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (table_id)
        DO UPDATE SET
          assigned_waiter_id = EXCLUDED.assigned_waiter_id,
          assigned_waiter_name = EXCLUDED.assigned_waiter_name,
          status = EXCLUDED.status,
          pending_items = EXCLUDED.pending_items,
          sent_items = EXCLUDED.sent_items,
          updated_at = NOW();
      `,
      [id, state?.assignedWaiterId ?? null, state?.assignedWaiterName ?? null, status, pendingItems, sentItems]
    );
    await client.query(
      `
        INSERT INTO app.table_reservations (
          table_id,
          status,
          reserved_by,
          contact_name,
          contact_phone,
          party_size,
          notes,
          scheduled_for,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (table_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          reserved_by = EXCLUDED.reserved_by,
          contact_name = EXCLUDED.contact_name,
          contact_phone = EXCLUDED.contact_phone,
          party_size = EXCLUDED.party_size,
          notes = EXCLUDED.notes,
          scheduled_for = EXCLUDED.scheduled_for,
          updated_at = NOW();
      `,
      [id, "holding", reservedBy, contactName, contactPhone, partySize, notes, scheduledFor]
    );
    const updated = await fetchSnapshotOrThrow(id, client);
    return composeAdminSnapshot(updated.definition, updated.state);
  });
}

async function releaseTableReservationDb(tableId: string): Promise<TableAdminSnapshot> {
  const id = normalizeTableId(tableId);
  return withTransaction(async (client: PoolClient) => {
    const snapshot = await fetchSnapshotOrThrow(id, client);
    if (!snapshot.state?.reservation) {
      return composeAdminSnapshot(snapshot.definition, snapshot.state);
    }
    await client.query(`DELETE FROM app.table_reservations WHERE table_id = $1;`, [id]);
    await client.query(
      `
        UPDATE app.table_state
        SET updated_at = NOW()
        WHERE table_id = $1;
      `,
      [id]
    );
    const updated = await fetchSnapshotOrThrow(id, client);
    return composeAdminSnapshot(updated.definition, updated.state);
  });
}

export async function listTableZones(options?: { includeInactive?: boolean }): Promise<TableZone[]> {
  const includeInactive = options?.includeInactive ?? true;
  if (!env.useMockData) {
    const rows = await tableZoneRepository.listZones(includeInactive);
    return rows.map(toZoneSnapshotFromRow);
  }

  ensureZoneCatalogSeed();
  return Array.from(mockZoneCatalog.values())
    .filter((record) => includeInactive || record.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(toZoneSnapshot);
}

export async function createTableZone(input: { name: string; isActive?: boolean }): Promise<TableZone> {
  if (!env.useMockData) {
    const created = await tableZoneRepository.createZone({ name: input.name, isActive: input.isActive });
    return toZoneSnapshotFromRow(created);
  }

  assertMockMode();
  ensureZoneCatalogSeed();
  const name = input.name.trim();
  if (!name) {
    throw new Error("El nombre de la zona es obligatorio");
  }
  const id = normalizeZoneId(name);
  if (!id) {
    throw new Error("La zona debe tener un identificador válido");
  }
  if (mockZoneCatalog.has(id)) {
    throw new Error("Ya existe una zona con ese nombre");
  }
  const now = new Date().toISOString();
  const sortOrder = mockZoneCatalog.size + 1;
  const record: TableZoneRecord = {
    id,
    name,
    isActive: input.isActive ?? true,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  mockZoneCatalog.set(id, record);
  return toZoneSnapshot(record);
}

export async function updateTableZone(zoneId: string, patch: { name?: string; isActive?: boolean }): Promise<TableZone> {
  if (!env.useMockData) {
    const updated = await tableZoneRepository.updateZone(zoneId, {
      name: patch.name,
      isActive: patch.isActive,
    });
    return toZoneSnapshotFromRow(updated);
  }

  assertMockMode();
  ensureZoneCatalogSeed();
  const id = normalizeZoneId(zoneId);
  const current = mockZoneCatalog.get(id);
  if (!current) {
    throw new Error("Zona no encontrada");
  }
  const name = patch.name !== undefined ? patch.name.trim() : current.name;
  if (!name) {
    throw new Error("El nombre de la zona es obligatorio");
  }
  current.name = name;
  if (patch.isActive !== undefined) {
    current.isActive = patch.isActive;
  }
  current.updatedAt = new Date().toISOString();
  // Sincroniza el nombre en las mesas vinculadas
  for (const table of mockTableCatalog.values()) {
    if (table.zoneId === current.id) {
      table.zoneName = current.name;
    }
  }
  return toZoneSnapshot(current);
}

export async function deleteTableZone(zoneId: string): Promise<void> {
  assertMockMode();
  ensureZoneCatalogSeed();
  const id = normalizeZoneId(zoneId);
  const current = mockZoneCatalog.get(id);
  if (!current) {
    throw new Error("Zona no encontrada");
  }
  const inUse = Array.from(mockTableCatalog.values()).some((table) => table.zoneId === id);
  if (inUse) {
    throw new Error("No puedes eliminar una zona asignada a mesas");
  }
  mockZoneCatalog.delete(id);
  let index = 1;
  for (const record of Array.from(mockZoneCatalog.values()).sort((a, b) => a.sortOrder - b.sortOrder)) {
    record.sortOrder = index++;
  }
}
