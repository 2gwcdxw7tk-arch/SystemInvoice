import type { NextRequest } from "next/server";

import { forbiddenResponse, hasPermission, isAdministrator, requireSession } from "@/lib/auth/access";

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

export async function requireCxCPermissions(
  request: NextRequest,
  options: RequireCxCPermissionOptions,
): Promise<RequireResult> {
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
