import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createEmptySessionCookie, createSessionCookie, SESSION_COOKIE_NAME, SessionPayload } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { adminUserService } from "@/lib/services/AdminUserService";
import { waiterService } from "@/lib/services/WaiterService";

const loginSchema = z
  .object({
    role: z.enum(["admin", "waiter"]),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    pin: z.string().min(4).max(6).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "admin") {
      if (!data.username) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Usuario requerido", path: ["username"] });
      }
      if (!data.password) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Contraseña requerida", path: ["password"] });
      }
    }

    if (data.role === "waiter") {
      if (!data.pin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PIN requerido", path: ["pin"] });
      }
    }
  });

function extractIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return null;
}

function shouldUseSecureCookies(request: NextRequest): boolean {
  if (!env.isProduction) {
    return false;
  }
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }
  return request.nextUrl.protocol === "https:";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Datos de inicio de sesión inválidos",
        errors: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const meta = {
    ipAddress: extractIp(request),
    userAgent: request.headers.get("user-agent"),
  };

  if (payload.role === "admin") {
    const result = await adminUserService.verifyAdminCredentials(payload.username!, payload.password!, meta);
    const defaultCashRegisterAssignment = result.context?.defaultCashRegister ?? null;
    const defaultCashRegister = defaultCashRegisterAssignment
      ? {
          id: defaultCashRegisterAssignment.cashRegisterId,
          code: defaultCashRegisterAssignment.cashRegisterCode,
          name: defaultCashRegisterAssignment.cashRegisterName,
          warehouseCode: defaultCashRegisterAssignment.warehouseCode,
          warehouseName: defaultCashRegisterAssignment.warehouseName,
          defaultCustomer: defaultCashRegisterAssignment.defaultCustomer
            ? {
                id: defaultCashRegisterAssignment.defaultCustomer.id,
                code: defaultCashRegisterAssignment.defaultCustomer.code,
                name: defaultCashRegisterAssignment.defaultCustomer.name,
                paymentTermCode: defaultCashRegisterAssignment.defaultCustomer.paymentTermCode,
              }
            : null,
        }
      : null;
    const response = NextResponse.json(
      {
        success: result.success,
        message: result.message,
        user: result.user
          ? {
              ...result.user,
              roles: result.context?.roles ?? [],
              permissions: result.context?.permissions ?? [],
              defaultCashRegister: defaultCashRegisterAssignment,
              cashRegisters: result.context?.cashRegisters ?? [],
            }
          : undefined,
      },
      { status: result.success ? 200 : 401 }
    );

    const secureCookie = shouldUseSecureCookies(request);

    if (result.success && result.user) {
      const session = await createSessionCookie({
        sub: String(result.user.id),
        role: "admin",
        name: result.user.displayName ?? result.user.username,
        roles: result.context?.roles ?? [], // Asegurarse de que siempre sea un array
        permissions: result.context?.permissions ?? [], // Asegurarse de que siempre sea un array
        defaultCashRegister,
      } satisfies SessionPayload);

      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: session.value,
        httpOnly: true,
        secure: secureCookie,
        sameSite: "lax",
        expires: session.expires,
        path: "/",
      });
    } else {
      const emptySession = createEmptySessionCookie();
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: emptySession.value,
        httpOnly: true,
        secure: secureCookie,
        sameSite: "lax",
        expires: emptySession.expires,
        path: "/",
      });
    }

    return response;
  }

  const result = await waiterService.verifyWaiterPin(payload.pin!, meta);
  const response = NextResponse.json(
    {
      success: result.success,
      message: result.message,
      waiter: result.waiter,
    },
    { status: result.success ? 200 : 401 }
  );

  const secureCookie = shouldUseSecureCookies(request);

  if (result.success && result.waiter) {
    const session = await createSessionCookie({
      sub: String(result.waiter.id),
      role: "waiter",
      name: result.waiter.fullName,
      roles: ["waiter"], // Asignar rol por defecto para meseros
      permissions: [], // Sin permisos específicos por ahora
    } satisfies SessionPayload);

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.value,
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      expires: session.expires,
      path: "/",
    });
  } else {
    const emptySession = createEmptySessionCookie();
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: emptySession.value,
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      expires: emptySession.expires,
      path: "/",
    });
  }

  return response;
}
