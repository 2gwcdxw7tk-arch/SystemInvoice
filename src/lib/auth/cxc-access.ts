import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { forbiddenResponse, hasPermission, isAdministrator, requireSession } from "@/lib/auth/access";
import { env } from "@/lib/env";

export const CXC_PERMISSIONS = {
  MENU_VIEW: "menu.cxc.view",
  CUSTOMERS_MANAGE: "customers.manage",
  PAYMENT_TERMS_MANAGE: "payment-terms.manage",
  CUSTOMER_DOCUMENTS_MANAGE: "customer.documents.manage",
  CUSTOMER_DOCUMENTS_APPLY: "customer.documents.apply",
  CUSTOMER_CREDIT_MANAGE: "customer.credit.manage",
  CUSTOMER_COLLECTIONS_MANAGE: "customer.collections.manage",
  CUSTOMER_DISPUTES_MANAGE: "customer.disputes.manage",
} as const;

export type CxcPermissionCode = (typeof CXC_PERMISSIONS)[keyof typeof CXC_PERMISSIONS];

type RequireCxCPermissionOptions = {
  anyOf: CxcPermissionCode[];
  message?: string;
};

type RequireResult = Awaited<ReturnType<typeof requireSession>>;

/**
 * Require CXC permissions for an API route.
 * 
 * IMPORTANT: This guard also verifies that the system is running in retail mode.
 * CXC APIs are completely disabled in restaurant mode, regardless of user permissions.
 */
export async function requireCxCPermissions(
  request: NextRequest,
  options: RequireCxCPermissionOptions,
): Promise<RequireResult | { response: NextResponse }> {
  // First check: CXC is only available in retail mode
  if (!env.features.retailModeEnabled) {
    return {
      response: NextResponse.json(
        {
          success: false,
          message: "El módulo de Cuentas por Cobrar no está disponible en modo restaurante",
          code: "FEATURE_DISABLED",
        },
        { status: 403 }
      ),
    };
  }

  const sessionResult = await requireSession(request, { message: options.message });
  if ("response" in sessionResult) {
    return sessionResult;
  }

  const { session } = sessionResult;
  const hasAccess =
    isAdministrator(session) || options.anyOf.some((permissionCode) => hasPermission(session, permissionCode));

  if (!hasAccess) {
    return { response: forbiddenResponse(options.message ?? "No tienes permisos para esta operación") };
  }

  return sessionResult;
}

/**
 * Check if CXC features are enabled (retail mode).
 */
export function isCxCEnabled(): boolean {
  return env.features.retailModeEnabled;
}

