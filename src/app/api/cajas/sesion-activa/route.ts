import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import { adminUserService } from "@/lib/services/AdminUserService";

const responseSchema = z.object({
  success: z.literal(true),
  activeSession: z
    .object({
      id: z.number(),
      status: z.enum(["OPEN", "CLOSED", "CANCELLED"]),
      openingAmount: z.number(),
      openingAt: z.string(),
      openingNotes: z.string().nullable(),
      cashRegister: z.object({
        cashRegisterId: z.number(),
        cashRegisterCode: z.string(),
        cashRegisterName: z.string(),
        warehouseCode: z.string(),
        warehouseName: z.string(),
      }),
    })
    .nullable(),
  cashRegisters: z.array(
    z.object({
      cashRegisterId: z.number(),
      cashRegisterCode: z.string(),
      cashRegisterName: z.string(),
      allowManualWarehouseOverride: z.boolean(),
      warehouseId: z.number(),
      warehouseCode: z.string(),
      warehouseName: z.string(),
      isDefault: z.boolean(),
    })
  ),
  defaultCashRegisterId: z.number().nullable(),
  recentSessions: z.array(
    z.object({
      id: z.number(),
      status: z.enum(["OPEN", "CLOSED", "CANCELLED"]),
      openingAmount: z.number(),
      openingAt: z.string(),
      closingAmount: z.number().nullable(),
      closingAt: z.string().nullable(),
      cashRegister: z.object({
        code: z.string(),
        name: z.string(),
        warehouseCode: z.string(),
        warehouseName: z.string(),
      }),
    })
  ),
  operators: z
    .array(
      z.object({
        adminUserId: z.number(),
        username: z.string(),
        displayName: z.string().nullable(),
        roles: z.array(z.string()),
      })
    )
    .optional(),
  overview: z
    .object({
      registers: z.array(
        z.object({
          cashRegisterId: z.number(),
          cashRegisterCode: z.string(),
          cashRegisterName: z.string(),
          warehouseCode: z.string(),
          warehouseName: z.string(),
          allowManualWarehouseOverride: z.boolean(),
          isActive: z.boolean(),
          assignments: z.array(
            z.object({
              adminUserId: z.number(),
              username: z.string(),
              displayName: z.string().nullable(),
              isDefault: z.boolean(),
            })
          ),
          activeSession: z
            .object({
              id: z.number(),
              adminUserId: z.number(),
              adminUsername: z.string(),
              adminDisplayName: z.string().nullable(),
              openingAt: z.string(),
              openingAmount: z.number(),
            })
            .nullable(),
        })
      ),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canAccess =
    roles.includes("FACTURADOR") ||
    roles.includes("ADMINISTRADOR") ||
    permissions.some((perm) =>
      perm === "cash.register.open" || perm === "cash.register.close" || perm === "cash.report.view"
    );

  if (!canAccess) {
    return NextResponse.json({ success: false, message: "No tienes permisos para operar cajas" }, { status: 403 });
  }

  const adminId = Number(session.sub);
  const isAdministrator =
    roles.includes("ADMINISTRADOR") ||
    permissions.some((perm) => perm === "admin.users.manage" || perm === "menu.roles.view");

  const assignmentsPromise = cashRegisterService.listCashRegistersForAdmin(adminId);
  const activeSessionPromise = cashRegisterService.getActiveCashRegisterSessionByAdmin(adminId);
  const recentSessionsPromise = cashRegisterService.listRecentCashRegisterSessions(adminId, { limit: 20 });

  let adminOverview:
    | {
        registers: Array<{
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
        }>;
      }
    | undefined;
  let operatorDirectory:
    | Array<{ adminUserId: number; username: string; displayName: string | null; roles: string[] }>
    | undefined;
  let accessibleRegisters: Array<{
    cashRegisterId: number;
    cashRegisterCode: string;
    cashRegisterName: string;
    allowManualWarehouseOverride: boolean;
    warehouseId: number;
    warehouseCode: string;
    warehouseName: string;
    isDefault: boolean;
  }> | undefined;

  if (isAdministrator) {
    const [allRegisters, assignmentGroups, openSessions, adminDirectory] = await Promise.all([
      cashRegisterService.listCashRegisters({ includeInactive: true }),
      cashRegisterService.listCashRegisterAssignments(),
      cashRegisterService.listActiveCashRegisterSessions(),
      adminUserService.listAdminDirectory({ includeInactive: false }),
    ]);

    const assignmentsByRegister = new Map<
      number,
      Array<{ adminUserId: number; isDefault: boolean }>
    >();

    for (const group of assignmentGroups) {
      for (const assignment of group.assignments) {
        const bucket = assignmentsByRegister.get(assignment.cashRegisterId) ?? [];
        bucket.push({ adminUserId: group.adminUserId, isDefault: assignment.isDefault });
        assignmentsByRegister.set(assignment.cashRegisterId, bucket);
      }
    }

    const directoryMap = new Map(adminDirectory.map((entry) => [entry.id, entry] as const));

    const openSessionByRegister = new Map<number, typeof openSessions[number]>();
    for (const sessionRecord of openSessions) {
      openSessionByRegister.set(sessionRecord.cashRegister.cashRegisterId, sessionRecord);
    }

    adminOverview = {
      registers: allRegisters.map((register) => {
        const assignmentsForRegister = assignmentsByRegister.get(register.id) ?? [];
        const assignmentsWithNames = assignmentsForRegister.map((assignment) => {
          const directoryEntry = directoryMap.get(assignment.adminUserId);
          return {
            adminUserId: assignment.adminUserId,
            username: directoryEntry?.username ?? String(assignment.adminUserId),
            displayName: directoryEntry?.displayName ?? directoryEntry?.username ?? null,
            isDefault: assignment.isDefault,
          };
        });

        const activeSessionRecord = openSessionByRegister.get(register.id) ?? null;
        const sessionOperator = activeSessionRecord
          ? directoryMap.get(activeSessionRecord.adminUserId)
          : null;

        return {
          cashRegisterId: register.id,
          cashRegisterCode: register.code,
          cashRegisterName: register.name,
          warehouseCode: register.warehouseCode,
          warehouseName: register.warehouseName,
          allowManualWarehouseOverride: register.allowManualWarehouseOverride,
          isActive: register.isActive,
          assignments: assignmentsWithNames,
          activeSession: activeSessionRecord
            ? {
                id: activeSessionRecord.id,
                adminUserId: activeSessionRecord.adminUserId,
                adminUsername: sessionOperator?.username ?? String(activeSessionRecord.adminUserId),
                adminDisplayName:
                  sessionOperator?.displayName ?? sessionOperator?.username ?? String(activeSessionRecord.adminUserId),
                openingAt: activeSessionRecord.openingAt,
                openingAmount: activeSessionRecord.openingAmount,
              }
            : null,
        };
      }).sort((a, b) => a.cashRegisterCode.localeCompare(b.cashRegisterCode)),
    };

    const assignmentsForActingAdmin = await assignmentsPromise;
    const defaultAssignmentIds = new Set(
      assignmentsForActingAdmin.filter((assignment) => assignment.isDefault).map((assignment) => assignment.cashRegisterId)
    );

    accessibleRegisters = allRegisters
      .filter((register) => register.isActive)
      .map((register) => ({
        cashRegisterId: register.id,
        cashRegisterCode: register.code,
        cashRegisterName: register.name,
        allowManualWarehouseOverride: register.allowManualWarehouseOverride,
        warehouseId: register.warehouseId,
        warehouseCode: register.warehouseCode,
        warehouseName: register.warehouseName,
        isDefault: defaultAssignmentIds.has(register.id),
      }))
      .sort((a, b) => a.cashRegisterCode.localeCompare(b.cashRegisterCode));

    operatorDirectory = adminDirectory
      .filter((entry) => entry.isActive)
      .map((entry) => ({
        adminUserId: entry.id,
        username: entry.username,
        displayName: entry.displayName,
        roles: entry.roles,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));

    // Ensure assignments promise resolved for later usage.
    // assignmentsForActingAdmin already awaited; reuse value below via variable.
    const assignmentsResolved = assignmentsForActingAdmin;
    const [currentSession, recentSessions] = await Promise.all([activeSessionPromise, recentSessionsPromise]);

    const payload = {
      success: true as const,
      activeSession: currentSession
        ? {
            id: currentSession.id,
            status: currentSession.status,
            openingAmount: currentSession.openingAmount,
            openingAt: currentSession.openingAt,
            openingNotes: currentSession.openingNotes,
            cashRegister: {
              cashRegisterId: currentSession.cashRegister.cashRegisterId,
              cashRegisterCode: currentSession.cashRegister.cashRegisterCode,
              cashRegisterName: currentSession.cashRegister.cashRegisterName,
              warehouseCode: currentSession.cashRegister.warehouseCode,
              warehouseName: currentSession.cashRegister.warehouseName,
            },
          }
        : null,
      cashRegisters: accessibleRegisters,
      defaultCashRegisterId:
        assignmentsResolved.find((register) => register.isDefault)?.cashRegisterId ?? null,
      recentSessions: recentSessions.map((session) => ({
        id: session.id,
        status: session.status,
        openingAmount: session.openingAmount,
        openingAt: session.openingAt,
        closingAmount: session.closingAmount,
        closingAt: session.closingAt,
        cashRegister: {
          code: session.cashRegister.cashRegisterCode,
          name: session.cashRegister.cashRegisterName,
          warehouseCode: session.cashRegister.warehouseCode,
          warehouseName: session.cashRegister.warehouseName,
        },
      })),
      operators: operatorDirectory,
      overview: adminOverview,
    };

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("Respuesta de /api/cajas/sesion-activa no válida", parsed.error.flatten());
      return NextResponse.json({ success: false, message: "No se pudo obtener la información de la caja" }, { status: 500 });
    }

    return NextResponse.json(parsed.data, { status: 200 });
  }

  const [assignments, currentSession, recentSessions] = await Promise.all([
    assignmentsPromise,
    activeSessionPromise,
    recentSessionsPromise,
  ]);

  const payload = {
    success: true as const,
    activeSession: currentSession
      ? {
          id: currentSession.id,
          status: currentSession.status,
          openingAmount: currentSession.openingAmount,
          openingAt: currentSession.openingAt,
          openingNotes: currentSession.openingNotes,
          cashRegister: {
            cashRegisterId: currentSession.cashRegister.cashRegisterId,
            cashRegisterCode: currentSession.cashRegister.cashRegisterCode,
            cashRegisterName: currentSession.cashRegister.cashRegisterName,
            warehouseCode: currentSession.cashRegister.warehouseCode,
            warehouseName: currentSession.cashRegister.warehouseName,
          },
        }
      : null,
    cashRegisters: assignments,
    defaultCashRegisterId: assignments.find((register) => register.isDefault)?.cashRegisterId ?? null,
      recentSessions: recentSessions.map((session) => ({
        id: session.id,
        status: session.status,
        openingAmount: session.openingAmount,
        openingAt: session.openingAt,
        closingAmount: session.closingAmount,
        closingAt: session.closingAt,
        cashRegister: {
          code: session.cashRegister.cashRegisterCode,
          name: session.cashRegister.cashRegisterName,
          warehouseCode: session.cashRegister.warehouseCode,
          warehouseName: session.cashRegister.warehouseName,
        },
      })),
  };

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("Respuesta de /api/cajas/sesion-activa no válida", parsed.error.flatten());
    return NextResponse.json({ success: false, message: "No se pudo obtener la información de la caja" }, { status: 500 });
  }

  return NextResponse.json(parsed.data, { status: 200 });
}
